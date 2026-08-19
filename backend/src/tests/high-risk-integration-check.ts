import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  DataScope,
  Prisma,
  UserRole,
  type Organization,
  type Role,
  type Store,
  type User,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

if (process.env.TEST_DATABASE_GUARD !== "farock-test-only" || !process.env.DATABASE_URL) {
  console.error("[BLOCKED] A guarded TEST_DATABASE_URL is required.");
  process.exit(2);
}

const { app } = await import("../app.js");
const { invalidateAuthUser } = await import("../lib/auth-user-cache.js");
const { prisma } = await import("../lib/prisma.js");

const jwtSecret = process.env.JWT_SECRET || "farock-test-secret-must-be-at-least-32-characters";
const prefix = `T${Date.now().toString(36).toUpperCase()}${randomUUID().slice(0, 6).toUpperCase()}`;
const lowerPrefix = prefix.toLowerCase();
const password = "CurrentPass123!";
const createdPermissionIds: string[] = [];
let phoneSequence = 0;
let server: Server | undefined;
let baseUrl = "";

type ApiResult = {
  status: number;
  body: any;
  text: string;
};

type Fixtures = {
  org: Organization;
  childOrg: Organization;
  otherOrg: Organization;
  dealerOrg: Organization;
  directStore: Store;
  childStore: Store;
  otherStore: Store;
  dealerStore: Store;
  dealerGroupId: string;
  selfRole: Role;
  departmentRole: Role;
  subDepartmentRole: Role;
  allRole: Role;
  updateOnlyRole: Role;
  orderReadRole: Role;
  noPermissionRole: Role;
  mutableRole: Role;
  admin: User;
  selfUser: User;
  departmentUser: User;
  subDepartmentUser: User;
  allUser: User;
  otherUser: User;
  targetUser: User;
  secondTargetUser: User;
  updateOnlyUser: User;
  orderReadUser: User;
  noPermissionUser: User;
  noOrganizationUser: User;
  financialUser: User;
  emptyFinancialUser: User;
  mutableUser: User;
  deactivatedUser: User;
  passwordUser: User;
};

const failures: Array<{ name: string; error: unknown }> = [];
let passed = 0;

function id(suffix: string): string {
  return `${lowerPrefix}-${suffix}`;
}

function uniquePhone(): string {
  phoneSequence += 1;
  return `19${Date.now().toString().slice(-10)}${String(phoneSequence).padStart(4, "0")}`;
}

function tokenFor(user: Pick<User, "id" | "email">): string {
  return jwt.sign({ email: user.email }, jwtSecret, { subject: user.id, expiresIn: "1h" });
}

