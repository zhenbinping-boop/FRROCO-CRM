import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, apiPages, bulk, shell, globalCss] = await Promise.all([
  readFile(new URL("../customers.html", import.meta.url), "utf8"),
  readFile(new URL("../assets/api-pages.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/customer-bulk.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/module-shell.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/global.css", import.meta.url), "utf8"),
]);

assert.match(html, /data-customer-bulk-toolbar/);
assert.match(html, /customer-bulk\.js/);
assert.match(apiPages, /data-customer-id/);
assert.match(apiPages, /FarockCustomers/);
assert.match(apiPages, /customer-detail\.html/);
assert.match(bulk, /customerBatch/);
assert.match(bulk, /MAX_SELECTED = 100/);
assert.match(bulk, /target\.checked = false/);
assert.match(bulk, /customers\/batch-delete/);
assert.match(bulk, /selectedIds\.clear\(\)/);
assert.match(bulk, /FarockCustomers\?\.refresh/);
assert.match(bulk, /farock:customers-loaded/);
assert.match(bulk, /deleteSelected\.busy/);
assert.match(bulk, /FarockCustomerBulkLoaded/);
assert.match(bulk, /target\.checked = false/);
assert.match(shell, /customer-bulk\.js/);
assert.match(globalCss, /farock-customer-select input:focus-visible/);

console.log("customer bulk frontend contract: pass");
