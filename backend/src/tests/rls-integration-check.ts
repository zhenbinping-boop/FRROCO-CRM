import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { DataScope, PrismaClient, type Role, type User } from "@prisma/client";

import { withRlsContext } from "../lib/rls-context.js";

if (
  process.env.TEST_DATABASE_GUARD !== "farock-test-only"
  || !process.env.DATABASE_URL
  || !process.env.TEST_RLS_DATABASE_URL
) {
  console.error("[BLOCKED] TEST_DATABASE_URL and TEST_RLS_DATABASE_URL are required for RLS checks.");
  process.exit(2);
}

const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const restricted = new PrismaClient({ datasourceUrl: process.env.TEST_RLS_DATABASE_URL });
const prefix = `R${Date.now().toString(36).toUpperCase()}${randomUUID().slice(0, 6).toUpperCase()}`;
const lowerPrefix = prefix.toLowerCase();
const failures: Array<{ name: string; error: unknown }> = [];
let passed = 0;

function id(suffix: string): string {
  return `${lowerPrefix}-${suffix}`;
}

async function check(name: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`[FAIL] ${name}`);
    console.error(error instanceof Error ? error.stack || error.message : error);
  }
}

async function createRole(suffix: string, dataScope: DataScope): Promise<Role> {
  return admin.role.create({
    data: {
      id: id(`role-${suffix}`), code: `${prefix}_${suffix.toUpperCase()}`,
      name: `${prefix} ${suffix}`, dataScope,
    },
  });
}

async function createUser(suffix: string, role: Role, organizationId: string | null): Promise<User> {
  return admin.user.create({
    data: {
      id: id(`user-${suffix}`), email: `${lowerPrefix}.${suffix}@test.invalid`, name: `${prefix} ${suffix}`,
      passwordHash: "not-used-by-rls-tests", roleId: role.id, organizationId,
    },
  });
}

async function visibleCustomerIds(userId: string): Promise<string[]> {
  return withRlsContext(restricted, userId, async (tx) => {
    const customers = await tx.customer.findMany({ select: { id: true }, orderBy: { id: "asc" } });
    return customers.map(({ id }) => id);
  });
}

async function cleanup(): Promise<void> {
  await admin.customer.deleteMany({ where: { id: { startsWith: lowerPrefix } } });
  await admin.store.deleteMany({ where: { id: { startsWith: lowerPrefix } } });
  await admin.user.deleteMany({ where: { id: { startsWith: lowerPrefix } } });
  await admin.role.deleteMany({ where: { id: { startsWith: lowerPrefix } } });
  await admin.organization.deleteMany({ where: { id: { startsWith: lowerPrefix } } });
}