function money(value: Prisma.Decimal | string | number): string {
  return new Prisma.Decimal(value).toFixed(2);
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function responseData<T>(result: ApiResult): T {
  assert.ok(result.body && typeof result.body === "object" && "data" in result.body, result.text);
  return result.body.data as T;
}

async function request(method: string, path: string, token?: string, body?: unknown): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed: any = undefined;
  if (text && response.headers.get("content-type")?.includes("application/json")) {
    parsed = JSON.parse(text);
  }
  return { status: response.status, body: parsed, text };
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

async function ensurePermission(code: string) {
  const existing = await prisma.permission.findUnique({ where: { code } });
  if (existing) return existing;
  const permission = await prisma.permission.create({
    data: { id: id(`permission-${code.replaceAll(".", "-")}`), code, name: `Test ${code}` },
  });
  createdPermissionIds.push(permission.id);
  return permission;
}

async function createRole(suffix: string, dataScope: DataScope, permissionCodes: string[]): Promise<Role> {
  const permissions = await Promise.all(permissionCodes.map(ensurePermission));
  return prisma.role.create({
    data: {
      id: id(`role-${suffix.toLowerCase()}`),
      code: `${prefix}_${suffix}`,
      name: `${prefix} ${suffix}`,
      dataScope,
      permissions: { create: permissions.map(({ id: permissionId }) => ({ permissionId })) },
    },
  });
}

async function createUser(
  suffix: string,
  role: Role,
  organizationId: string | null,
  legacyRole: UserRole = UserRole.SALES_REP,
): Promise<User> {
  return prisma.user.create({
    data: {
      id: id(`user-${suffix}`),
      email: `${lowerPrefix}.${suffix}@test.invalid`,
      name: `${prefix} ${suffix}`,
      passwordHash: await bcrypt.hash(password, 4),
      role: legacyRole,
      roleId: role.id,
      organizationId,
      active: true,
    },
  });
}

async function createCustomer(
  fixtures: Fixtures,
  suffix: string,
  overrides: Partial<Prisma.CustomerUncheckedCreateInput> = {},
) {
  const stores = [fixtures.directStore, fixtures.childStore, fixtures.otherStore, fixtures.dealerStore];
  const storeId = String(overrides.storeId || fixtures.directStore.id);
  const store = stores.find((item) => item.id === storeId) || fixtures.directStore;
  const isDealer = store.storeType === "DEALER";
  return prisma.customer.create({
    data: {
      id: id(`customer-${suffix}`),
      name: `${prefix}-${suffix}`,
      phone: uniquePhone(),
      storeType: store.storeType,
      regionProvince: store.regionProvince,
      regionCity: store.regionCity,
      regionDistrict: store.regionDistrict || "Test District",
      storeId,
      dealerGroupId: isDealer ? fixtures.dealerGroupId : null,
      totalAmount: 0,
      depositAmount: 0,
      ...overrides,
    },
  });
}

async function createOrder(
  customerId: string,
  suffix: string,
  overrides: Partial<Prisma.OrderUncheckedCreateInput> = {},
) {
  return prisma.order.create({
    data: {
      id: id(`order-${suffix}`),
      orderNumber: `${prefix}-${suffix}`.slice(0, 64),
      customerId,
      title: `${prefix} order ${suffix}`,
      totalAmount: 100,
      paidAmount: 0,
      status: "CONFIRMED",
      ...overrides,
    },
  });
}

async function createPayment(
  orderId: string,
  suffix: string,
  amount: Prisma.Decimal | string | number,
  recordedById?: string,
) {
  return prisma.payment.create({
    data: {
      id: id(`payment-${suffix}`),
      orderId,
      type: "DEPOSIT",
      method: "BANK_TRANSFER",
      amount,
      paidAt: new Date("2026-01-15T08:00:00.000Z"),
      referenceNumber: `${prefix}-${suffix}`,
      recordedById,
    },
  });
}

async function setupFixtures(): Promise<Fixtures> {
  const permissions = [
    "customer.read", "customer.create", "customer.update", "customer.delete", "customer.transfer", "customer.export",
    "order.read", "order.manage", "payment.read", "payment.manage", "task.read", "task.manage",
    "analytics.read", "role.read", "role.manage", "user.manage", "organization.read", "organization.manage",
  ];

  const org = await prisma.organization.create({
    data: { id: id("org-main"), code: `${prefix}-ORG`, name: `${prefix} Main`, type: "DIRECT_STORE" },
  });
  const childOrg = await prisma.organization.create({
    data: { id: id("org-child"), code: `${prefix}-CHILD`, name: `${prefix} Child`, type: "DIRECT_STORE", parentId: org.id },
  });
  const otherOrg = await prisma.organization.create({
    data: { id: id("org-other"), code: `${prefix}-OTHER`, name: `${prefix} Other`, type: "DIRECT_STORE" },
  });
  const dealerOrg = await prisma.organization.create({
    data: { id: id("org-dealer"), code: `${prefix}-DEALER`, name: `${prefix} Dealer`, type: "DEALER" },
  });
  const dealerGroup = await prisma.dealerGroup.create({
    data: {
      id: id("dealer-group"), code: `${prefix}-DG`, dealerName: `${prefix} Dealer Group`,
      regionProvince: "Dealer Province", regionCity: "Dealer City", regionDistrict: "Dealer District",
      organizationId: dealerOrg.id,
    },
  });
  const directStore = await prisma.store.create({
    data: {
      id: id("store-main"), code: `${prefix}-STORE`, storeName: `${prefix} Main Store`, storeType: "DIRECT",
      regionProvince: "Test Province", regionCity: "Test City", regionDistrict: "Main District", organizationId: org.id,
    },
  });
  const childStore = await prisma.store.create({
    data: {
      id: id("store-child"), code: `${prefix}-CSTORE`, storeName: `${prefix} Child Store`, storeType: "DIRECT",
      regionProvince: "Test Province", regionCity: "Test City", regionDistrict: "Child District", organizationId: childOrg.id,
    },
  });
  const otherStore = await prisma.store.create({
    data: {
      id: id("store-other"), code: `${prefix}-OSTORE`, storeName: `${prefix} Other Store`, storeType: "DIRECT",
      regionProvince: "Test Province", regionCity: "Test City", regionDistrict: "Other District", organizationId: otherOrg.id,
    },
  });
  const dealerStore = await prisma.store.create({
    data: {
      id: id("store-dealer"), code: `${prefix}-DSTORE`, storeName: `${prefix} Dealer Store`, storeType: "DEALER",
      regionProvince: "Dealer Province", regionCity: "Dealer City", regionDistrict: "Dealer District",
      dealerGroupId: dealerGroup.id, organizationId: dealerOrg.id,
    },
  });

  await Promise.all(permissions.map(ensurePermission));
  const [selfRole, departmentRole, subDepartmentRole, allRole, updateOnlyRole, orderReadRole, noPermissionRole, mutableRole] = await Promise.all([
    createRole("SELF", DataScope.SELF, permissions),
    createRole("DEPARTMENT", DataScope.DEPARTMENT, permissions),
    createRole("SUB", DataScope.SUB_DEPARTMENT, permissions),
    createRole("ALL", DataScope.ALL, permissions),
    createRole("UPDATE_ONLY", DataScope.SELF, ["customer.read", "customer.update"]),
    createRole("ORDER_READ", DataScope.SELF, ["customer.read", "order.read"]),
    createRole("NONE", DataScope.SELF, []),
    createRole("MUTABLE", DataScope.SELF, ["customer.read"]),
  ]);

  const users = await Promise.all([
    createUser("admin", allRole, org.id),
    createUser("self", selfRole, org.id),
    createUser("department", departmentRole, org.id),
    createUser("sub", subDepartmentRole, org.id),
    createUser("all", allRole, null),
    createUser("other", selfRole, otherOrg.id),
    createUser("target", selfRole, org.id),
    createUser("target2", selfRole, org.id),
    createUser("update", updateOnlyRole, org.id),
    createUser("orderread", orderReadRole, org.id),
    createUser("none", noPermissionRole, org.id),
    createUser("noorg", departmentRole, null),
    createUser("financial", selfRole, org.id),
    createUser("emptyfinancial", selfRole, org.id),
    createUser("mutable", mutableRole, org.id),
    createUser("deactivate", selfRole, org.id),
    createUser("password", selfRole, org.id),
  ]);

  return {
    org, childOrg, otherOrg, dealerOrg, directStore, childStore, otherStore, dealerStore,
    dealerGroupId: dealerGroup.id,
    selfRole, departmentRole, subDepartmentRole, allRole, updateOnlyRole, orderReadRole, noPermissionRole, mutableRole,
    admin: users[0], selfUser: users[1], departmentUser: users[2], subDepartmentUser: users[3], allUser: users[4],
    otherUser: users[5], targetUser: users[6], secondTargetUser: users[7], updateOnlyUser: users[8], orderReadUser: users[9],
    noPermissionUser: users[10], noOrganizationUser: users[11], financialUser: users[12], emptyFinancialUser: users[13],
    mutableUser: users[14], deactivatedUser: users[15], passwordUser: users[16],
  };
}

async function cleanup(): Promise<void> {
  await prisma.payment.deleteMany({ where: { OR: [
    { id: { startsWith: lowerPrefix } },
    { order: { customer: { name: { startsWith: prefix } } } },
  ] } });
  await prisma.order.deleteMany({ where: { OR: [
    { id: { startsWith: lowerPrefix } },
    { customer: { name: { startsWith: prefix } } },
  ] } });
  await prisma.followUp.deleteMany({ where: { customer: { name: { startsWith: prefix } } } });
  await prisma.task.deleteMany({ where: { customer: { name: { startsWith: prefix } } } });
  await prisma.customerTransaction.deleteMany({ where: { customer: { name: { startsWith: prefix } } } });
  await prisma.customer.deleteMany({ where: { OR: [{ id: { startsWith: lowerPrefix } }, { name: { startsWith: prefix } }] } });
  await prisma.store.deleteMany({ where: { id: { startsWith: lowerPrefix } } });
  await prisma.dealerGroup.deleteMany({ where: { id: { startsWith: lowerPrefix } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: lowerPrefix } } });
  await prisma.role.deleteMany({ where: { id: { startsWith: lowerPrefix } } });
  if (createdPermissionIds.length) await prisma.permission.deleteMany({ where: { id: { in: createdPermissionIds } } });
  await prisma.organization.deleteMany({ where: { id: { startsWith: lowerPrefix } } });
}

async function assertEmptyTestDatabase(): Promise<void> {
  const [users, customers, orders, payments, tasks, transactions] = await Promise.all([
    prisma.user.count(), prisma.customer.count(), prisma.order.count(), prisma.payment.count(), prisma.task.count(), prisma.customerTransaction.count(),
  ]);
  if (users || customers || orders || payments || tasks || transactions) {
    console.error("[BLOCKED] TEST_DATABASE_URL must point to an empty disposable database.");
    process.exit(2);
  }
}

async function startServer(): Promise<void> {
  server = await new Promise<Server>((resolve, reject) => {
    const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate));
    candidate.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
}

async function stopServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
}

