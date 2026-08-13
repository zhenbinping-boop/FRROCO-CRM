import type { RequestHandler } from "express";

import { AppError } from "../lib/http.js";

type PermissionSubject = { roleCode?: string; permissions?: ReadonlySet<string> } | undefined;

export function hasPermission(user: PermissionSubject, permission: string): boolean {
  return user?.roleCode === "SUPER_ADMIN" || user?.permissions?.has(permission) === true;
}

export function requirePermission(permission: string): RequestHandler {
  return (request, _response, next) => {
    if (!hasPermission(request.user, permission)) {
      next(new AppError(403, "PERMISSION_REQUIRED", "当前角色无权执行此操作"));
      return;
    }
    next();
  };
}

export const requireAdmin: RequestHandler = (request, _response, next) => {
  if (!hasPermission(request.user, "user.manage")) {
    next(new AppError(403, "ADMIN_REQUIRED", "仅管理员可以管理成员"));
    return;
  }
  next();
};
