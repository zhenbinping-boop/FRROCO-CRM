import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import { Prisma, UserRole } from "@prisma/client";
import { Buffer } from "node:buffer";
import { z } from "zod";

import { AppError, validate } from "../lib/http.js";
import { invalidateAuthUser } from "../lib/auth-user-cache.js";
import { prisma } from "../lib/prisma.js";
import { removesAdminAccess, removesOwnAdminAccess } from "../lib/user-policy.js";
import { userPlacementError } from "../lib/user-placement.js";

const roles = ["ADMIN", "SALES_REP", "DESIGNER", "DEALER_USER"] as const;
const emptyQueryValue = (value: unknown) => value === "" ? undefined : value;
const safeUserSelect = {
  id: true,
  email: true,
  phone: true,
  name: true,
  role: true,
  active: true,
  organizationId: true,
  organization: { select: { id: true, code: true, name: true, type: true } },
  positionId: true,
  position: { select: { id: true, name: true, dealerOnly: true, active: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const currentUserSelect = {
  id: true,
  email: true,
  phone: true,
  name: true,
  role: true,
  active: true,
  organizationId: true,
  avatarData: true,
  organization: { select: { id: true, code: true, name: true, type: true } },
  positionId: true,
  position: { select: { id: true, name: true, dealerOnly: true, active: true } },
} satisfies Prisma.UserSelect;

export const userListQuerySchema = z.object({
  search: z.preprocess(emptyQueryValue, z.string().trim().max(100).optional()),
  role: z.preprocess(emptyQueryValue, z.enum(roles).optional()),
  active: z.preprocess(emptyQueryValue, z.enum(["true", "false"]).transform((value) => value === "true").optional()),
  organizationId: z.preprocess(emptyQueryValue, z.string().trim().min(1).optional()),
  positionId: z.preprocess(emptyQueryValue, z.string().trim().min(1).optional()),
  page: z.preprocess(emptyQueryValue, z.coerce.number().int().min(1).default(1)),
  pageSize: z.preprocess(emptyQueryValue, z.coerce.number().int().min(1).max(100).default(50)),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(6).max(32).nullable().optional(),
  password: z.string().min(8).max(128),
  role: z.enum(roles),
  active: z.boolean().optional(),
  organizationId: z.string().trim().min(1).nullable().optional(),
  positionId: z.string().trim().min(1),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(160).optional(),
  phone: z.string().trim().min(6).max(32).nullable().optional(),
  role: z.enum(roles).optional(),
  active: z.boolean().optional(),
  organizationId: z.string().trim().min(1).nullable().optional(),
  positionId: z.string().trim().min(1).nullable().optional(),
}).refine((input) => Object.keys(input).length > 0, { message: "至少提交一个需要修改的字段" });

const positionInput = z.object({
  name: z.string().trim().min(1).max(100),
  dealerOnly: z.boolean().default(false),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
}).refine((input) => input.currentPassword !== input.newPassword, {
  message: "新密码不能与当前密码相同",
  path: ["newPassword"],
});

const avatarSchema = z.object({ dataUrl: z.string().min(32).max(700 * 1024) });

function parseAvatarDataUrl(dataUrl: string) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new AppError(400, "INVALID_AVATAR", "头像必须是 PNG、JPG 或 WEBP 图片");
  const bytes = Buffer.from(match[2], "base64");
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!bytes.length || bytes.length > 512 * 1024 || !(isPng || isJpeg || isWebp)) {
    throw new AppError(400, "INVALID_AVATAR", "头像文件无效或超过 512KB");
  }
  return dataUrl;
}

function requireAdmin(request: Parameters<RequestHandler>[0]) {
  if (request.user?.role !== "ADMIN") throw new AppError(403, "ADMIN_REQUIRED", "仅管理员可以管理成员");
}

async function validateOrganization(organizationId: string | null | undefined) {
  if (!organizationId) return;
  const exists = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!exists) throw new AppError(400, "INVALID_ORGANIZATION", "所属机构不存在");
}

async function validateUserPlacement(role: typeof roles[number], organizationId: string | null | undefined, positionId: string | null | undefined) {
  const [organization, position] = await Promise.all([
    organizationId ? prisma.organization.findUnique({ where: { id: organizationId }, select: { type: true } }) : null,
    positionId ? prisma.position.findUnique({ where: { id: positionId }, select: { dealerOnly: true, active: true } }) : null,
  ]);
  if (positionId && (!position || !position.active)) throw new AppError(400, "INVALID_POSITION", "职位不存在或已停用");
  const placementError = userPlacementError(role, organization?.type || null, position?.dealerOnly || false);
  if (placementError === "DEALER_ORGANIZATION_REQUIRED") {
    throw new AppError(400, "DEALER_ORGANIZATION_REQUIRED", "代理商员工必须选择具体的代理商机构");
  }
  if (placementError === "DEALER_ROLE_REQUIRED") {
    throw new AppError(400, "DEALER_ROLE_REQUIRED", "代理商职位必须使用代理商用户权限角色");
  }
}

export const getMe: RequestHandler = async (request, response) => {
  const user = await prisma.user.findUnique({ where: { id: request.user?.id }, select: currentUserSelect });
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "成员不存在");
  response.json({ data: user });
};

