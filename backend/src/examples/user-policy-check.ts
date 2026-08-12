import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";

import { userListQuerySchema } from "../controllers/user-controller.js";
import { removesAdminAccess, removesOwnAdminAccess } from "../lib/user-policy.js";
import { requireAdmin } from "../middleware/authorization.js";

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

let ordinaryError: unknown;
requireAdmin({ user: { role: "SALES_REP" } } as Request, {} as Response, ((error: unknown) => { ordinaryError = error; }) as NextFunction);
assert.equal((ordinaryError as { status?: number }).status, 403);
assert.equal((ordinaryError as { code?: string }).code, "ADMIN_REQUIRED");
let adminError: unknown = "not-called";
requireAdmin({ user: { role: "ADMIN" } } as Request, {} as Response, ((error: unknown) => { adminError = error; }) as NextFunction);
assert.equal(adminError, undefined);
console.log("成员权限保护检查通过");
