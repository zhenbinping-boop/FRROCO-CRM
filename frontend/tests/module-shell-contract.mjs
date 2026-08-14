import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(testDir, "..", "assets", "module-shell.js");
assert.ok(fs.existsSync(sourcePath), "module-shell.js must exist");

const source = fs.readFileSync(sourcePath, "utf8");
for (const route of ["dashboard.html", "customers.html", "follow-up-tasks.html", "channel-analysis.html", "orders-payments.html", "master-data.html"]) {
  assert.match(source, new RegExp(route.replaceAll(".", "\\.")), `route missing: ${route}`);
}
assert.match(source, /history\.pushState/);
assert.match(source, /popstate/);
assert.match(source, /fetch\(/);
assert.match(source, /replaceWith/);
assert.match(source, /navigationInFlight/);
assert.match(source, /farock-modal-backdrop/);
assert.match(source, /refreshPage\(previousPage/);
assert.doesNotMatch(source, /location\.href\s*=\s*target/);

const apiPages = fs.readFileSync(path.join(testDir, "..", "assets", "api-pages.js"), "utf8");
assert.match(apiPages, /ranking\.closest\("main"\)/);
assert.match(apiPages, /dashboard\.querySelector\(/);

console.log("module-shell-contract: pass");
