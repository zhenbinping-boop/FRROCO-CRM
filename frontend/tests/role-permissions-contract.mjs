import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, script, controller] = await Promise.all([
  readFile(new URL("../users-permissions.html", import.meta.url), "utf8"),
  readFile(new URL("../assets/user-admin.js", import.meta.url), "utf8"),
  readFile(new URL("../../backend/src/controllers/user-controller.ts", import.meta.url), "utf8"),
]);

for (const selector of ["role-list", "role-create-button", "role-dialog", "role-form", "permission-list"]) {
  assert.match(html, new RegExp(`id=["']${selector}["']`), `missing #${selector}`);
}

assert.doesNotMatch(html, /name=["']role["']/, "member forms must not submit the legacy role code");
assert.equal((html.match(/name=["']roleId["']/g) || []).length, 2, "both member forms must submit roleId");

for (const request of [
  /FarockAPI\.get\(["']roles["']\)/,
  /FarockAPI\.post\(["']roles["']/,
  /FarockAPI\.patch\(`roles\/\$\{/,
  /FarockAPI\.delete\(`roles\/\$\{/,
]) {
  assert.match(script, request, `missing role API request: ${request}`);
}

assert.match(controller, /roleId:\s*true/, "safe user responses must expose roleId");
assert.match(controller, /dynamicRole:\s*\{/, "safe user responses must expose dynamicRole");
assert.match(script, /userRequestId/, "member loading must ignore stale responses");
assert.match(html, /class=["'][^"']*flex[^"']*max-h-[^"']*["'] id=["']role-form["']/, "role dialog must keep actions visible on short screens");

console.log("role permissions contract: ok");
