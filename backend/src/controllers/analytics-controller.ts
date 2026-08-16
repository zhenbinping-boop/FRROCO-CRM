import { Prisma } from "@prisma/client";
import type { RequestHandler } from "express";

import { customerAccessWhere } from "../lib/access.js";
import { customerPaidAmount, orderPaidAmount } from "../lib/order-overview.js";
import { prisma } from "../lib/prisma.js";

type FinancialAnalyticsCustomer = {
  customerSource: string | null;
  storeType: string;
  salesRepId: string | null;
  stage: string;
  totalAmount: Prisma.Decimal;
  depositAmount: Prisma.Decimal;
  transactions: readonly { amount: Prisma.Decimal }[];
  orders: readonly {
    status: string;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    payments: readonly { amount: Prisma.Decimal }[];
  }[];
};

const zero = () => new Prisma.Decimal(0);
const countedOrderStatuses = new Set(["CONFIRMED", "IN_PRODUCTION", "COMPLETED"]);

export function buildFinancialAnalytics(customers: readonly FinancialAnalyticsCustomer[]) {
  const sources = new Map<string, { source: string; leads: number; converted: number; revenue: Prisma.Decimal }>();
  const channels = new Map<string, { storeType: string; customers: number; revenue: Prisma.Decimal }>();
  const sales = new Map<string, { userId: string; customers: number; revenue: Prisma.Decimal }>();
  let convertedCustomers = 0;
  let totalRevenue = zero();
  let totalPaid = zero();

  customers.forEach((customer) => {
    const source = customer.customerSource?.trim() || "未填写";
    const current = sources.get(source) || { source, leads: 0, converted: 0, revenue: zero() };
    const formalOrders = customer.orders.filter((order) => countedOrderStatuses.has(order.status));
    const hasOrders = customer.orders.length > 0;
    const legacyPaid = customerPaidAmount(customer.depositAmount, customer.transactions.map(({ amount }) => amount));
    const hasLegacyFinance = !hasOrders && (
      customer.totalAmount.greaterThan(0)
      || customer.depositAmount.greaterThan(0)
      || customer.transactions.length > 0
    );
    const converted = formalOrders.length > 0 || (!hasOrders && (customer.stage === "CONTRACTED" || hasLegacyFinance));
    const revenue = hasOrders
      ? formalOrders.reduce((sum, order) => sum.plus(order.totalAmount), zero())
      : customer.totalAmount;
    const paid = hasOrders
      ? formalOrders.reduce((sum, order) => sum.plus(
        orderPaidAmount(order.paidAmount, order.payments.map(({ amount }) => amount)),
      ), zero())
      : legacyPaid;

    current.leads += 1;
    if (converted) {
      current.converted += 1;
      convertedCustomers += 1;
    }
    current.revenue = current.revenue.plus(revenue);
    sources.set(source, current);
    const channel = channels.get(customer.storeType) || { storeType: customer.storeType, customers: 0, revenue: zero() };
    channel.customers += 1;
    channel.revenue = channel.revenue.plus(revenue);
    channels.set(customer.storeType, channel);
    if (customer.salesRepId) {
      const seller = sales.get(customer.salesRepId) || { userId: customer.salesRepId, customers: 0, revenue: zero() };
      seller.customers += 1;
      seller.revenue = seller.revenue.plus(revenue);
      sales.set(customer.salesRepId, seller);
    }
    totalRevenue = totalRevenue.plus(revenue);
    totalPaid = totalPaid.plus(paid);
  });

  const sourcePerformance = [...sources.values()].map((item) => ({
    ...item,
    conversionRate: item.leads ? Number(((item.converted / item.leads) * 100).toFixed(1)) : 0,
    averageDealSize: item.converted ? item.revenue.div(item.converted).toDecimalPlaces(2) : new Prisma.Decimal(0),
  })).sort((left, right) => right.revenue.comparedTo(left.revenue));
  const channelComparison = [...channels.values()].sort((left, right) => left.storeType.localeCompare(right.storeType));
  const salesPerformance = [...sales.values()].sort((left, right) => right.revenue.comparedTo(left.revenue));

  return { sourcePerformance, channelComparison, salesPerformance, convertedCustomers, totalRevenue, totalPaid };
}

export const dashboard: RequestHandler = async (request, response) => {
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const accessWhere = customerAccessWhere(request);
  const [financialCustomers, pendingTasks] = await Promise.all([
    prisma.customer.findMany({
      where: accessWhere,
      select: {
        customerSource: true, storeType: true, salesRepId: true, stage: true, createdAt: true,
        totalAmount: true, depositAmount: true,
        transactions: { select: { amount: true } },
        orders: {
          select: {
            status: true, totalAmount: true, paidAmount: true,
            payments: { select: { amount: true } },
          },
        },
      },
    }),
    prisma.task.count({ where: { status: "PENDING", customer: accessWhere } }),
  ]);
  // Formal order/payment data is canonical; customer finance fields remain a fallback for imported history.
  const financial = buildFinancialAnalytics(financialCustomers);
  const totalCustomers = financialCustomers.length;
  const newCustomers = financialCustomers.filter((customer) => customer.createdAt >= monthStart).length;
  const ranking = financial.salesPerformance.slice(0, 10);
  const users = ranking.length
    ? await prisma.user.findMany({ where: { id: { in: ranking.map((item) => item.userId) } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((user) => [user.id, user.name]));
  response.json({ data: {
    metrics: { totalCustomers, newCustomers, contractedCustomers: financial.convertedCustomers,
      conversionRate: totalCustomers ? Number(((financial.convertedCustomers / totalCustomers) * 100).toFixed(1)) : 0,
      totalRevenue: financial.totalRevenue, totalDeposits: financial.totalPaid, pendingTasks },
    channelComparison: financial.channelComparison,
    sourcePerformance: financial.sourcePerformance,
    ranking: ranking.map((item, index) => ({ rank: index + 1, ...item, name: names.get(item.userId) || "未分配" })),
  } });
};