async function createScopeData(fixtures: Fixtures) {
  const customers = [
    await createCustomer(fixtures, "scope-1", { salesRepId: fixtures.selfUser.id }),
    await createCustomer(fixtures, "scope-2", { designerId: fixtures.selfUser.id }),
    await createCustomer(fixtures, "scope-3"),
    await createCustomer(fixtures, "scope-4", { storeId: fixtures.childStore.id }),
    await createCustomer(fixtures, "scope-5", { storeId: fixtures.otherStore.id }),
  ];
  const amounts = [100, 200, 300, 400, 500];
  const orders = [];
  for (let index = 0; index < customers.length; index += 1) {
    orders.push(await createOrder(customers[index].id, `scope-${index + 1}`, { totalAmount: amounts[index] }));
    await prisma.task.create({
      data: {
        id: id(`task-scope-${index + 1}`), title: `${prefix} scope task ${index + 1}`,
        customerId: customers[index].id, dueAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    });
  }
  return { customers, orders };
}

async function testDataScopes(fixtures: Fixtures, scopeData: Awaited<ReturnType<typeof createScopeData>>): Promise<void> {
  const expected = [
    { user: fixtures.selfUser, ids: scopeData.customers.slice(0, 2).map(({ id }) => id), revenue: "300.00" },
    { user: fixtures.departmentUser, ids: scopeData.customers.slice(0, 3).map(({ id }) => id), revenue: "600.00" },
    { user: fixtures.subDepartmentUser, ids: scopeData.customers.slice(0, 4).map(({ id }) => id), revenue: "1000.00" },
    { user: fixtures.allUser, ids: scopeData.customers.map(({ id }) => id), revenue: "1500.00" },
  ];

  for (const item of expected) {
    const token = tokenFor(item.user);
    const [customers, orders, tasks, dashboard] = await Promise.all([
      request("GET", "/customers?pageSize=100", token),
      request("GET", "/orders?pageSize=100", token),
      request("GET", "/tasks?pageSize=100", token),
      request("GET", "/analytics/dashboard", token),
    ]);
    assert.equal(customers.status, 200, customers.text);
    assert.equal(orders.status, 200, orders.text);
    assert.equal(tasks.status, 200, tasks.text);
    assert.equal(dashboard.status, 200, dashboard.text);
    assert.deepEqual(sorted(responseData<Array<{ id: string }>>(customers).map(({ id }) => id)), sorted(item.ids));
    assert.deepEqual(sorted(responseData<Array<{ customerId: string }>>(orders).map(({ customerId }) => customerId)), sorted(item.ids));
    assert.deepEqual(sorted(responseData<Array<{ customerId: string }>>(tasks).map(({ customerId }) => customerId)), sorted(item.ids));
    const metrics = responseData<{ metrics: { totalCustomers: number; totalRevenue: string } }>(dashboard).metrics;
    assert.equal(metrics.totalCustomers, item.ids.length);
    assert.equal(money(metrics.totalRevenue), item.revenue);
  }

  const exportResult = await request("GET", "/customers/export-regional?city=Test%20City", tokenFor(fixtures.selfUser));
  assert.equal(exportResult.status, 200, exportResult.text);
  assert.match(exportResult.text, new RegExp(scopeData.customers[0].name));
  assert.match(exportResult.text, new RegExp(scopeData.customers[1].name));
  assert.doesNotMatch(exportResult.text, new RegExp(scopeData.customers[2].name));

  const noOrganization = await request("GET", "/customers", tokenFor(fixtures.noOrganizationUser));
  assert.equal(noOrganization.status, 403, noOrganization.text);
}

async function testSelfSearchIsolation(fixtures: Fixtures, scopeData: Awaited<ReturnType<typeof createScopeData>>): Promise<void> {
  const result = await request(
    "GET",
    `/customers?pageSize=100&search=${encodeURIComponent(scopeData.customers[4].name)}`,
    tokenFor(fixtures.selfUser),
  );
  assert.equal(result.status, 200, result.text);
  assert.deepEqual(responseData<Array<{ id: string }>>(result).map(({ id }) => id), []);
}

async function testFinancialSources(fixtures: Fixtures): Promise<void> {
  const legacy = await createCustomer(fixtures, "finance-legacy", {
    salesRepId: fixtures.financialUser.id,
    totalAmount: 1000,
    depositAmount: 100,
    stage: "LEAD",
    customerSource: "Source A",
  });
  await prisma.customerTransaction.createMany({
    data: [
      { id: id("transaction-finance-1"), customerId: legacy.id, amount: 300 },
      { id: id("transaction-finance-2"), customerId: legacy.id, amount: -50 },
    ],
  });
  const formal = await createCustomer(fixtures, "finance-formal", {
    salesRepId: fixtures.financialUser.id,
    totalAmount: 9000,
    depositAmount: 900,
    customerSource: "Source A",
  });
  const order = await createOrder(formal.id, "finance-formal", { totalAmount: 2000, paidAmount: 600, status: "CONFIRMED" });
  await createPayment(order.id, "finance-1", 500, fixtures.financialUser.id);
  await createPayment(order.id, "finance-2", 200, fixtures.financialUser.id);
  await createOrder(formal.id, "finance-canceled", { totalAmount: 5000, paidAmount: 5000, status: "CANCELED" });

  const token = tokenFor(fixtures.financialUser);
  const [overview, dashboard] = await Promise.all([
    request("GET", "/orders/overview?pageSize=100", token),
    request("GET", "/analytics/dashboard", token),
  ]);
  assert.equal(overview.status, 200, overview.text);
  assert.equal(dashboard.status, 200, dashboard.text);

  const overviewBody = overview.body as {
    data: Array<{ source: string; customer: { id: string }; paidAmount: string }>;
    summary: { totalAmount: string; paidAmount: string; outstandingAmount: string; orderCount: number };
  };
  const legacyItem = overviewBody.data.find((item) => item.source === "CUSTOMER" && item.customer.id === legacy.id);
  const formalItem = overviewBody.data.find((item) => item.source === "ORDER" && item.customer.id === formal.id && money(item.paidAmount) === "700.00");
  assert.ok(legacyItem);
  assert.ok(formalItem);
  assert.equal(money(legacyItem.paidAmount), "250.00");
  assert.equal(money(overviewBody.summary.totalAmount), "3000.00");
  assert.equal(money(overviewBody.summary.paidAmount), "950.00");
  assert.equal(money(overviewBody.summary.outstandingAmount), "2050.00");
  assert.equal(overviewBody.summary.orderCount, 2);

  const metrics = responseData<{ metrics: {
    totalCustomers: number; contractedCustomers: number; conversionRate: number; totalRevenue: string; totalDeposits: string;
  } }>(dashboard).metrics;
  assert.equal(metrics.totalCustomers, 2);
  assert.equal(metrics.contractedCustomers, 2);
  assert.equal(metrics.conversionRate, 100);
  assert.equal(money(metrics.totalRevenue), "3000.00");
  assert.equal(money(metrics.totalDeposits), "950.00");

  const empty = await request("GET", "/analytics/dashboard", tokenFor(fixtures.emptyFinancialUser));
  const emptyMetrics = responseData<{ metrics: { totalCustomers: number; conversionRate: number; totalRevenue: string; totalDeposits: string } }>(empty).metrics;
  assert.equal(emptyMetrics.totalCustomers, 0);
  assert.equal(emptyMetrics.conversionRate, 0);
  assert.equal(money(emptyMetrics.totalRevenue), "0.00");
  assert.equal(money(emptyMetrics.totalDeposits), "0.00");
}

async function testPaymentAccounting(fixtures: Fixtures): Promise<void> {
  const customer = await createCustomer(fixtures, "payment-normal", { salesRepId: fixtures.admin.id });
  const order = await createOrder(customer.id, "payment-normal", { totalAmount: 1000, paidAmount: 200, status: "CONFIRMED" });
  await createPayment(order.id, "payment-existing", 200, fixtures.admin.id);
  const token = tokenFor(fixtures.admin);

  const partial = await request("POST", `/orders/${order.id}/payments`, token, {
    type: "MILESTONE", method: "BANK_TRANSFER", amount: "300.50", paidAt: "2026-02-01T08:00:00.000Z",
    referenceNumber: `${prefix}-PAY-PARTIAL`,
  });
  assert.equal(partial.status, 201, partial.text);
  let state = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payments: true } });
  assert.equal(money(state.paidAmount), "500.50");
  assert.equal(state.status, "CONFIRMED");
  assert.equal(money(state.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0))), "500.50");
  assert.equal(state.payments.find((payment) => money(payment.amount) === "300.50")?.recordedById, fixtures.admin.id);

  const final = await request("POST", `/orders/${order.id}/payments`, token, {
    type: "BALANCE", method: "CARD", amount: "499.50", paidAt: "2026-02-02T08:00:00.000Z",
  });
  assert.equal(final.status, 201, final.text);
  state = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payments: true } });
  assert.equal(money(state.paidAmount), "1000.00");
  assert.equal(state.status, "COMPLETED");
  assert.equal(money(state.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0))), "1000.00");
}

