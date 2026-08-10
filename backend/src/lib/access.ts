import type { Prisma } from "@prisma/client";
import type { Request } from "express";

import { AppError } from "./http.js";

export function customerAccessWhere(request: Request): Prisma.CustomerWhereInput {
  if (request.user?.role === "ADMIN") return {};
  if (!request.user?.organizationId) throw new AppError(403, "ORGANIZATION_REQUIRED", "当前账号未关联组织");
  return { store: { organizationId: request.user.organizationId } };
}

export function assertOrganizationAccess(request: Request, organizationId: string | null): void {
  if (request.user?.role === "ADMIN") return;
  if (!request.user?.organizationId || request.user.organizationId !== organizationId) {
    throw new AppError(403, "FORBIDDEN", "无权访问其他组织的数据");
  }
}