export const listUsers: RequestHandler = async (request, response) => {
  requireAdmin(request);
  const query = validate(userListQuerySchema, request.query);
  const where: Prisma.UserWhereInput = {
    ...(query.role && { role: query.role }),
    ...(query.active !== undefined && { active: query.active }),
    ...(query.organizationId && { organizationId: query.organizationId }),
    ...(query.positionId && { positionId: query.positionId }),
    ...(query.search && {
      OR: ["name", "email", "phone"].map((field) => ({ [field]: { contains: query.search, mode: "insensitive" as const } })),
    }),
  };
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: safeUserSelect,
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  response.json({ data: users, meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } });
};

export const listOrganizations: RequestHandler = async (request, response) => {
  const organizations = await prisma.organization.findMany({
    select: { id: true, code: true, name: true, type: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  response.json({ data: organizations });
};

export const listPositions: RequestHandler = async (_request, response) => {
  const positions = await prisma.position.findMany({
    select: { id: true, name: true, dealerOnly: true, active: true, _count: { select: { users: true } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  response.json({ data: positions });
};

export const createPosition: RequestHandler = async (request, response) => {
  const input = validate(positionInput, request.body);
  const position = await prisma.position.create({ data: input, select: { id: true, name: true, dealerOnly: true, active: true } });
  response.status(201).json({ data: position });
};

export const createUser: RequestHandler = async (request, response) => {
  requireAdmin(request);
  const input = validate(createSchema, request.body);
  await validateOrganization(input.organizationId);
  await validateUserPlacement(input.role, input.organizationId, input.positionId);
  const { password, ...profile } = input;
  const user = await prisma.user.create({
    data: {
      ...profile,
      email: input.email.toLowerCase(),
      phone: input.phone || null,
      organizationId: input.organizationId || null,
      positionId: input.positionId || null,
      passwordHash: await bcrypt.hash(password, 12),
    },
    select: safeUserSelect,
  });
  response.status(201).json({ data: user });
};

export const updateUser: RequestHandler = async (request, response) => {
  requireAdmin(request);
  const input = validate(updateSchema, request.body);
  const userId = String(request.params.id);
  await validateOrganization(input.organizationId);
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, active: true, organizationId: true, positionId: true } });
  if (!existing) throw new AppError(404, "USER_NOT_FOUND", "成员不存在");
  await validateUserPlacement(input.role || existing.role, input.organizationId === undefined ? existing.organizationId : input.organizationId, input.positionId === undefined ? existing.positionId : input.positionId);

  if (removesOwnAdminAccess(existing.id === request.user?.id, existing, input)) {
    throw new AppError(400, "CANNOT_DISABLE_SELF", "不能停用自己或移除自己的管理员角色");
  }
  if (removesAdminAccess(existing, input) && await prisma.user.count({ where: { role: UserRole.ADMIN, active: true } }) <= 1) {
    throw new AppError(409, "LAST_ADMIN", "系统必须保留至少一名启用中的管理员");
  }

  const user = await prisma.user.update({
    where: { id: existing.id },
    data: {
      ...input,
      ...(input.email && { email: input.email.toLowerCase() }),
      ...(input.phone !== undefined && { phone: input.phone || null }),
      ...(input.organizationId !== undefined && { organizationId: input.organizationId || null }),
      ...(input.positionId !== undefined && { positionId: input.positionId || null }),
    },
    select: safeUserSelect,
  });
  invalidateAuthUser(user.id);
  response.json({ data: user });
};

export const deleteUser: RequestHandler = async (request, response) => {
  requireAdmin(request);
  const userId = String(request.params.id);
  if (userId === request.user?.id) throw new AppError(400, "CANNOT_DELETE_SELF", "不能删除当前登录账号");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, active: true } });
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "成员不存在");
  if (user.role === "ADMIN" && user.active && await prisma.user.count({ where: { role: UserRole.ADMIN, active: true } }) <= 1) {
    throw new AppError(409, "LAST_ADMIN", "系统必须保留至少一名启用中的管理员");
  }
  const [customerCount, openTaskCount] = await Promise.all([
    prisma.customer.count({ where: { OR: [{ salesRepId: user.id }, { designerId: user.id }] } }),
    prisma.task.count({ where: { assigneeId: user.id, status: "PENDING" } }),
  ]);
  if (customerCount || openTaskCount) {
    throw new AppError(409, "USER_IN_USE", `该成员仍关联 ${customerCount} 位客户、${openTaskCount} 个未完成任务，请先完成交接或停用账号`);
  }
  await prisma.user.delete({ where: { id: user.id } });
  invalidateAuthUser(user.id);
  response.status(204).send();
};

export const changeMyPassword: RequestHandler = async (request, response) => {
  const input = validate(passwordSchema, request.body);
  const user = await prisma.user.findUnique({ where: { id: request.user?.id }, select: { id: true, passwordHash: true } });
  if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    throw new AppError(400, "INVALID_CURRENT_PASSWORD", "当前密码不正确");
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(input.newPassword, 12) } });
  invalidateAuthUser(user.id);
  response.status(204).send();
};

export const changeMyAvatar: RequestHandler = async (request, response) => {
  const input = validate(avatarSchema, request.body);
  const avatarData = parseAvatarDataUrl(input.dataUrl);
  await prisma.user.update({ where: { id: request.user?.id }, data: { avatarData } });
  response.json({ data: { avatarData } });
};