async function testPaymentBoundariesAndConcurrency(fixtures: Fixtures): Promise<void> {
  const customer = await createCustomer(fixtures, "payment-boundary", { salesRepId: fixtures.admin.id });
  const order = await createOrder(customer.id, "payment-boundary", { totalAmount: 1000, paidAmount: 900, status: "CONFIRMED" });
  await createPayment(order.id, "payment-boundary-existing", 900, fixtures.admin.id);
  const token = tokenFor(fixtures.admin);

  for (const amount of ["0", "-0.01", "0.001"]) {
    const invalid = await request("POST", `/orders/${order.id}/payments`, token, {
      type: "BALANCE", method: "CASH", amount, paidAt: "2026-02-03T08:00:00.000Z",
    });
    assert.equal(invalid.status, 400, invalid.text);
  }
  const before = await prisma.payment.count({ where: { orderId: order.id } });
  const concurrent = await Promise.all(["80.00", "80.00"].map((amount, index) => request(
    "POST",
    `/orders/${order.id}/payments`,
    token,
    { type: "BALANCE", method: "CASH", amount, paidAt: "2026-02-03T08:00:00.000Z", referenceNumber: `${prefix}-CON-${index}` },
  )));
  assert.deepEqual(concurrent.map(({ status }) => status).sort((a, b) => a - b), [201, 400]);
  const state = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payments: true } });
  assert.equal(state.payments.length, before + 1);
  assert.equal(money(state.paidAmount), "980.00");
  assert.equal(money(state.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0))), "980.00");

  const exactCustomer = await createCustomer(fixtures, "payment-exact", { salesRepId: fixtures.admin.id });
  const exactOrder = await createOrder(exactCustomer.id, "payment-exact", { totalAmount: 1000, paidAmount: 999.99 });
  await createPayment(exactOrder.id, "payment-exact-existing", 999.99, fixtures.admin.id);
  const exact = await request("POST", `/orders/${exactOrder.id}/payments`, token, {
    type: "BALANCE", method: "WECHAT", amount: "0.01", paidAt: "2026-02-04T08:00:00.000Z",
  });
  assert.equal(exact.status, 201, exact.text);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: exactOrder.id } })).status, "COMPLETED");

  const maxCustomer = await createCustomer(fixtures, "payment-max", { salesRepId: fixtures.admin.id });
  const maxOrder = await createOrder(maxCustomer.id, "payment-max", { totalAmount: "999999999999.99" });
  const maximum = await request("POST", `/orders/${maxOrder.id}/payments`, token, {
    type: "BALANCE", method: "BANK_TRANSFER", amount: "999999999999.99", paidAt: "2026-02-05T08:00:00.000Z",
  });
  assert.equal(maximum.status, 201, maximum.text);
  assert.equal(money((await prisma.order.findUniqueOrThrow({ where: { id: maxOrder.id } })).paidAmount), "999999999999.99");
}

async function testPaymentIdempotency(fixtures: Fixtures): Promise<void> {
  const customer = await createCustomer(fixtures, "payment-retry", { salesRepId: fixtures.admin.id });
  const order = await createOrder(customer.id, "payment-retry", { totalAmount: 1000 });
  const payload = {
    type: "DEPOSIT", method: "BANK_TRANSFER", amount: "100.00", paidAt: "2026-02-06T08:00:00.000Z",
    referenceNumber: `${prefix}-RETRY-ONCE`,
  };
  const first = await request("POST", `/orders/${order.id}/payments`, tokenFor(fixtures.admin), payload);
  const second = await request("POST", `/orders/${order.id}/payments`, tokenFor(fixtures.admin), payload);
  const state = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payments: true } });
  assert.deepEqual([first.status, second.status], [201, 409]);
  assert.equal(state.payments.length, 1);
  assert.equal(money(state.paidAmount), "100.00");
}

async function testPaymentDriftGuard(fixtures: Fixtures): Promise<void> {
  const customer = await createCustomer(fixtures, "payment-drift", { salesRepId: fixtures.admin.id });
  const order = await createOrder(customer.id, "payment-drift", { totalAmount: 1000, paidAmount: 200 });
  await createPayment(order.id, "payment-drift-existing", 150, fixtures.admin.id);
  const result = await request("POST", `/orders/${order.id}/payments`, tokenFor(fixtures.admin), {
    type: "MILESTONE", method: "CARD", amount: "100.00", paidAt: "2026-02-07T08:00:00.000Z",
  });
  const state = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payments: true } });
  assert.equal(result.status, 409, result.text);
  assert.equal(money(state.paidAmount), "200.00");
  assert.equal(money(state.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0))), "150.00");
}

