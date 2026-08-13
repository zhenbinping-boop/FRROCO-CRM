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
        select: {
          id: true, email: true, role: true, active: true, organizationId: true,
          organization: { select: { type: true } },
          dynamicRole: {
            select: {
              id: true, code: true, dataScope: true, active: true,
              permissions: { select: { permission: { select: { code: true } } } },
            },
          },
        },
      });
      if (record?.dynamicRole.active) {
        let organizationIds: string[] = record.organizationId ? [record.organizationId] : [];
        if (record.dynamicRole.dataScope === "SUB_DEPARTMENT" && record.organizationId) {
          const descendants = await prisma.$queryRaw<Array<{ id: string }>>`
            WITH RECURSIVE descendants AS (
              SELECT id FROM "Organization" WHERE id = ${record.organizationId}
              UNION ALL
              SELECT child.id FROM "Organization" child
              JOIN descendants parent ON child."parentId" = parent.id
            ) SELECT id FROM descendants
          `;
          organizationIds = descendants.map(({ id }) => id);
        }
        user = {
          id: record.id, email: record.email, role: record.role, active: record.active,
          roleId: record.dynamicRole.id, roleCode: record.dynamicRole.code,
          dataScope: record.dynamicRole.dataScope,
          permissions: new Set(record.dynamicRole.permissions.map(({ permission }) => permission.code)),
          organizationId: record.organizationId,
          organizationType: record.organization?.type || null,
          organizationIds,
        };
        cacheAuthUser(user, generation);
      } else if (record) {
        user = {
          id: record.id, email: record.email, role: record.role, active: record.active,
          roleId: "legacy", roleCode: record.role === "ADMIN" ? "SUPER_ADMIN" : record.role,
          dataScope: record.role === "ADMIN" ? "ALL" : "DEPARTMENT", permissions: new Set(),
          organizationId: record.organizationId, organizationType: record.organization?.type || null,
          organizationIds: record.organizationId ? [record.organizationId] : [],
        };
        cacheAuthUser(user, generation);
      }
    }
    if (!user?.active || user.email !== payload.email) throw new Error("inactive user");
    request.user = {
      id: user.id, email: user.email, role: user.role, roleId: user.roleId, roleCode: user.roleCode,
      dataScope: user.dataScope, permissions: user.permissions, organizationId: user.organizationId,
      organizationIds: user.organizationIds, organizationType: user.organizationType,
    };
    next();
  } catch {
    next(new AppError(401, "INVALID_TOKEN", "登录凭证无效或已过期"));
  }
};
