import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";

import { AppError, validate } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { removesAdminAccess, removesOwnAdminAccess } from "../lib/user-policy.js";

const roles = ["ADMIN", "SALES_REP", "DESIGNER", "DEALER_USER"] as const;
const safeUserSelect = {
  id: true,
  email: true,
  phone: true,
  name: true,
  role: true,
  active: true,
  organizationId: true,
  organization: { select: { id: true, code: true, name: true, type: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const listSchema = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(roles).optional(),
  active: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  organizationId: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(6).max(32).nullable().optional(),
  password: z.string().min(8).max(128),
  role: z.enum(roles),
  active: z.boolean().optional(),
  organizationId: z.string().trim().min(1).nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(160).optional(),
  phone: z.string().trim().min(6).max(32).nullable().optional(),
  role: z.enum(roles).optional(),
  active: z.boolean().optional(),
  organizationId: z.string().trim().min(1).nullable().optional(),
}).refine((input) => Object.keys(input).length > 0, { message: "至少提交一个需要修改的字段" });

const passwordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
}).refine((input) => input.currentPassword !== input.newPassword, {
  message: "新密码不能与当前密码相同",
  path: ["newPassword"],
});

function requireAdmin(request: Parameters<RequestHandler>[0]) {
  if (request.user?.role !== "ADMIN") throw new AppError(403, "ADMIN_REQUIRED", "仅管理员可以管理成员");
}

async function validateOrganization(organizationId: string | null | undefined) {
  if (!organizationId) return;
  const exists = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!exists) throw new AppError(400, "INVALID_ORGANIZATION", "所属机构不存在");
}

export const listUsers: RequestHandler = async (request, response) => {
  requireAdmin(request);
  const query = validate(listSchema, request.query);
  const where: Prisma.UserWhereInput = {
    ...(query.role && { role: query.role }),
    ...(query.active !== undefined && { active: query.active }),
    ...(query.organizationId && { organizationId: query.organizationId }),
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
  requireAdmin(request);
  const organizations = await prisma.organization.findMany({
    select: { id: true, code: true, name: true, type: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  response.json({ data: organizations });
};

export const createUser: RequestHandler = async (request, response) => {
  requireAdmin(request);
  const input = validate(createSchema, request.body);
  await validateOrganization(input.organizationId);
  const { password, ...profile } = input;
  const user = await prisma.user.create({
    data: {
      ...profile,
      email: input.email.toLowerCase(),
      phone: input.phone || null,
      organizationId: input.organizationId || null,
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
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, active: true } });
  if (!existing) throw new AppError(404, "USER_NOT_FOUND", "成员不存在");

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
    },
    select: safeUserSelect,
  });
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
  response.status(204).send();
};

export const changeMyPassword: RequestHandler = async (request, response) => {
  const input = validate(passwordSchema, request.body);
  const user = await prisma.user.findUnique({ where: { id: request.user?.id }, select: { id: true, passwordHash: true } });
  if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    throw new AppError(400, "INVALID_CURRENT_PASSWORD", "当前密码不正确");
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(input.newPassword, 12) } });
  response.status(204).send();
};