async function testCustomerDeletion(fixtures: Fixtures): Promise<void> {
  const token = tokenFor(fixtures.admin);
  const clean = await createCustomer(fixtures, "delete-clean");
  const cleanTask = await prisma.task.create({
    data: { id: id("task-delete-clean"), title: `${prefix} delete task`, customerId: clean.id, dueAt: new Date("2026-03-01") },
  });
  await prisma.followUp.create({
    data: { id: id("follow-delete-clean"), content: `${prefix} delete follow`, customerId: clean.id, taskId: cleanTask.id },
  });
  const cleanResult = await request("DELETE", `/customers/${clean.id}`, token, {});
  assert.equal(cleanResult.status, 204, cleanResult.text);
  const [cleanCount, taskCount, followCount] = await Promise.all([
    prisma.customer.count({ where: { id: clean.id } }),
    prisma.task.count({ where: { id: cleanTask.id } }),
    prisma.followUp.count({ where: { id: id("follow-delete-clean") } }),
  ]);
  assert.deepEqual([cleanCount, taskCount, followCount], [0, 0, 0]);

  const transactionCustomer = await createCustomer(fixtures, "delete-transactions");
  await prisma.customerTransaction.createMany({ data: [
    { id: id("transaction-delete-positive"), customerId: transactionCustomer.id, amount: 300 },
    { id: id("transaction-delete-negative"), customerId: transactionCustomer.id, amount: -50 },
  ] });
  const unconfirmed = await request("DELETE", `/customers/${transactionCustomer.id}`, token, {});
  assert.equal(unconfirmed.status, 409, unconfirmed.text);
  assert.equal(await prisma.customer.count({ where: { id: transactionCustomer.id } }), 1);
  assert.equal(await prisma.customerTransaction.count({ where: { customerId: transactionCustomer.id } }), 2);
  const confirmed = await request("DELETE", `/customers/${transactionCustomer.id}`, token, { confirmTransactions: true });
  assert.equal(confirmed.status, 204, confirmed.text);
  assert.equal(await prisma.customer.count({ where: { id: transactionCustomer.id } }), 0);
  assert.equal(await prisma.customerTransaction.count({ where: { customerId: transactionCustomer.id } }), 0);

  const ordered = await createCustomer(fixtures, "delete-order");
  const protectedOrder = await createOrder(ordered.id, "delete-order");
  const orderedResult = await request("DELETE", `/customers/${ordered.id}`, token, { confirmTransactions: true });
  assert.equal(orderedResult.status, 409, orderedResult.text);
  assert.equal(await prisma.customer.count({ where: { id: ordered.id } }), 1);
  assert.equal(await prisma.order.count({ where: { id: protectedOrder.id } }), 1);
}

async function testBatchDeletion(fixtures: Fixtures): Promise<void> {
  const token = tokenFor(fixtures.admin);
  const plain = await createCustomer(fixtures, "batch-delete-plain");
  const withTransactions = await createCustomer(fixtures, "batch-delete-transactions");
  const withOrder = await createCustomer(fixtures, "batch-delete-order");
  await prisma.customerTransaction.create({ data: { id: id("transaction-batch-delete"), customerId: withTransactions.id, amount: 100 } });
  await createOrder(withOrder.id, "batch-delete-order");

  const result = await request("POST", "/customers/batch-delete", token, {
    ids: [plain.id, withTransactions.id, withOrder.id],
  });
  assert.equal(result.status, 200, result.text);
  const data = responseData<{ requested: number; deleted: number; failed: Array<{ id: string; code: string }> }>(result);
  assert.equal(data.requested, 3);
  assert.equal(data.deleted, 1);
  assert.deepEqual(sorted(data.failed.map(({ id }) => id)), sorted([withTransactions.id, withOrder.id]));
  assert.equal(await prisma.customer.count({ where: { id: plain.id } }), 0);
  assert.equal(await prisma.customer.count({ where: { id: { in: [withTransactions.id, withOrder.id] } } }), 2);

  const confirmed = await request("POST", "/customers/batch-delete", token, {
    ids: [withTransactions.id, withOrder.id], confirmTransactions: true,
  });
  assert.equal(confirmed.status, 200, confirmed.text);
  const confirmedData = responseData<{ requested: number; deleted: number; failed: Array<{ id: string }> }>(confirmed);
  assert.equal(confirmedData.deleted, 1);
  assert.deepEqual(confirmedData.failed.map(({ id }) => id), [withOrder.id]);
  assert.equal(await prisma.customer.count({ where: { id: withTransactions.id } }), 0);
  assert.equal(await prisma.customerTransaction.count({ where: { customerId: withTransactions.id } }), 0);
  assert.equal(await prisma.customer.count({ where: { id: withOrder.id } }), 1);

  for (const ids of [[], Array.from({ length: 101 }, (_, index) => `${prefix}-${index}`)]) {
    const invalid = await request("POST", "/customers/batch-delete", token, { ids });
    assert.equal(invalid.status, 400, invalid.text);
  }
  const duplicate = await request("POST", "/customers/batch-delete", token, { ids: [withOrder.id, withOrder.id] });
  assert.equal(duplicate.status, 400, duplicate.text);

  const visible = await createCustomer(fixtures, "batch-delete-visible");
  const mixed = await request("POST", "/customers/batch-delete", tokenFor(fixtures.departmentUser), {
    ids: [visible.id, id("missing-customer")],
  });
  assert.equal(mixed.status, 409, mixed.text);
  assert.equal(await prisma.customer.count({ where: { id: visible.id } }), 1);
}

async function testDeleteConcurrency(fixtures: Fixtures): Promise<void> {
  const token = tokenFor(fixtures.admin);
  const sameCustomer = await createCustomer(fixtures, "delete-concurrent-same");
  const duplicateDeletes = await Promise.all([
    request("DELETE", `/customers/${sameCustomer.id}`, token, {}),
    request("DELETE", `/customers/${sameCustomer.id}`, token, {}),
  ]);
  assert.equal(duplicateDeletes.filter(({ status }) => status === 204).length, 1);
  assert.equal(await prisma.customer.count({ where: { id: sameCustomer.id } }), 0);

  const raceCustomer = await createCustomer(fixtures, "delete-order-race");
  const [deleted, created] = await Promise.all([
    request("DELETE", `/customers/${raceCustomer.id}`, token, {}),
    request("POST", "/orders", token, {
      customerId: raceCustomer.id, title: `${prefix} race order`, totalAmount: "100.00", status: "CONFIRMED",
    }),
  ]);
  const successes = [deleted.status, created.status].filter((status) => status >= 200 && status < 300).length;
  assert.equal(successes, 1, `delete=${deleted.status}, create=${created.status}`);
  const customerExists = await prisma.customer.count({ where: { id: raceCustomer.id } });
  const orderCount = await prisma.order.count({ where: { customerId: raceCustomer.id } });
  if (customerExists) assert.equal(orderCount, 1);
  else assert.equal(orderCount, 0);
}

