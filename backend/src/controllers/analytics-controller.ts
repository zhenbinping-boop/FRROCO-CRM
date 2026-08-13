import type { RequestHandler } from "express";

import { customerAccessWhere } from "../lib/access.js";
import { prisma } from "../lib/prisma.js";

export const dashboard: RequestHandler = async (request, response) => {
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const accessWhere = customerAccessWhere(request);
  const [totalCustomers, newCustomers, contracted, revenue] = await Promise.all([
    prisma.customer.count({ where: accessWhere }),
    prisma.customer.count({ where: { ...accessWhere, createdAt: { gte: monthStart } } }),
    prisma.customer.count({ where: { ...accessWhere, stage: "CONTRACTED" } }),
    prisma.customer.aggregate({ where: accessWhere, _sum: { totalAmount: true, depositAmount: true } }),
  ]);
  const [byMode, ranking, pendingTasks] = await Promise.all([
    prisma.customer.groupBy({ by: ["storeType"], where: accessWhere, _count: { _all: true }, _sum: { totalAmount: true } }),
    prisma.customer.groupBy({ by: ["salesRepId"], where: { ...accessWhere, salesRepId: { not: null } }, _count: { _all: true }, _sum: { totalAmount: true }, orderBy: { _sum: { totalAmount: "desc" } }, take: 10 }),
    prisma.task.count({ where: { status: "PENDING", customer: accessWhere } }),
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: ranking.map((item) => item.salesRepId).filter((id): id is string => Boolean(id)) } }, select: { id: true, name: true } });
  const names = new Map(users.map((user) => [user.id, user.name]));
  response.json({ data: {
    metrics: { totalCustomers, newCustomers, contractedCustomers: contracted, conversionRate: totalCustomers ? Number(((contracted / totalCustomers) * 100).toFixed(1)) : 0,
      totalRevenue: revenue._sum.totalAmount || 0, totalDeposits: revenue._sum.depositAmount || 0, pendingTasks },
    channelComparison: byMode.map((item) => ({ storeType: item.storeType, customers: item._count._all, revenue: item._sum.totalAmount || 0 })),
    ranking: ranking.map((item, index) => ({ rank: index + 1, userId: item.salesRepId, name: names.get(item.salesRepId || "") || "未分配", customers: item._count._all, revenue: item._sum.totalAmount || 0 })),
  } });
};
