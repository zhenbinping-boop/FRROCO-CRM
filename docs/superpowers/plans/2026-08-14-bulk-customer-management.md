# 客户批量管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在客户管理列表中加入最多 100 条客户的批量修改和批量删除，复用现有权限与数据范围策略。

**Architecture:** 后端新增批量更新和批量删除接口，使用一个纯函数辅助模块统一校验 ID、允许字段、数据范围 `AND` 条件和删除结果；控制器用 Prisma transaction 完成数据库操作。前端由 `customer-bulk.js` 通过事件委托管理复选框、批量工具栏、修改弹窗和删除结果，客户卡片由 `api-pages.js` 提供稳定 ID 和刷新入口。

**Tech Stack:** Express 5、Prisma 6、Zod、原生 HTML/CSS/JavaScript、现有 `FarockAPI`、Node `assert`/`tsx` 自检脚本。

---

### Task 1: Add backend batch validation and policy helpers with failing tests

**Files:**
- Create: `backend/src/lib/customer-bulk.ts`
- Create: `backend/src/examples/customer-bulk-contract-check.ts`

- [ ] **Step 1: Write the failing helper contract test**

Create `backend/src/examples/customer-bulk-contract-check.ts` with assertions for the public helper behavior:

```ts
import assert from "node:assert/strict";
import { customerBatchChangesSchema, customerBatchIdsSchema, customerBatchWhere, splitBatchDeleteTargets } from "../lib/customer-bulk.js";

const selfUser = {
  id: "user-1", roleCode: "SALES_REP", dataScope: "SELF" as const,
  organizationId: "org-1", organizationIds: ["org-1"],
};

assert.deepEqual(customerBatchIdsSchema.parse({ ids: ["c-1", "c-2"] }), { ids: ["c-1", "c-2"] });
assert.throws(() => customerBatchIdsSchema.parse({ ids: ["c-1", "c-1"] }), /不能重复/);
assert.throws(() => customerBatchIdsSchema.parse({ ids: Array.from({ length: 101 }, (_, i) => `c-${i}`) }), /最多 100/);
assert.deepEqual(customerBatchChangesSchema.parse({ tier: "A", notes: "" }), { tier: "A", notes: "" });
assert.throws(() => customerBatchChangesSchema.parse({}), /至少修改一个字段/);
assert.throws(() => customerBatchChangesSchema.parse({ storeId: "store-2" }), /不允许/);
assert.deepEqual(customerBatchWhere(selfUser, ["c-1"]), {
  AND: [{ OR: [{ salesRepId: "user-1" }, { designerId: "user-1" }] }, { id: { in: ["c-1"] } }],
});
assert.deepEqual(splitBatchDeleteTargets([
  { id: "c-1", _count: { orders: 0, transactions: 0 } },
  { id: "c-2", _count: { orders: 2, transactions: 0 } },
]), {
  deletableIds: ["c-1"],
  failed: [{ id: "c-2", code: "CUSTOMER_HAS_ORDERS", message: "该客户已有订单或回款记录，不能直接删除" }],
});

console.log("customer bulk contract: pass");
```

- [ ] **Step 2: Run the contract and verify the expected red failure**

Run from `backend`:

```powershell
npx tsx src/examples/customer-bulk-contract-check.ts
```

Expected result: fail with a module-not-found error for `../lib/customer-bulk.js`.

- [ ] **Step 3: Implement the minimal pure helper module**

Create `backend/src/lib/customer-bulk.ts` with these exported contracts:

```ts
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { PolicyUser } from "./access.js";
import { customerAccessWhere } from "./access.js";

const uniqueIds = (ids: string[], context: z.RefinementCtx): void => {
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "客户 ID 不能重复" });
};

export const customerBatchIdsSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1, "至少选择一位客户").max(100, "一次最多处理 100 位客户").superRefine(uniqueIds),
});

export const customerBatchChangesSchema = z.object({
  tier: z.enum(["S", "A", "B", "C"]).optional(),
  stage: z.enum(["LEAD", "FOLLOWING", "PROPOSAL", "CONTRACTED", "LOST"]).optional(),
  customerSource: z.string().trim().max(160).optional(),
  notes: z.string().trim().optional(),
}).strict("存在不允许批量修改的字段").refine((changes) => Object.keys(changes).length > 0, "至少修改一个字段");

export function customerBatchWhere(user: PolicyUser, ids: string[]): Prisma.CustomerWhereInput {
  return { AND: [customerAccessWhere(user), { id: { in: ids } }] };
}

export type BatchDeleteTarget = { id: string; _count: { orders: number; transactions: number } };
export function splitBatchDeleteTargets(targets: BatchDeleteTarget[]) {
  const failed = targets.filter((target) => target._count.orders > 0 || target._count.transactions > 0).map((target) => ({
    id: target.id,
    code: "CUSTOMER_HAS_ORDERS",
    message: "该客户已有订单或回款记录，不能直接删除",
  }));
  return { deletableIds: targets.filter((target) => target._count.orders === 0 && target._count.transactions === 0).map((target) => target.id), failed };
}
```

