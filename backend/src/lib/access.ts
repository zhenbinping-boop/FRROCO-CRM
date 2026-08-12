import type { Prisma } from "@prisma/client";
import type { Request } from "express";

import { AppError } from "./http.js";
import { prisma } from "./prisma.js";

export function hasGlobalBusinessAccess(request: Request): boolean {
  return request.user?.role === "ADMIN" || request.user?.organizationType === "HEADQUARTERS";
}

export function customerAccessWhere(request: Request): Prisma.CustomerWhereInput {
  if (hasGlobalBusinessAccess(request)) return {};
  if (!request.user?.organizationId) throw new AppError(403, "ORGANIZATION_REQUIRED", "当前账号未关联组织");
  return { store: { organizationId: request.user.organizationId } };
}

export function assertOrganizationAccess(request: Request, organizationId: string | null): void {
  if (hasGlobalBusinessAccess(request)) return;
  if (!request.user?.organizationId || request.user.organizationId !== organizationId) {
    throw new AppError(403, "FORBIDDEN", "无权访问其他组织的数据");
  }
}

export async function assertUserAssignmentAccess(request: Request, userIds: Array<string | null | undefined>): Promise<void> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, organizationId: true } });
  if (users.length !== ids.length) throw new AppError(400, "INVALID_USER", "指定成员不存在");
  if (!hasGlobalBusinessAccess(request) && users.some((user) => user.organizationId !== request.user?.organizationId)) {
    throw new AppError(403, "FORBIDDEN", "无权关联其他组织的成员");
  }
}
