import type { Prisma } from "@prisma/client";
import type { Request } from "express";

import { AppError } from "./http.js";
import { prisma } from "./prisma.js";

export type PolicyUser = {
  id: string;
  roleCode: string;
  dataScope: "SELF" | "DEPARTMENT" | "SUB_DEPARTMENT" | "ALL";
  organizationId: string | null;
  organizationIds: readonly string[];
};

export function hasGlobalBusinessAccess(request: Request): boolean {
  return request.user?.dataScope === "ALL";
}

export function customerAccessWhere(userOrRequest: Request | PolicyUser): Prisma.CustomerWhereInput {
  const user = "user" in userOrRequest
    ? (userOrRequest as Request).user
    : userOrRequest as PolicyUser;
  if (!user) throw new AppError(401, "UNAUTHORIZED", "请先登录");
  if (user.dataScope === "ALL") return {};
  if (user.dataScope === "SELF") return { OR: [{ salesRepId: user.id }, { designerId: user.id }] };
  if (!user.organizationId) throw new AppError(403, "ORGANIZATION_REQUIRED", "当前账号未关联组织");
  const organizationIds = user.dataScope === "SUB_DEPARTMENT" ? user.organizationIds : [user.organizationId];
  return { store: { organizationId: { in: [...organizationIds] } } };
}

export function assertOrganizationAccess(request: Request, organizationId: string | null): void {
  if (hasGlobalBusinessAccess(request)) return;
  if (!organizationId || !request.user?.organizationIds.includes(organizationId)) {
    throw new AppError(403, "FORBIDDEN", "无权访问其他组织的数据");
  }
}

export async function assertUserAssignmentAccess(request: Request, userIds: Array<string | null | undefined>): Promise<void> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, organizationId: true } });
  if (users.length !== ids.length) throw new AppError(400, "INVALID_USER", "指定成员不存在");
  if (!hasGlobalBusinessAccess(request) && users.some((user) => !user.organizationId || !request.user?.organizationIds.includes(user.organizationId))) {
    throw new AppError(403, "FORBIDDEN", "无权关联其他组织的成员");
  }
}