async function testFunctionPermissions(fixtures: Fixtures): Promise<void> {
  const updateCustomer = await createCustomer(fixtures, "permission-update", { salesRepId: fixtures.updateOnlyUser.id });
  const token = tokenFor(fixtures.updateOnlyUser);
  const ordinary = await request("PATCH", `/customers/${updateCustomer.id}`, token, { tier: "A" });
  assert.equal(ordinary.status, 200, ordinary.text);
  assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: updateCustomer.id } })).tier, "A");

  const forbiddenTransfer = await request("PATCH", `/customers/${updateCustomer.id}`, token, { salesRepId: fixtures.targetUser.id });
  const ownership = await prisma.customer.findUniqueOrThrow({ where: { id: updateCustomer.id } });
  assert.equal(forbiddenTransfer.status, 403, forbiddenTransfer.text);
  assert.equal(ownership.salesRepId, fixtures.updateOnlyUser.id);

  const paymentCustomer = await createCustomer(fixtures, "permission-payment-read", { salesRepId: fixtures.orderReadUser.id });
  const order = await createOrder(paymentCustomer.id, "permission-payment-read", { totalAmount: 100, paidAmount: 20 });
  await createPayment(order.id, "permission-payment-read", 20, fixtures.admin.id);
  const readResult = await request("GET", `/orders/${order.id}`, tokenFor(fixtures.orderReadUser));
  assert.equal(readResult.status, 200, readResult.text);
  const readOrder = responseData<Record<string, unknown>>(readResult);
  assert.equal(Object.hasOwn(readOrder, "payments"), false, "order.read must not expose itemized payments without payment.read");

  const denied = await request("GET", "/customers", tokenFor(fixtures.noPermissionUser));
  assert.equal(denied.status, 403, denied.text);
}

async function testRoleAndAccountInvalidation(fixtures: Fixtures): Promise<void> {
  const adminToken = tokenFor(fixtures.admin);
  const mutableToken = tokenFor(fixtures.mutableUser);
  assert.equal((await request("GET", "/customers", mutableToken)).status, 200);
  const roleUpdate = await request("PATCH", `/roles/${fixtures.mutableRole.id}`, adminToken, { permissionCodes: [] });
  assert.equal(roleUpdate.status, 200, roleUpdate.text);
  assert.equal((await request("GET", "/customers", mutableToken)).status, 403);

  const deactivateToken = tokenFor(fixtures.deactivatedUser);
  assert.equal((await request("GET", "/auth/me", deactivateToken)).status, 200);
  const deactivate = await request("PATCH", `/users/${fixtures.deactivatedUser.id}`, adminToken, { active: false });
  assert.equal(deactivate.status, 200, deactivate.text);
  assert.equal((await request("GET", "/auth/me", deactivateToken)).status, 401);
}

async function testPasswordRevokesOldToken(fixtures: Fixtures): Promise<void> {
  const oldToken = tokenFor(fixtures.passwordUser);
  const changed = await request("PATCH", "/auth/me/password", oldToken, {
    currentPassword: password,
    newPassword: "ChangedPass456!",
  });
  assert.equal(changed.status, 204, changed.text);
  assert.equal((await request("GET", "/auth/me", oldToken)).status, 401);

  const oldLogin = await request("POST", "/auth/login", undefined, { email: fixtures.passwordUser.email, password });
  const newLogin = await request("POST", "/auth/login", undefined, { email: fixtures.passwordUser.email, password: "ChangedPass456!" });
  assert.equal(oldLogin.status, 401, oldLogin.text);
  assert.equal(newLogin.status, 200, newLogin.text);
}

async function testLastAdminConcurrency(fixtures: Fixtures): Promise<void> {
  const adminA = await createUser("legacy-admin-a", fixtures.allRole, fixtures.org.id, UserRole.ADMIN);
  const adminB = await createUser("legacy-admin-b", fixtures.allRole, fixtures.org.id, UserRole.ADMIN);
  const results = await Promise.all([
    request("PATCH", `/users/${adminB.id}`, tokenFor(adminA), { active: false }),
    request("PATCH", `/users/${adminA.id}`, tokenFor(adminB), { active: false }),
  ]);
  assert.equal(results.filter(({ status }) => status === 200).length, 1, results.map(({ status }) => status).join(","));
  assert.equal(results.filter(({ status }) => status === 409 || status === 401).length, 1);
  assert.equal(await prisma.user.count({ where: { role: UserRole.ADMIN, active: true } }), 1);
}

function importCustomer(fixtures: Fixtures, suffix: string, overrides: Record<string, unknown> = {}) {
  return {
    name: `${prefix}-import-${suffix}`,
    phone: uniquePhone(),
    storeType: "DIRECT",
    regionProvince: fixtures.directStore.regionProvince,
    regionCity: fixtures.directStore.regionCity,
    regionDistrict: fixtures.directStore.regionDistrict,
    storeId: fixtures.directStore.id,
    totalAmount: 0,
    depositAmount: 0,
    transactions: [],
    ...overrides,
  };
}

async function testImportAccounting(fixtures: Fixtures): Promise<void> {
  const first = importCustomer(fixtures, "normal-a", {
    totalAmount: 1000,
    depositAmount: 300,
    transactions: [{ amount: 200 }, { amount: 100 }, { amount: -50 }],
  });
  const second = importCustomer(fixtures, "normal-b", { totalAmount: 800, depositAmount: 200 });
  const result = await request("POST", "/customers/import", tokenFor(fixtures.admin), { customers: [first, second] });
  assert.equal(result.status, 201, result.text);
  assert.equal(responseData<{ imported: number }>(result).imported, 2);
  const imported = await prisma.customer.findMany({
    where: { name: { in: [first.name, second.name] } },
    include: { transactions: true },
  });
  assert.equal(imported.length, 2);
  const firstRow = imported.find(({ name }) => name === first.name);
  const secondRow = imported.find(({ name }) => name === second.name);
  assert.ok(firstRow);
  assert.ok(secondRow);
  assert.equal(firstRow.transactions.length, 3);
  assert.equal(money(firstRow.transactions.reduce((sum, transaction) => sum.plus(transaction.amount), new Prisma.Decimal(0))), "250.00");
  assert.equal(money(secondRow.depositAmount), "200.00");
  assert.equal(await prisma.order.count({ where: { customerId: { in: imported.map(({ id }) => id) } } }), 0);
  assert.equal(await prisma.payment.count({ where: { order: { customerId: { in: imported.map(({ id }) => id) } } } }), 0);
}

