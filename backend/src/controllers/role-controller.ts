import type { RequestHandler } from "express";
import { DataScope, Prisma } from "@prisma/client";
import { z } from "zod";

import { AppError, validate } from "../lib/http.js";
import { invalidateAuthRole } from "../lib/auth-user-cache.js";
import { prisma } from "../lib/prisma.js";

const roleSchema = z.object({
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
  name: z.string().trim().min(1).max(100),
  dataScope: z.nativeEnum(DataScope),
  permissionCodes: z.array(z.string().trim().min(1).max(100)).max(100),
});

const roleSelect = {
  id: true, code: true, name: true, dataScope: true, isSystem: true, active: true,
  permissions: { select: { permission: { select: { code: true, name: true } } } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleSelect;

async function permissionIds(codes: string[]) {
  const permissions = await prisma.permission.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
  if (permissions.length !== new Set(codes).size) throw new AppError(400, "INVALID_PERMISSION", "包含未定义的权限节点");
  return permissions;
}

export const listRoles: RequestHandler = async (_request, response) => {
  const roles = await prisma.role.findMany({ select: roleSelect, orderBy: [{ isSystem: "desc" }, { name: "asc" }] });
  response.json({ data: roles });
};

export const createRole: RequestHandler = async (request, response) => {
  const input = validate(roleSchema, request.body);
  const permissions = await permissionIds(input.permissionCodes);
  const role = await prisma.role.create({
    data: {
      code: input.code, name: input.name, dataScope: input.dataScope,
      permissions: { create: permissions.map(({ id }) => ({ permissionId: id })) },
    }, select: roleSelect,
  });
  response.status(201).json({ data: role });
};

export const updateRole: RequestHandler = async (request, response) => {
  const id = String(request.params.id);
  const input = validate(roleSchema.partial().extend({ active: z.boolean().optional() }), request.body);
  const current = await prisma.role.findUnique({ where: { id }, select: { id: true, isSystem: true } });
  if (!current) throw new AppError(404, "ROLE_NOT_FOUND", "角色不存在");
  if (current.isSystem) throw new AppError(400, "SYSTEM_ROLE_IMMUTABLE", "系统角色不可修改");
  const permissions = input.permissionCodes ? await permissionIds(input.permissionCodes) : undefined;
  const role = await prisma.$transaction(async (tx) => {
    await tx.role.update({ where: { id }, data: { code: input.code, name: input.name, dataScope: input.dataScope, active: input.active } });
    if (permissions) {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({ data: permissions.map(({ id: permissionId }) => ({ roleId: id, permissionId })) });
    }
    return tx.role.findUniqueOrThrow({ where: { id }, select: roleSelect });
  });
  invalidateAuthRole(role.id);
  response.json({ data: role });
};

export const deleteRole: RequestHandler = async (request, response) => {
  const id = String(request.params.id);
  const role = await prisma.role.findUnique({ where: { id }, select: { isSystem: true, _count: { select: { users: true } } } });
  if (!role) throw new AppError(404, "ROLE_NOT_FOUND", "角色不存在");
  if (role.isSystem) throw new AppError(400, "SYSTEM_ROLE_IMMUTABLE", "系统角色不可删除");
  if (role._count.users) throw new AppError(409, "ROLE_IN_USE", "角色仍绑定成员，不能删除");
  await prisma.role.delete({ where: { id } });
  response.status(204).send();
};