Keep `customerBatchWhere` compatible with `Request` callers by passing `request.user` after the controller confirms authentication. Do not introduce a second data-scope implementation.

- [ ] **Step 4: Run the helper contract and typecheck**

Run:

```powershell
npx tsx src/examples/customer-bulk-contract-check.ts
npm run typecheck
```

Expected output: `customer bulk contract: pass`; TypeScript exits with code 0.

- [ ] **Step 5: Commit the helper contract**

```powershell
git add backend/src/lib/customer-bulk.ts backend/src/examples/customer-bulk-contract-check.ts
git commit -m "test: define customer bulk operation contracts"
```

### Task 2: Add protected batch customer endpoints

**Files:**
- Modify: `backend/src/controllers/customer-controller.ts`
- Modify: `backend/src/routes/index.ts`
- Test: `backend/src/examples/customer-bulk-contract-check.ts`

- [ ] **Step 1: Extend the failing contract with controller and route requirements**

Add source assertions to the contract script:

```ts
import { readFile } from "node:fs/promises";

const [routes, controller] = await Promise.all([
  readFile(new URL("../routes/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../controllers/customer-controller.ts", import.meta.url), "utf8"),
]);
assert.match(routes, /patch\("\/customers\/batch"/);
assert.match(routes, /post\("\/customers\/batch-delete"/);
assert.match(routes, /requirePermission\("customer\.update"\)/);
assert.match(routes, /requirePermission\("customer\.delete"\)/);
assert.match(controller, /prisma\.\$transaction/);
assert.match(controller, /customerBatchWhere/);
assert.match(controller, /splitBatchDeleteTargets/);
```

- [ ] **Step 2: Run the contract and verify it fails on the missing routes**

Run `npx tsx src/examples/customer-bulk-contract-check.ts` from `backend`. Expected result: an assertion failure for the missing batch route.

- [ ] **Step 3: Implement batch update in the controller**

Add `batchUpdateCustomers` after `updateCustomer` and before the import/export handlers. Validate `ids` and `changes`, build `customerBatchWhere(request.user, ids)`, then in `prisma.$transaction` require `findMany` to return every selected ID before calling `updateMany`. If counts differ, throw `AppError(409, "CUSTOMER_SELECTION_CHANGED", "客户列表已变化，请刷新后重试")`; otherwise return `{ data: { updated: ids.length } }`.

- [ ] **Step 4: Implement transactional batch delete with order protection**

Add `batchDeleteCustomers` using the same all-selected visibility check. Select `{ id, _count: { select: { orders: true, transactions: true } } }`, call `splitBatchDeleteTargets`, delete only `deletableIds` with a final data-scope and empty-association condition in `tx.customer.deleteMany`, and return `{ requested, deleted, failed }`. Keep the transaction callback free of external API calls. Align the existing single-delete endpoint with the same order and transaction protection.

- [ ] **Step 5: Register routes before the dynamic `/:id` routes**

Import both handlers and insert immediately before `apiRouter.get("/customers/:id", ...)`:

```ts
apiRouter.patch("/customers/batch", requirePermission("customer.update"), batchUpdateCustomers);
apiRouter.post("/customers/batch-delete", requirePermission("customer.delete"), batchDeleteCustomers);
```

- [ ] **Step 6: Run backend verification**

Run from `backend`:

```powershell
npx tsx src/examples/customer-bulk-contract-check.ts
npm run typecheck
npm run check:user-policy
```

Expected output: the customer bulk contract, TypeScript, and existing policy check all pass.

- [ ] **Step 7: Commit the backend endpoints**

```powershell
git add backend/src/controllers/customer-controller.ts backend/src/routes/index.ts backend/src/lib/customer-bulk.ts backend/src/examples/customer-bulk-contract-check.ts
git commit -m "feat: add protected customer bulk APIs"
```

