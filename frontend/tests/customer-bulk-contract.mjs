import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, apiPages, bulk, detail, api, shell, globalCss] = await Promise.all([
  readFile(new URL("../customers.html", import.meta.url), "utf8"),
  readFile(new URL("../assets/api-pages.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/customer-bulk.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/customer-detail.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/api.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/module-shell.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/global.css", import.meta.url), "utf8"),
]);

assert.match(html, /data-customer-bulk-toolbar/);
assert.match(html, /customer-bulk\.js/);
assert.match(apiPages, /data-customer-id/);
assert.match(apiPages, /FarockCustomers/);
assert.match(apiPages, /customer-detail\.html/);
assert.match(apiPages, /if \(!grid\) throw/);
assert.match(bulk, /customerBatch/);
assert.match(bulk, /MAX_SELECTED = 100/);
assert.match(bulk, /target\.checked = false/);
assert.match(bulk, /focusCustomerGrid/);
assert.match(bulk, /customers\/batch-delete/);
assert.match(bulk, /selectedIds\.clear\(\)/);
assert.match(bulk, /FarockCustomers\?\.refresh/);
assert.match(bulk, /farock:customers-loaded/);
assert.match(bulk, /deleteSelected\.busy/);
assert.match(bulk, /第二次确认/);
assert.match(bulk, /confirmTransactions: true/);
assert.equal((bulk.match(/window\.confirm/g) || []).length, 2);
assert.match(bulk, /FarockCustomerBulkLoaded/);
assert.match(bulk, /target\.checked = false/);
assert.match(detail, /第二次确认/);
assert.match(detail, /api\.delete\([^\n]*confirmTransactions: true/);
assert.equal((detail.match(/window\.confirm/g) || []).length, 2);
assert.match(api, /delete: \(path, body\)/);
assert.match(shell, /customer-bulk\.js/);
assert.match(globalCss, /farock-customer-select input:focus-visible/);
assert.match(globalCss, /farock-customer-select:has\(input:focus-visible\)/);

console.log("customer bulk frontend contract: pass");