async function testImportBoundaries(fixtures: Fixtures): Promise<void> {
  const token = tokenFor(fixtures.admin);
  const twoHundred = Array.from({ length: 200 }, (_, index) => importCustomer(fixtures, `limit-200-${index}`, { phone: undefined }));
  const accepted = await request("POST", "/customers/import", token, { customers: twoHundred });
  assert.equal(accepted.status, 201, accepted.text);
  assert.equal(responseData<{ imported: number }>(accepted).imported, 200);
  assert.equal(await prisma.customer.count({ where: { name: { startsWith: `${prefix}-import-limit-200-` } } }), 200);

  const twoHundredOne = Array.from({ length: 201 }, (_, index) => importCustomer(fixtures, `limit-201-${index}`, { phone: undefined }));
  const rejectedCustomers = await request("POST", "/customers/import", token, { customers: twoHundredOne });
  assert.equal(rejectedCustomers.status, 400, rejectedCustomers.text);
  assert.equal(await prisma.customer.count({ where: { name: { startsWith: `${prefix}-import-limit-201-` } } }), 0);

  const fiveHundred = importCustomer(fixtures, "transactions-500", {
    transactions: Array.from({ length: 500 }, (_, index) => ({ amount: index % 2 ? -1 : 2, sourceRow: index + 1 })),
  });
  const acceptedTransactions = await request("POST", "/customers/import", token, { customers: [fiveHundred] });
  assert.equal(acceptedTransactions.status, 201, acceptedTransactions.text);
  const acceptedCustomer = await prisma.customer.findUniqueOrThrow({ where: { phone: fiveHundred.phone as string } });
  assert.equal(await prisma.customerTransaction.count({ where: { customerId: acceptedCustomer.id } }), 500);

  const fiveHundredOne = importCustomer(fixtures, "transactions-501", {
    transactions: Array.from({ length: 501 }, (_, index) => ({ amount: 1, sourceRow: index + 1 })),
  });
  const rejectedTransactions = await request("POST", "/customers/import", token, { customers: [fiveHundredOne] });
  assert.equal(rejectedTransactions.status, 400, rejectedTransactions.text);
  assert.equal(await prisma.customer.count({ where: { phone: fiveHundredOne.phone as string } }), 0);

  const maximum = importCustomer(fixtures, "maximum-money", {
    totalAmount: "999999999999.99",
    depositAmount: "999999999999.99",
  });
  const maximumResult = await request("POST", "/customers/import", token, { customers: [maximum] });
  assert.equal(maximumResult.status, 201, maximumResult.text);
  const maximumRow = await prisma.customer.findUniqueOrThrow({ where: { phone: maximum.phone as string } });
  assert.equal(money(maximumRow.totalAmount), "999999999999.99");
  assert.equal(money(maximumRow.depositAmount), "999999999999.99");
}

async function testImportAtomicFailures(fixtures: Fixtures): Promise<void> {
  const token = tokenFor(fixtures.admin);
  const duplicatePhone = uniquePhone();
  const duplicateInFile = await request("POST", "/customers/import", token, { customers: [
    importCustomer(fixtures, "duplicate-file-a", { phone: duplicatePhone }),
    importCustomer(fixtures, "duplicate-file-b", { phone: duplicatePhone }),
  ] });
  assert.equal(duplicateInFile.status, 400, duplicateInFile.text);
  assert.equal(await prisma.customer.count({ where: { phone: duplicatePhone } }), 0);

  const invalidCases = [
    importCustomer(fixtures, "negative-total", { totalAmount: -1 }),
    importCustomer(fixtures, "deposit-over-total", { totalAmount: 100, depositAmount: 100.01 }),
    importCustomer(fixtures, "zero-transaction", { transactions: [{ amount: 0 }] }),
    importCustomer(fixtures, "invalid-store", { storeId: id("missing-store") }),
    importCustomer(fixtures, "cross-org-user", { salesRepId: fixtures.otherUser.id }),
  ];
  for (const customer of invalidCases) {
    const before = await prisma.customer.count({ where: { name: customer.name as string } });
    const result = await request("POST", "/customers/import", tokenFor(fixtures.departmentUser), { customers: [customer] });
    assert.ok([400, 403].includes(result.status), result.text);
    assert.equal(await prisma.customer.count({ where: { name: customer.name as string } }), before);
  }

  const valid = importCustomer(fixtures, "overflow-valid", { totalAmount: 100 });
  const overflow = importCustomer(fixtures, "overflow-invalid", { totalAmount: "1000000000000.00" });
  const overflowResult = await request("POST", "/customers/import", token, { customers: [valid, overflow] });
  assert.equal(overflowResult.status, 400, overflowResult.text);
  assert.equal(await prisma.customer.count({ where: { name: { in: [valid.name as string, overflow.name as string] } } }), 0);
}

async function testImportConcurrency(fixtures: Fixtures): Promise<void> {
  const token = tokenFor(fixtures.admin);
  const phone = uniquePhone();
  const requests = ["a", "b"].map((suffix) => request("POST", "/customers/import", token, {
    customers: [importCustomer(fixtures, `race-${suffix}`, { phone })],
  }));
  const results = await Promise.all(requests);
  assert.deepEqual(results.map(({ status }) => status).sort((a, b) => a - b), [201, 409]);
  assert.equal(await prisma.customer.count({ where: { phone } }), 1);
}

async function testImportPrecisionAndReplayGuards(fixtures: Fixtures): Promise<void> {
  const token = tokenFor(fixtures.admin);
  const precision = importCustomer(fixtures, "precision", { transactions: [{ amount: 0.001 }] });
  const precisionResult = await request("POST", "/customers/import", token, { customers: [precision] });
  assert.equal(precisionResult.status, 400, precisionResult.text);
  assert.equal(await prisma.customer.count({ where: { phone: precision.phone as string } }), 0);

  const overpaid = importCustomer(fixtures, "overpaid", { totalAmount: 100, transactions: [{ amount: 150 }] });
  const overpaidResult = await request("POST", "/customers/import", token, { customers: [overpaid] });
  assert.equal(overpaidResult.status, 400, overpaidResult.text);
  assert.equal(await prisma.customer.count({ where: { phone: overpaid.phone as string } }), 0);

  const replay = importCustomer(fixtures, "replay", {
    phone: undefined,
    sourceSheet: `${prefix}-sheet`,
    transactions: [{ amount: 100, sourceSheet: `${prefix}-sheet`, sourceRow: 1 }],
  });
  const first = await request("POST", "/customers/import", token, { customers: [replay] });
  const second = await request("POST", "/customers/import", token, { customers: [replay] });
  assert.deepEqual([first.status, second.status], [201, 409]);
  assert.equal(await prisma.customer.count({ where: { name: replay.name as string } }), 1);
}

async function testImportBodyLimitContract(fixtures: Fixtures): Promise<void> {
  const payload = Array.from({ length: 200 }, (_, customerIndex) => importCustomer(fixtures, `payload-${customerIndex}`, {
    phone: undefined,
    transactions: Array.from({ length: 500 }, (_, transactionIndex) => ({ amount: 1, sourceRow: transactionIndex + 1 })),
  }));
  const result = await request("POST", "/customers/import", tokenFor(fixtures.admin), { customers: payload });
  assert.equal(result.status, 413, result.text);
  assert.equal(await prisma.customer.count({ where: { name: { startsWith: `${prefix}-import-payload-` } } }), 0);
}