### Task 3: Add stable card selection and list refresh hooks

**Files:**
- Modify: `frontend/assets/api-pages.js`
- Modify: `frontend/customers.html`
- Create: `frontend/assets/customer-bulk.js`
- Modify: `frontend/assets/module-shell.js`
- Create: `frontend/tests/customer-bulk-contract.mjs`

- [ ] **Step 1: Write the failing frontend contract**

Create `frontend/tests/customer-bulk-contract.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, apiPages, bulk, shell] = await Promise.all([
  readFile(new URL("../customers.html", import.meta.url), "utf8"),
  readFile(new URL("../assets/api-pages.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/customer-bulk.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/module-shell.js", import.meta.url), "utf8"),
]);
assert.match(html, /data-customer-bulk-toolbar/);
assert.match(html, /customer-bulk\.js/);
assert.match(apiPages, /data-customer-id/);
assert.match(apiPages, /FarockCustomers/);
assert.match(bulk, /customerBatch/);
assert.match(bulk, /customers\/batch-delete/);
assert.match(shell, /customer-bulk\.js/);
console.log("customer bulk frontend contract: pass");
```

- [ ] **Step 2: Run the contract and verify the expected red failure**

Run from the repository root: `node frontend/tests/customer-bulk-contract.mjs`. Expected result: fail because `frontend/assets/customer-bulk.js` does not exist.

- [ ] **Step 3: Add the toolbar mount point and script entry**

Add a hidden `[data-customer-bulk-toolbar]` section near the customer filters with a selected count, `data-customer-bulk-edit`, `data-customer-bulk-delete`, and `data-customer-bulk-clear` buttons. The edit and delete buttons start disabled. Load `assets/customer-bulk.js` after `assets/api-pages.js` in `customers.html`, and add it after `api-pages.js` in the `customers.html` entry of `module-shell.js`.

- [ ] **Step 4: Add stable IDs and the list refresh surface**

In `customerCard(customer)`, add `data-customer-id` to the outer article and a labeled checkbox with `data-customer-select`. The checkbox must not intercept the existing `查看详情` anchor. At the end of a successful `loadCustomers`, expose `window.FarockCustomers = { refresh: loadCustomers }` and dispatch `new CustomEvent("farock:customers-loaded")`. Keep filtering hooks after `grid.innerHTML` and preserve detail URLs.

- [ ] **Step 5: Implement selection state with the 100-item limit**

Create `frontend/assets/customer-bulk.js` with a `Set` of selected IDs and event delegation on `[data-customer-grid]`. The core guard is:

```js
const MAX_SELECTED = 100;
const selectedIds = new Set();

function selectCard(id, checked) {
  if (checked && !selectedIds.has(id) && selectedIds.size >= MAX_SELECTED) {
    showMessage("一次最多选择 100 位客户");
    return false;
  }
  if (checked) selectedIds.add(id); else selectedIds.delete(id);
  renderToolbar();
  return true;
}
```

“全选当前筛选结果”只处理没有 `farock-hidden` 的卡片；超过 100 条时保持原选择并提示上限。`renderToolbar()`同步隐藏状态、数量和按钮 disabled 状态。

- [ ] **Step 6: Run frontend contract and syntax checks**

Run:

```powershell
node frontend/tests/customer-bulk-contract.mjs
node --check frontend/assets/customer-bulk.js
node --check frontend/assets/api-pages.js
node --check frontend/assets/module-shell.js
```

Expected output: `customer bulk frontend contract: pass`; all syntax checks exit 0.

### Task 4: Implement bulk edit, delete confirmation, and refresh behavior

**Files:**
- Modify: `frontend/assets/customer-bulk.js`
- Modify: `frontend/assets/global.css`
- Test: `frontend/tests/customer-bulk-contract.mjs`

- [ ] **Step 1: Extend the failing contract for API calls and reset behavior**

Add and run these assertions before implementing handlers:

```js
assert.match(bulk, /FarockAPI\.patch\(["']customers\/batch/);
assert.match(bulk, /FarockAPI\.post\(["']customers\/batch-delete/);
assert.match(bulk, /selectedIds\.clear\(\)/);
assert.match(bulk, /FarockCustomers\?\.refresh/);
assert.match(bulk, /customer-detail\.html/);
```

Expected red result: the first missing API assertion fails.

- [ ] **Step 2: Implement the batch edit form and payload construction**

