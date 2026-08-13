import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { z } from "zod";

import { AppError, validate } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(128) });

export const login: RequestHandler = async (request, response) => {
  const input = validate(loginSchema, request.body);
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() }, include: { organization: true, position: true, dynamicRole: true } });
  if (!user?.active || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new AppError(401, "INVALID_CREDENTIALS", "邮箱或密码错误");
  }
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new AppError(500, "JWT_NOT_CONFIGURED", "服务端认证配置不完整");
  const token = jwt.sign(
    { email: user.email },
    secret,
    { subject: user.id, expiresIn: (process.env.JWT_EXPIRES_IN || "8h") as SignOptions["expiresIn"] },
  );
  response.json({ data: { token, user: { id: user.id, email: user.email, name: user.name, role: user.dynamicRole, avatarData: user.avatarData, organization: user.organization, position: user.position } } });
};
