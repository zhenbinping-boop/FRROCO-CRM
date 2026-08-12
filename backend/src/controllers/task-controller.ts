import type { RequestHandler } from "express";
import { z } from "zod";

import { assertUserAssignmentAccess, customerAccessWhere } from "../lib/access.js";
import { AppError } from "../lib/http.js";
import { validate } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

export const listTasks: RequestHandler = async (request, response) => {
  const query = validate(z.object({ customerId: z.string().optional(), assigneeId: z.string().optional(), status: z.enum(["PENDING", "COMPLETED", "CANCELED"]).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }), request.query);
  const { page, pageSize, ...filters } = query;
  const where = { ...filters, customer: customerAccessWhere(request) };
  const tasks = await prisma.task.findMany({
    where, include: { customer: true, assignee: { select: { id: true, name: true, role: true } }, followUps: { orderBy: { followedAt: "desc" }, take: 10 } },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize,
  });
  const total = await prisma.task.count({ where });
  response.json({ data: tasks, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
};

export const createTask: RequestHandler = async (request, response) => {
  const input = validate(z.object({
    title: z.string().trim().min(1).max(160), content: z.string().optional(), customerId: z.string().min(1), assigneeId: z.string().optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"), dueAt: z.coerce.date(),
  }), request.body);
  const customer = await prisma.customer.findFirst({ where: { id: input.customerId, ...customerAccessWhere(request) }, select: { id: true } });
  if (!customer) throw new AppError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
  await assertUserAssignmentAccess(request, [input.assigneeId]);
  const task = await prisma.task.create({ data: input, include: { customer: true, assignee: true } });
  response.status(201).json({ data: task });
};

export const updateTask: RequestHandler = async (request, response) => {
  const { id } = validate(z.object({ id: z.string().min(1) }), request.params);
  const input = validate(z.object({
    status: z.enum(["PENDING", "COMPLETED", "CANCELED"]).optional(), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
    content: z.string().optional(), dueAt: z.coerce.date().optional(), assigneeId: z.string().nullable().optional(),
    followUp: z.object({ content: z.string().trim().min(1), nextFollowUpAt: z.coerce.date().optional() }).optional(),
  }), request.body);
  const existing = await prisma.task.findFirst({ where: { id, customer: customerAccessWhere(request) }, select: { id: true } });
  if (!existing) throw new AppError(404, "TASK_NOT_FOUND", "任务不存在");
  await assertUserAssignmentAccess(request, [input.assigneeId]);
  const task = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id }, data: { status: input.status, priority: input.priority, content: input.content, dueAt: input.dueAt, assigneeId: input.assigneeId,
        ...(input.status === "COMPLETED" && { completedAt: new Date() }), ...(input.status && input.status !== "COMPLETED" && { completedAt: null }) },
    });
    if (input.followUp) await tx.followUp.create({ data: { ...input.followUp, taskId: id, customerId: updated.customerId, authorId: request.user?.id } });
    return tx.task.findUniqueOrThrow({ where: { id }, include: { customer: true, assignee: true, followUps: { orderBy: { followedAt: "desc" } } } });
  });
  response.json({ data: task });
};
