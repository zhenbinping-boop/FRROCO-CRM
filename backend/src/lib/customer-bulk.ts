import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { customerAccessWhere, type PolicyUser } from "./access.js";

const uniqueIds = (ids: string[], context: z.RefinementCtx): void => {
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "客户 ID 不能重复" });
};

export const customerBatchIdsSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1, "至少选择一位客户").max(100, "一次最多 100 位客户").superRefine(uniqueIds),
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

export type BatchDeleteTarget = { id: string; _count: { orders: number } };

export function splitBatchDeleteTargets(targets: BatchDeleteTarget[]) {
  const failed = targets.filter((target) => target._count.orders > 0).map((target) => ({
    id: target.id,
    code: "CUSTOMER_HAS_ORDERS",
    message: "该客户已有订单或回款记录，不能直接删除",
  }));
  return { deletableIds: targets.filter((target) => target._count.orders === 0).map((target) => target.id), failed };
}
