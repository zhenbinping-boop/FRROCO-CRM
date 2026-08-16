import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { Prisma } from "@prisma/client";

import { buildFinancialAnalytics } from "../controllers/analytics-controller.js";
import { customerFinancialStatus, customerPaidAmount, financialOverviewSummary, orderPaidAmount, type FinancialOverviewItem } from "../lib/order-overview.js";

assert.equal(customerPaidAmount(120, []).toFixed(2), "120.00");
assert.equal(customerPaidAmount(120, [100, -20, 50]).toFixed(2), "130.00");
assert.equal(customerPaidAmount(120, [-20]).toFixed(2), "0.00");
assert.equal(orderPaidAmount(120, []).toFixed(2), "120.00");
assert.equal(orderPaidAmount(120, [100, 50]).toFixed(2), "150.00");
assert.equal(customerFinancialStatus(100, 100, "PROPOSAL"), "COMPLETED");
assert.equal(customerFinancialStatus(100, 20, "PROPOSAL"), "CONFIRMED");
assert.equal(customerFinancialStatus(100, 0, "LEAD"), "DRAFT");

const item = (values: Partial<FinancialOverviewItem>): FinancialOverviewItem => ({
  id: "item-1", source: "ORDER", orderNumber: "FR-1", title: "订单", productSeries: [],
  totalAmount: new Prisma.Decimal(100), paidAmount: new Prisma.Decimal(40), status: "CONFIRMED",
  signedAt: null, createdAt: new Date("2026-01-01"), paymentCount: 1,
  customer: { id: "customer-1", name: "客户", phone: null }, ...values,
});
const summary = financialOverviewSummary([
  item({}),
  item({ id: "item-2", totalAmount: new Prisma.Decimal(50), paidAmount: new Prisma.Decimal(50), status: "COMPLETED" }),
  item({ id: "item-3", totalAmount: new Prisma.Decimal(999), paidAmount: new Prisma.Decimal(999), status: "CANCELED" }),
]);
assert.equal(summary.totalAmount.toFixed(2), "150.00");
assert.equal(summary.paidAmount.toFixed(2), "90.00");
assert.equal(summary.outstandingAmount.toFixed(2), "60.00");
assert.equal(summary.pendingCount, 1);

const analytics = buildFinancialAnalytics([
  {
    customerSource: "小红书", storeType: "DIRECT", salesRepId: "user-1", stage: "LEAD",
    totalAmount: new Prisma.Decimal(300), depositAmount: new Prisma.Decimal(100),
    transactions: [], orders: [],
  },
  {
    customerSource: "小红书", storeType: "DIRECT", salesRepId: "user-1", stage: "LEAD",
    totalAmount: new Prisma.Decimal(999), depositAmount: new Prisma.Decimal(999), transactions: [],
    orders: [{
      status: "CONFIRMED", totalAmount: new Prisma.Decimal(500), paidAmount: new Prisma.Decimal(150),
      payments: [{ amount: new Prisma.Decimal(200) }],
    }],
  },
  {
    customerSource: null, storeType: "DEALER", salesRepId: null, stage: "LEAD",
    totalAmount: new Prisma.Decimal(0), depositAmount: new Prisma.Decimal(0), transactions: [],
    orders: [{ status: "DRAFT", totalAmount: new Prisma.Decimal(900), paidAmount: new Prisma.Decimal(0), payments: [] }],
  },
]);
assert.deepEqual(analytics.sourcePerformance.map(({ source, leads, converted, conversionRate }) => ({ source, leads, converted, conversionRate })), [
  { source: "小红书", leads: 2, converted: 2, conversionRate: 100 },
  { source: "未填写", leads: 1, converted: 0, conversionRate: 0 },
]);
assert.equal(analytics.convertedCustomers, 2);
assert.equal(analytics.totalRevenue.toFixed(2), "800.00");
assert.equal(analytics.totalPaid.toFixed(2), "300.00");
assert.equal(analytics.sourcePerformance[0]?.averageDealSize.toFixed(2), "400.00");
assert.deepEqual(analytics.channelComparison.map(({ storeType, customers, revenue }) => ({ storeType, customers, revenue: revenue.toFixed(2) })), [
  { storeType: "DEALER", customers: 1, revenue: "0.00" },
  { storeType: "DIRECT", customers: 2, revenue: "800.00" },
]);
assert.deepEqual(analytics.salesPerformance.map(({ userId, customers, revenue }) => ({ userId, customers, revenue: revenue.toFixed(2) })), [
  { userId: "user-1", customers: 2, revenue: "800.00" },
]);

const [routes, orders, analyticsController] = await Promise.all([
  readFile(new URL("../routes/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../controllers/order-controller.ts", import.meta.url), "utf8"),
  readFile(new URL("../controllers/analytics-controller.ts", import.meta.url), "utf8"),
]);
assert.match(routes, /get\("\/orders\/overview"/);
assert.match(orders, /orders:\s*\{\s*none/);
assert.match(orders, /transactions:\s*\{\s*select/);
assert.match(orders, /hasPermission\(request\.user,\s*"customer\.read"\)/);
assert.match(orders, /CUSTOMER_HAS_LEGACY_FINANCE/);
assert.match(analyticsController, /payments:\s*\{\s*select:\s*\{\s*amount:\s*true/);
assert.match(analyticsController, /buildFinancialAnalytics/);

console.log("real data modules contract: pass");
