import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";

import { authUserGeneration, cacheAuthUser, getCachedAuthUser } from "../lib/auth-user-cache.js";
import { AppError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

export const authenticate: RequestHandler = async (request, _response, next) => {
  const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return next(new AppError(401, "UNAUTHORIZED", "请先登录"));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "");
    if (typeof payload !== "object" || typeof payload.sub !== "string" || typeof payload.email !== "string") {
      throw new Error("invalid token payload");
    }
    let user = getCachedAuthUser(payload.sub);
    if (!user) {
      const generation = authUserGeneration(payload.sub);
      const record = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, active: true, organizationId: true, organization: { select: { type: true } } },
      });
      if (record) {
        user = { ...record, organizationType: record.organization?.type || null };
        cacheAuthUser(user, generation);
      }
    }
    if (!user?.active || user.email !== payload.email) throw new Error("inactive user");
    request.user = { id: user.id, email: user.email, role: user.role, organizationId: user.organizationId, organizationType: user.organizationType };
    next();
  } catch {
    next(new AppError(401, "INVALID_TOKEN", "登录凭证无效或已过期"));
  }
};
