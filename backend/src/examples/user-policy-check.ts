import assert from "node:assert/strict";

import { userListQuerySchema } from "../controllers/user-controller.js";
import { removesAdminAccess, removesOwnAdminAccess } from "../lib/user-policy.js";

const admin = { role: "ADMIN", active: true };
assert.equal(removesAdminAccess(admin, { active: false }), true);
assert.equal(removesAdminAccess(admin, { role: "DESIGNER" }), true);
assert.equal(removesAdminAccess(admin, { role: "ADMIN", active: true }), false);
assert.equal(removesOwnAdminAccess(true, admin, { active: false }), true);
assert.equal(removesOwnAdminAccess(false, admin, { active: false }), false);
const emptyFilters = userListQuerySchema.parse({ page: "1", pageSize: "50", search: "", role: "", organizationId: "", active: "" });
assert.equal(emptyFilters.search, undefined);
assert.equal(emptyFilters.role, undefined);
assert.equal(emptyFilters.organizationId, undefined);
assert.equal(emptyFilters.active, undefined);
console.log("成员权限保护检查通过");