Add a modal/backdrop containing one enable checkbox and one control for each allowed field: `tier`, `stage`, `customerSource`, and `notes`. Build only enabled changes:

```js
const changes = {};
if (form.elements.tierEnabled.checked) changes.tier = form.elements.tier.value;
if (form.elements.stageEnabled.checked) changes.stage = form.elements.stage.value;
if (form.elements.sourceEnabled.checked) changes.customerSource = form.elements.customerSource.value.trim();
if (form.elements.notesEnabled.checked) changes.notes = form.elements.notes.value;
if (!Object.keys(changes).length) throw new Error("至少启用一个修改字段");
await window.FarockAPI.patch("/customers/batch", { ids: [...selectedIds], changes });
```

Disable submit during the request, display existing error styles on failure, and close only after success.

- [ ] **Step 3: Implement delete confirmation and partial-result messaging**

The confirmation must show the selected count and order-protection text. Submit `{ ids: [...selectedIds] }` to `/customers/batch-delete`; display either `已删除 N 位客户` or a partial result such as `已删除 N 位客户，M 位客户因已有订单或回款未删除`, followed by each returned failure message.

- [ ] **Step 4: Refresh and reset selection after mutation**

Centralize the success path:

```js
async function refreshAfterMutation() {
  selectedIds.clear();
  renderToolbar();
  await window.FarockCustomers?.refresh?.();
}
```

Call it after successful update and delete responses. If the refresh function is missing, show an error instead of leaving stale cards silently.

- [ ] **Step 5: Preserve links and cached module behavior**

Use only checkbox/button selectors in delegated handlers. Do not add a document-level handler that prevents default navigation for `customer-detail.html`. On `farock:customers-loaded`, remove checked state for IDs no longer in `selectedIds`; do not restore submitted selections after refresh.

- [ ] **Step 6: Run frontend verification and commit**

Run:

```powershell
node frontend/tests/customer-bulk-contract.mjs
node frontend/tests/module-shell-contract.mjs
node frontend/tests/role-permissions-contract.mjs
$files = @('frontend/assets/app.js','frontend/assets/layout.js','frontend/assets/module-shell.js','frontend/assets/api-pages.js','frontend/assets/customer-bulk.js'); foreach ($file in $files) { node --check $file; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }; Write-Output 'frontend-js-syntax: pass'
git diff --check
```

Expected output: all contract summaries pass, syntax prints `frontend-js-syntax: pass`, and `git diff --check` is clean.

```powershell
git add frontend/customers.html frontend/assets/api-pages.js frontend/assets/customer-bulk.js frontend/assets/module-shell.js frontend/assets/global.css frontend/tests/customer-bulk-contract.mjs
git commit -m "feat: add customer bulk management UI"
```

### Task 5: Run end-to-end verification and finish the feature

**Files:**
- No new production files.

- [ ] **Step 1: Run the complete static and backend checks**

Run:

```powershell
node frontend/tests/customer-bulk-contract.mjs
node frontend/tests/module-shell-contract.mjs
node frontend/tests/role-permissions-contract.mjs
npm run typecheck --prefix backend
npm run check:user-policy --prefix backend
git diff --check
```

Expected output: all contract checks pass, both backend commands exit 0, and no diff-check output.

- [ ] **Step 2: Start existing local services without database deployment**

Use the established frontend and backend development commands. Do not run `db push`, Prisma migrations, `db:secure`, or any RLS deployment command; this feature uses existing customer columns and policies.

- [ ] **Step 3: Verify the customer workflow in a signed-in browser**

Verify in order:

1. Cards show selection checkboxes and the toolbar is hidden with zero selection.
2. Select two visible cards; count, edit, delete, and clear controls update correctly.
3. Select one customer with an order and one without; delete reports one success and one `CUSTOMER_HAS_ORDERS` failure.
4. Edit only tier and notes; after refresh, stage/source remain unchanged and tier/notes update.
5. Attempt to select 101 cards; selection stops at 100 and shows the limit message.
6. Search/filter, then select visible results; hidden cards are not selected.
7. Switch module and return; submitted selections are gone, and customer detail links still navigate independently.

- [ ] **Step 4: Review the final diff**

Run:

```powershell
git status --short --branch
git diff HEAD^ --stat
git log -3 --oneline --decorate
```

Keep unrelated untracked `AGENTS.md`, `.agents/skills/Handover/`, and `.superpowers/` out of feature commits. Push only after the user explicitly requests it.
