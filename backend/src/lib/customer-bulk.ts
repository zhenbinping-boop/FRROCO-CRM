import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { customerAccessWhere, type PolicyUser } from "./access.js";

const uniqueIds = (ids: string[], context: z.RefinementCtx): void => {
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "客户 ID 不能重复" });
};

export const customerBatchIdsSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1, "至少选择一位客户").max(100, "一次最多 100 位客户").superRefine(uniqueIds),
});

export const customerBatchDeleteSchema = customerBatchIdsSchema.extend({
  confirmTransactions: z.boolean().default(false),
});

export const customerBatchChangesSchema = z.strictObject({
  tier: z.enum(["S", "A", "B", "C"]).optional(),
  stage: z.enum(["LEAD", "FOLLOWING", "PROPOSAL", "CONTRACTED", "LOST"]).optional(),
  customerSource: z.string().trim().max(160).optional(),
  notes: z.string().trim().optional(),
}, { error: "存在不允许批量修改的字段" }).refine((changes) => Object.keys(changes).length > 0, "至少修改一个字段");

export function customerBatchWhere(user: PolicyUser, ids: string[]): Prisma.CustomerWhereInput {
  return { AND: [customerAccessWhere(user), { id: { in: ids } }] };
}

export type BatchDeleteTarget = { id: string; _count: { orders: number; transactions: number } };

export function splitBatchDeleteTargets(targets: BatchDeleteTarget[], confirmTransactions = false) {
  const failed = targets.filter((target) => target._count.orders > 0 || (!confirmTransactions && target._count.transactions > 0)).map((target) => ({
    id: target.id,
    code: target._count.orders > 0 ? "CUSTOMER_HAS_ORDERS" : "CUSTOMER_HAS_TRANSACTIONS",
    message: target._count.orders > 0 ? "该客户已有订单，不能删除" : "该客户已有回款记录，需确认后删除",
  }));
  return {
    deletableIds: targets.filter((target) => target._count.orders === 0 && (confirmTransactions || target._count.transactions === 0)).map((target) => target.id),
    failed,
  };
}
