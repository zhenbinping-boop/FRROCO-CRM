import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [apiPages, app, page, controller] = await Promise.all([
  readFile(new URL("../assets/api-pages.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/app.js", import.meta.url), "utf8"),
  readFile(new URL("../customers.html", import.meta.url), "utf8"),
  readFile(new URL("../../backend/src/controllers/customer-controller.ts", import.meta.url), "utf8"),
]);

assert.match(apiPages, /customerState\s*=\s*\{ page: 1, pageSize: 48 \}/);
assert.match(apiPages, /new URLSearchParams\(\{ page:/);
assert.doesNotMatch(apiPages, /totalPages > 1[\s\S]*?Promise\.all/);
assert.match(apiPages, /data-customer-page-prev/);
assert.match(apiPages, /data-customer-page-next/);
assert.match(app, /grid\._farockCustomerFilters\s*=\s*\{/);
assert.match(app, /setTimeout\(\(\) => grid\._farockLoad\?\.\(\), 250\)/);
assert.match(page, /data-customer-pagination/);
assert.match(controller, /storeId:\s*z\.string\(\)\.optional\(\)/);
assert.match(controller, /sort:\s*z\.enum\(\["recent", "name", "tier"\]\)/);
assert.match(controller, /const customerCardSelect =/);
assert.match(controller, /findMany\(\{ where, select: customerCardSelect/);
assert.match(controller, /const where: Prisma\.CustomerWhereInput = \{ AND:/);

console.log("customer list performance contract: pass");