async function testOwnershipTransfer(fixtures: Fixtures): Promise<void> {
  const customer = await createCustomer(fixtures, "transfer-normal", { salesRepId: fixtures.selfUser.id });
  const order = await createOrder(customer.id, "transfer-normal", { totalAmount: 500, paidAmount: 100 });
  await createPayment(order.id, "transfer-normal", 100, fixtures.admin.id);
  await prisma.customerTransaction.create({ data: { id: id("transaction-transfer-normal"), customerId: customer.id, amount: 50 } });
  await prisma.task.create({
    data: { id: id("task-transfer-normal"), title: `${prefix} transfer task`, customerId: customer.id, dueAt: new Date("2026-04-01") },
  });
  const before = {
    orders: await prisma.order.count({ where: { customerId: customer.id } }),
    payments: await prisma.payment.count({ where: { orderId: order.id } }),
    transactions: await prisma.customerTransaction.count({ where: { customerId: customer.id } }),
    tasks: await prisma.task.count({ where: { customerId: customer.id } }),
  };
  const result = await request("PATCH", `/customers/${customer.id}/ownership`, tokenFor(fixtures.admin), {
    storeType: "DIRECT", storeId: fixtures.directStore.id, dealerGroupId: null,
    salesRepId: fixtures.targetUser.id, designerId: null,
  });
  assert.equal(result.status, 200, result.text);
  const state = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
  assert.equal(state.salesRepId, fixtures.targetUser.id);
  assert.equal(state.designerId, null);
  assert.deepEqual({
    orders: await prisma.order.count({ where: { customerId: customer.id } }),
    payments: await prisma.payment.count({ where: { orderId: order.id } }),
    transactions: await prisma.customerTransaction.count({ where: { customerId: customer.id } }),
    tasks: await prisma.task.count({ where: { customerId: customer.id } }),
  }, before);
  assert.equal((await request("GET", `/customers/${customer.id}`, tokenFor(fixtures.selfUser))).status, 404);
  assert.equal((await request("GET", `/customers/${customer.id}`, tokenFor(fixtures.targetUser))).status, 200);
}

async function testOwnershipInvalidInputs(fixtures: Fixtures): Promise<void> {
  const customer = await createCustomer(fixtures, "transfer-invalid", { salesRepId: fixtures.departmentUser.id });
  const before = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
  const crossOrganization = await request("PATCH", `/customers/${customer.id}/ownership`, tokenFor(fixtures.departmentUser), {
    storeType: "DIRECT", storeId: fixtures.directStore.id, dealerGroupId: null, salesRepId: fixtures.otherUser.id,
  });
  assert.equal(crossOrganization.status, 403, crossOrganization.text);
  let state = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
  assert.equal(state.salesRepId, before.salesRepId);

  const mismatch = await request("PATCH", `/customers/${customer.id}/ownership`, tokenFor(fixtures.departmentUser), {
    storeType: "DEALER", storeId: fixtures.directStore.id, dealerGroupId: fixtures.dealerGroupId,
  });
  assert.equal(mismatch.status, 400, mismatch.text);
  state = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
  assert.equal(state.storeId, before.storeId);
}

async function testOwnershipRegionGuard(fixtures: Fixtures): Promise<void> {
  const customer = await createCustomer(fixtures, "transfer-region", { salesRepId: fixtures.admin.id });
  const result = await request("PATCH", `/customers/${customer.id}/ownership`, tokenFor(fixtures.admin), {
    storeType: "DEALER", storeId: fixtures.dealerStore.id, dealerGroupId: fixtures.dealerGroupId,
    salesRepId: fixtures.admin.id,
  });
  const state = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
  assert.equal(result.status, 400, result.text);
  assert.equal(state.storeId, fixtures.directStore.id);
  assert.equal(state.regionCity, fixtures.directStore.regionCity);
}

async function testOwnershipConcurrency(fixtures: Fixtures): Promise<void> {
  const customer = await createCustomer(fixtures, "transfer-concurrent", { salesRepId: fixtures.selfUser.id });
  const payloads = [fixtures.targetUser.id, fixtures.secondTargetUser.id].map((salesRepId) => ({
    storeType: "DIRECT", storeId: fixtures.directStore.id, dealerGroupId: null, salesRepId,
  }));
  const results = await Promise.all(payloads.map((payload) => request(
    "PATCH", `/customers/${customer.id}/ownership`, tokenFor(fixtures.admin), payload,
  )));
  const state = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
  assert.deepEqual(results.map(({ status }) => status).sort((a, b) => a - b), [200, 409]);
  assert.ok([fixtures.targetUser.id, fixtures.secondTargetUser.id].includes(state.salesRepId || ""));
}

async function main(): Promise<void> {
  await assertEmptyTestDatabase();
  await startServer();
  const fixtures = await setupFixtures();
  const scopeData = await createScopeData(fixtures);

  await check("data scopes preserve exact IDs and financial totals", () => testDataScopes(fixtures, scopeData));
  await check("SELF search cannot widen customer access", () => testSelfSearchIsolation(fixtures, scopeData));
  await check("formal and legacy finance sources reconcile", () => testFinancialSources(fixtures));
  await check("payment writes preserve accounting invariants", () => testPaymentAccounting(fixtures));
  await check("payment boundaries and row-lock concurrency", () => testPaymentBoundariesAndConcurrency(fixtures));
  await check("payment retries are idempotent", () => testPaymentIdempotency(fixtures));
  await check("payment cache drift blocks new writes", () => testPaymentDriftGuard(fixtures));
  await check("single customer deletion preserves protected data", () => testCustomerDeletion(fixtures));
  await check("batch customer deletion reports exact partial results", () => testBatchDeletion(fixtures));
  await check("customer deletion remains consistent under concurrency", () => testDeleteConcurrency(fixtures));
  await check("fine-grained permissions cannot be bypassed", () => testFunctionPermissions(fixtures));
  await check("role and account changes invalidate cached access", () => testRoleAndAccountInvalidation(fixtures));
  await check("password changes revoke old JWTs", () => testPasswordRevokesOldToken(fixtures));
  await check("concurrent admin changes retain one active admin", () => testLastAdminConcurrency(fixtures));
  await check("customer imports preserve ledger calculations", () => testImportAccounting(fixtures));
  await check("customer import limits and decimal boundaries", () => testImportBoundaries(fixtures));
  await check("customer import failures roll back atomically", () => testImportAtomicFailures(fixtures));
  await check("concurrent imports enforce phone uniqueness", () => testImportConcurrency(fixtures));
  await check("customer imports reject precision and replay hazards", () => testImportPrecisionAndReplayGuards(fixtures));
  await check("declared maximum import has an intentional body-limit result", () => testImportBodyLimitContract(fixtures));
  await check("ownership transfer changes only attribution and visibility", () => testOwnershipTransfer(fixtures));
  await check("ownership transfer rejects invalid assignments", () => testOwnershipInvalidInputs(fixtures));
  await check("ownership transfer preserves dealer region consistency", () => testOwnershipRegionGuard(fixtures));
  await check("concurrent ownership transfers detect lost updates", () => testOwnershipConcurrency(fixtures));
}

try {
  await main();
} catch (error) {
  failures.push({ name: "integration setup", error });
  console.error("[FAIL] integration setup");
  console.error(error instanceof Error ? error.stack || error.message : error);
} finally {
  try {
    await cleanup();
  } catch (error) {
    failures.push({ name: "integration cleanup", error });
    console.error("[FAIL] integration cleanup");
    console.error(error instanceof Error ? error.stack || error.message : error);
  }
  await stopServer().catch((error) => failures.push({ name: "server shutdown", error }));
  await prisma.$disconnect();
}

console.log(`\nHigh-risk integration summary: PASS ${passed} | FAIL ${failures.length}`);
if (failures.length) {
  console.log("Failed checks:");
  for (const failure of failures) console.log(`- ${failure.name}`);
  process.exitCode = 1;
}
