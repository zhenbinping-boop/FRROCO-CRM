import { Prisma } from "@prisma/client";

export type FinancialOverviewStatus = "DRAFT" | "CONFIRMED" | "IN_PRODUCTION" | "COMPLETED" | "CANCELED";

export type FinancialOverviewItem = {
  id: string;
  source: "ORDER" | "CUSTOMER";
  orderNumber: string;
  title: string;
  productSeries: string[];
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  status: FinancialOverviewStatus;
  signedAt: Date | null;
  createdAt: Date;
  paymentCount: number;
  customer: {
    id: string;
    name: string;
    phone: string | null;
  };
};

const zero = () => new Prisma.Decimal(0);

export function customerPaidAmount(
  depositAmount: Prisma.Decimal | number | string,
  transactionAmounts: readonly (Prisma.Decimal | number | string)[],
): Prisma.Decimal {
  // Imported transaction rows are the payment ledger; depositAmount is the fallback for summary-only records.
  const amount = transactionAmounts.length
    ? transactionAmounts.reduce<Prisma.Decimal>((sum, value) => sum.plus(value), zero())
    : new Prisma.Decimal(depositAmount);
  return amount.isNegative() ? zero() : amount;
}

export function orderPaidAmount(
  cachedPaidAmount: Prisma.Decimal | number | string,
  paymentAmounts: readonly (Prisma.Decimal | number | string)[],
): Prisma.Decimal {
  const amount = paymentAmounts.length
    ? paymentAmounts.reduce<Prisma.Decimal>((sum, value) => sum.plus(value), zero())
    : new Prisma.Decimal(cachedPaidAmount);
  return amount.isNegative() ? zero() : amount;
}

export function customerFinancialStatus(
  totalAmount: Prisma.Decimal | number | string,
  paidAmount: Prisma.Decimal | number | string,
  stage: string,
): FinancialOverviewStatus {
  const total = new Prisma.Decimal(totalAmount);
  const paid = new Prisma.Decimal(paidAmount);
  if (total.greaterThan(0) && paid.greaterThanOrEqualTo(total)) return "COMPLETED";
  if (paid.greaterThan(0) || stage === "CONTRACTED") return "CONFIRMED";
  return "DRAFT";
}

export function financialOverviewSummary(items: readonly FinancialOverviewItem[]) {
  return items.reduce((summary, item) => {
    if (item.status === "CANCELED") return summary;
    const balance = Prisma.Decimal.max(item.totalAmount.minus(item.paidAmount), 0);
    summary.totalAmount = summary.totalAmount.plus(item.totalAmount);
    summary.paidAmount = summary.paidAmount.plus(item.paidAmount);
    summary.outstandingAmount = summary.outstandingAmount.plus(balance);
    summary.orderCount += 1;
    if (balance.greaterThan(0)) summary.pendingCount += 1;
    return summary;
  }, {
    totalAmount: zero(),
    paidAmount: zero(),
    outstandingAmount: zero(),
    orderCount: 0,
    pendingCount: 0,
  });
}
