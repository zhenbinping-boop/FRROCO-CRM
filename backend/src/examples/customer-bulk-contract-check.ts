import assert from "node:assert/strict";
import { customerBatchChangesSchema, customerBatchIdsSchema, customerBatchWhere, splitBatchDeleteTargets } from "../lib/customer-bulk.js";

const selfUser = {
  id: "user-1", roleCode: "SALES_REP", dataScope: "SELF" as const,
  organizationId: "org-1", organizationIds: ["org-1"],
};

assert.deepEqual(customerBatchIdsSchema.parse({ ids: ["c-1", "c-2"] }), { ids: ["c-1", "c-2"] });
assert.equal(customerBatchIdsSchema.parse({ ids: ["c-1"] }).ids.length, 1);
assert.equal(customerBatchIdsSchema.parse({ ids: Array.from({ length: 100 }, (_, i) => `c-${i}`) }).ids.length, 100);
assert.throws(() => customerBatchIdsSchema.parse({ ids: ["   "] }), /Too small|至少/);
assert.throws(() => customerBatchIdsSchema.parse({ ids: ["c-1", "c-1"] }), /不能重复/);
assert.throws(() => customerBatchIdsSchema.parse({ ids: Array.from({ length: 101 }, (_, i) => `c-${i}`) }), /最多 100/);
assert.deepEqual(customerBatchChangesSchema.parse({ tier: "A", notes: "" }), { tier: "A", notes: "" });
assert.throws(() => customerBatchChangesSchema.parse({}), /至少修改一个字段/);
assert.throws(() => customerBatchChangesSchema.parse({ storeId: "store-2" }), /不允许/);
assert.deepEqual(customerBatchWhere(selfUser, ["c-1"]), {
  AND: [{ OR: [{ salesRepId: "user-1" }, { designerId: "user-1" }] }, { id: { in: ["c-1"] } }],
});
assert.deepEqual(splitBatchDeleteTargets([
  { id: "c-1", _count: { orders: 0 } },
  { id: "c-2", _count: { orders: 2 } },
]), {
  deletableIds: ["c-1"],
  failed: [{ id: "c-2", code: "CUSTOMER_HAS_ORDERS", message: "该客户已有订单或回款记录，不能直接删除" }],
});

console.log("customer bulk contract: pass");
