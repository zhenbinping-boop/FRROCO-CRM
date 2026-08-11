import assert from "node:assert/strict";

import { removesAdminAccess, removesOwnAdminAccess } from "../lib/user-policy.js";

const admin = { role: "ADMIN", active: true };
assert.equal(removesAdminAccess(admin, { active: false }), true);
assert.equal(removesAdminAccess(admin, { role: "DESIGNER" }), true);
assert.equal(removesAdminAccess(admin, { role: "ADMIN", active: true }), false);
assert.equal(removesOwnAdminAccess(true, admin, { active: false }), true);
assert.equal(removesOwnAdminAccess(false, admin, { active: false }), false);
console.log("成员权限保护检查通过");
