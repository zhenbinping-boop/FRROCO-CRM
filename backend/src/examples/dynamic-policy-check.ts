import assert from "node:assert/strict";
import { customerAccessWhere } from "../lib/access.js";
import type { PolicyUser } from "../lib/access.js";
import { hasPermission } from "../middleware/authorization.js";
import type { AuthUser } from "../lib/auth-user-cache.js";

const userFor = (overrides: Partial<AuthUser>): AuthUser => ({
  id: "user-1", email: "user@example.com", role: "SALES_REP", roleId: "role-1",
  roleCode: "CUSTOM_ROLE", dataScope: "SELF", permissions: new Set(), active: true,
  organizationId: "org-1", organizationType: "DIRECT_STORE", organizationIds: ["org-1"],
  ...overrides,
});
const requestFor = (user: AuthUser): PolicyUser => user;

const self = requestFor(userFor({ roleCode: "SALES_REP" }));
assert.deepEqual(customerAccessWhere(self), {
  OR: [{ salesRepId: "user-1" }, { designerId: "user-1" }],
});

const department = requestFor(userFor({ id: "user-2", dataScope: "DEPARTMENT", organizationId: "org-2", organizationIds: ["org-2"] }));
assert.deepEqual(customerAccessWhere(department), {
  store: { organizationId: { in: ["org-2"] } },
});

const subDepartment = requestFor(userFor({ id: "user-3", roleCode: "MANAGER", dataScope: "SUB_DEPARTMENT", organizationId: "org-3", organizationIds: ["org-3", "org-4", "org-5"] }));
assert.deepEqual(customerAccessWhere(subDepartment), {
  store: { organizationId: { in: ["org-3", "org-4", "org-5"] } },
});

const all = requestFor(userFor({ id: "user-4", roleCode: "SUPER_ADMIN", dataScope: "ALL", organizationId: null, organizationIds: [] }));
assert.deepEqual(customerAccessWhere(all), {});

assert.equal(hasPermission({ ...all, permissions: new Set(["customer.read"]) }, "customer.read"), true);
assert.equal(hasPermission(self, "customer.read"), false);
assert.equal(hasPermission(userFor({ permissions: new Set(["customer.read"]) }), "customer.read"), true);
assert.equal(hasPermission(userFor({ permissions: new Set(["customer.read"]) }), "customer.delete"), false);

console.log("动态数据权限自检通过");
