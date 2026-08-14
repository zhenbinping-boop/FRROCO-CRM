import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../controllers/user-controller.ts", import.meta.url), "utf8");
const authSource = await readFile(new URL("../middleware/auth.ts", import.meta.url), "utf8");
const roleSource = await readFile(new URL("../controllers/role-controller.ts", import.meta.url), "utf8");

assert.match(source, /safeUserSelect[\s\S]*?roleId:\s*true[\s\S]*?dynamicRole:\s*\{/);
assert.match(source, /currentUserSelect[\s\S]*?roleId:\s*true[\s\S]*?dynamicRole:\s*\{/);
assert.match(source, /userListQuerySchema[\s\S]*?roleId:/);
assert.match(source, /const createSchema[\s\S]*?role:\s*z\.enum\(roles\)\.optional\(\)/);
assert.match(source, /roleId:\s*z\.string\(\)[\s\S]*?至少选择一个角色/);
assert.match(source, /角色编码和角色 ID 不能同时提交/);
assert.match(source, /SUPER_ADMIN_ASSIGNMENT_FORBIDDEN/);
assert.match(source, /CANNOT_CHANGE_OWN_ROLE/);
assert.match(source, /pg_advisory_xact_lock\(hashtext\('farock:last-admin'\)\)/);
assert.match(authSource, /if \(record && !record\.dynamicRole\.active\) throw/);
assert.match(roleSource, /invalidateAuthRole\(role\.id\)/);
assert.doesNotMatch(roleSource, /tx\.user\.findMany/);
assert.match(authSource, /authCacheEpoch\(\)/);

console.log("user dynamic role contract: ok");
