import type { RequestHandler } from "express";

import { AppError } from "../lib/http.js";

export const requireAdmin: RequestHandler = (request, _response, next) => {
  if (request.user?.role !== "ADMIN") {
    next(new AppError(403, "ADMIN_REQUIRED", "仅管理员可以管理成员"));
    return;
  }
  next();
};