async function main(): Promise<void> {
  const [users, customers] = await Promise.all([admin.user.count(), admin.customer.count()]);
  if (users || customers) {
    console.error("[BLOCKED] RLS checks require the same empty disposable database used by the API integration tests.");
    process.exit(2);
  }

  const org = await admin.organization.create({
    data: { id: id("org-main"), code: `${prefix}-ORG`, name: `${prefix} Main`, type: "DIRECT_STORE" },
  });
  const childOrg = await admin.organization.create({
    data: { id: id("org-child"), code: `${prefix}-CHILD`, name: `${prefix} Child`, type: "DIRECT_STORE", parentId: org.id },
  });
  const otherOrg = await admin.organization.create({
    data: { id: id("org-other"), code: `${prefix}-OTHER`, name: `${prefix} Other`, type: "DIRECT_STORE" },
  });
  const stores = await Promise.all([
    admin.store.create({ data: {
      id: id("store-main"), code: `${prefix}-STORE`, storeName: `${prefix} Main Store`, storeType: "DIRECT",
      regionProvince: "Test Province", regionCity: "Test City", organizationId: org.id,
    } }),
    admin.store.create({ data: {
      id: id("store-child"), code: `${prefix}-CSTORE`, storeName: `${prefix} Child Store`, storeType: "DIRECT",
      regionProvince: "Test Province", regionCity: "Test City", organizationId: childOrg.id,
    } }),
    admin.store.create({ data: {
      id: id("store-other"), code: `${prefix}-OSTORE`, storeName: `${prefix} Other Store`, storeType: "DIRECT",
      regionProvince: "Test Province", regionCity: "Test City", organizationId: otherOrg.id,
    } }),
  ]);
  const [selfRole, departmentRole, subRole, allRole] = await Promise.all([
    createRole("self", DataScope.SELF),
    createRole("department", DataScope.DEPARTMENT),
    createRole("sub", DataScope.SUB_DEPARTMENT),
    createRole("all", DataScope.ALL),
  ]);
  const [selfUser, departmentUser, subUser, allUser, otherUser] = await Promise.all([
    createUser("self", selfRole, org.id),
    createUser("department", departmentRole, org.id),
    createUser("sub", subRole, org.id),
    createUser("all", allRole, null),
    createUser("other", selfRole, otherOrg.id),
  ]);
  const customerData = [
    { id: id("customer-1"), name: `${prefix}-1`, storeId: stores[0].id, salesRepId: selfUser.id },
    { id: id("customer-2"), name: `${prefix}-2`, storeId: stores[0].id, designerId: selfUser.id },
    { id: id("customer-3"), name: `${prefix}-3`, storeId: stores[0].id },
    { id: id("customer-4"), name: `${prefix}-4`, storeId: stores[1].id },
    { id: id("customer-5"), name: `${prefix}-5`, storeId: stores[2].id, salesRepId: otherUser.id },
  ];
  await admin.customer.createMany({ data: customerData.map((customer) => ({
    ...customer, storeType: "DIRECT" as const, regionProvince: "Test Province",
    regionCity: "Test City", regionDistrict: "Test District",
  })) });
  const expected = {
    self: [customerData[0].id, customerData[1].id].sort(),
    department: customerData.slice(0, 3).map(({ id }) => id).sort(),
    sub: customerData.slice(0, 4).map(({ id }) => id).sort(),
    all: customerData.map(({ id }) => id).sort(),
  };

  await check("RLS is enabled and forced on protected business tables", async () => {
    const rows = await admin.$queryRaw<Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>>`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('Customer', 'Order', 'Payment', 'Task', 'CustomerTransaction')
    `;
    assert.equal(rows.length, 5);
    for (const row of rows) {
      assert.equal(row.relrowsecurity, true, `${row.relname} must enable RLS`);
      assert.equal(row.relforcerowsecurity, true, `${row.relname} must force RLS`);
    }
  });

  await check("restricted connection cannot bypass RLS", async () => {
    const [role] = await restricted.$queryRaw<Array<{ rolsuper: boolean; rolbypassrls: boolean }>>`
      SELECT r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user
    `;
    assert.ok(role);
    assert.equal(role.rolsuper, false);
    assert.equal(role.rolbypassrls, false);
  });

  await check("RLS scopes return the exact customer IDs", async () => {
    assert.deepEqual(await visibleCustomerIds(selfUser.id), expected.self);
    assert.deepEqual(await visibleCustomerIds(departmentUser.id), expected.department);
    assert.deepEqual(await visibleCustomerIds(subUser.id), expected.sub);
    assert.deepEqual(await visibleCustomerIds(allUser.id), expected.all);
  });

  await check("transaction-local RLS identities do not leak across pooled requests", async () => {
    const [selfIds, otherIds] = await Promise.all([
      visibleCustomerIds(selfUser.id),
      visibleCustomerIds(otherUser.id),
    ]);
    assert.deepEqual(selfIds, expected.self);
    assert.deepEqual(otherIds, [customerData[4].id]);
    const withoutContext = await restricted.customer.findMany({ select: { id: true } });
    assert.deepEqual(withoutContext, []);
  });

  await check("inactive users and roles see no rows", async () => {
    await admin.user.update({ where: { id: selfUser.id }, data: { active: false } });
    assert.deepEqual(await visibleCustomerIds(selfUser.id), []);
    await admin.user.update({ where: { id: selfUser.id }, data: { active: true } });
    await admin.role.update({ where: { id: selfRole.id }, data: { active: false } });
    assert.deepEqual(await visibleCustomerIds(selfUser.id), []);
  });

  await check("direct authenticated writes are denied", async () => {
    await assert.rejects(() => withRlsContext(restricted, allUser.id, (tx) => tx.customer.create({ data: {
      id: id("forbidden-write"), name: `${prefix}-forbidden`, storeType: "DIRECT",
      regionProvince: "Test Province", regionCity: "Test City", regionDistrict: "Test District", storeId: stores[0].id,
    } })));
    assert.equal(await admin.customer.count({ where: { id: id("forbidden-write") } }), 0);
  });
}

try {
  await main();
} catch (error) {
  failures.push({ name: "RLS setup", error });
  console.error("[FAIL] RLS setup");
  console.error(error instanceof Error ? error.stack || error.message : error);
} finally {
  try {
    await cleanup();
  } catch (error) {
    failures.push({ name: "RLS cleanup", error });
    console.error("[FAIL] RLS cleanup");
  }
  await Promise.all([admin.$disconnect(), restricted.$disconnect()]);
}

console.log(`\nRLS integration summary: PASS ${passed} | FAIL ${failures.length}`);
if (failures.length) {
  console.log("Failed checks:");
  for (const failure of failures) console.log(`- ${failure.name}`);
  process.exitCode = 1;
}
