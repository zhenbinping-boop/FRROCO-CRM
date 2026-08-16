import { Prisma } from "@prisma/client";
import type { RequestHandler } from "express";
import { z } from "zod";

import { customerAccessWhere } from "../lib/access.js";
import { AppError, validate } from "../lib/http.js";
import { customerFinancialStatus, customerPaidAmount, financialOverviewSummary, orderPaidAmount, type FinancialOverviewItem } from "../lib/order-overview.js";
import { prisma } from "../lib/prisma.js";
import { hasPermission } from "../middleware/authorization.js";

const positiveMoney = z.union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d+(\.\d{1,2})?$/.test(value) && new Prisma.Decimal(value).greaterThan(0), "金额必须大于 0，且最多保留两位小数");

const orderInclude = {
  customer: { include: { store: true, dealerGroup: true } },
  payments: {
    include: { recordedBy: { select: { id: true, name: true } } },
    orderBy: [{ paidAt: "desc" as const }, { createdAt: "desc" as const }],
  },
};

const orderListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["DRAFT", "CONFIRMED", "IN_PRODUCTION", "COMPLETED", "CANCELED"]).optional(),
  hasBalance: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  search: z.string().trim().max(100).optional(),
});

function createOrderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `FR-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export const listOrders: RequestHandler = async (request, response) => {
  const query = validate(orderListQuery, request.query);

  const where: Prisma.OrderWhereInput = {
    customer: customerAccessWhere(request),
    ...(query.status && { status: query.status }),
    ...(query.hasBalance === true && { status: { notIn: ["COMPLETED", "CANCELED"] } }),
    ...(query.hasBalance === false && { status: "COMPLETED" }),
    ...(query.search && {
      OR: [
        { orderNumber: { contains: query.search, mode: "insensitive" } },
        { title: { contains: query.search, mode: "insensitive" } },
        { customer: { is: { name: { contains: query.search, mode: "insensitive" } } } },
        { customer: { is: { phone: { contains: query.search } } } },
      ],
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      include: { customer: { include: { store: true, dealerGroup: true } }, _count: { select: { payments: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  response.json({ data: items, meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } });
};

export const listOrderOverview: RequestHandler = async (request, response) => {
  const query = validate(orderListQuery, request.query);
  const accessWhere = customerAccessWhere(request);
  const legacyCustomers = hasPermission(request.user, "customer.read")
    ? prisma.customer.findMany({
      where: {
        AND: [
          accessWhere,
          { orders: { none: {} } },
          { OR: [{ totalAmount: { gt: 0 } }, { depositAmount: { gt: 0 } }, { transactions: { some: {} } }] },
        ],
      },
      select: {
        id: true, name: true, phone: true, projectName: true, sourceSheet: true, productSeries: true,
        totalAmount: true, depositAmount: true, stage: true, dealDate: true, dealYear: true, createdAt: true,
        transactions: { select: { amount: true } },
      },
    })
    : Promise.resolve([]);
  const [orders, customers] = await Promise.all([
    prisma.order.findMany({
      where: { customer: accessWhere },
      select: {
        id: true, orderNumber: true, title: true, productSeries: true, totalAmount: true, paidAmount: true,
        status: true, signedAt: true, createdAt: true, payments: { select: { amount: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    }),
    legacyCustomers,
  ]);

  // ponytail: merge the canonical and imported finance sources in memory until data volume warrants a SQL UNION.
  const items: FinancialOverviewItem[] = [
    ...orders.map((order) => ({
      id: order.id,
      source: "ORDER" as const,
      orderNumber: order.orderNumber,
      title: order.title,
      productSeries: order.productSeries,
      totalAmount: order.totalAmount,
      paidAmount: orderPaidAmount(order.paidAmount, order.payments.map(({ amount }) => amount)),
      status: order.status,
      signedAt: order.signedAt,
      createdAt: order.createdAt,
      paymentCount: order.payments.length,
      customer: order.customer,
    })),
    ...customers.map((customer) => {
      const paidAmount = customerPaidAmount(customer.depositAmount, customer.transactions.map(({ amount }) => amount));
      const year = customer.dealYear || customer.dealDate?.getFullYear() || customer.createdAt.getFullYear();
      return {
        id: customer.id,
        source: "CUSTOMER" as const,
        orderNumber: `KH-${year}-${customer.id.slice(-6).toUpperCase()}`,
        title: customer.projectName || customer.sourceSheet || `${customer.name}客户档案`,
        productSeries: customer.productSeries,
        totalAmount: customer.totalAmount,
        paidAmount,
        status: customerFinancialStatus(customer.totalAmount, paidAmount, customer.stage),
        signedAt: customer.dealDate,
        createdAt: customer.createdAt,
        paymentCount: customer.transactions.length,
        customer: { id: customer.id, name: customer.name, phone: customer.phone },
      };
    }),
  ];

  const summary = financialOverviewSummary(items);
  const search = query.search?.toLocaleLowerCase("zh-CN");
  const filtered = items.filter((item) => {
    const balance = item.totalAmount.minus(item.paidAmount);
    if (query.status && item.status !== query.status) return false;
    if (query.hasBalance === true && (item.status === "CANCELED" || !balance.greaterThan(0))) return false;
    if (query.hasBalance === false && balance.greaterThan(0)) return false;
    if (!search) return true;
    return [item.orderNumber, item.title, item.customer.name, item.customer.phone]
      .some((value) => String(value || "").toLocaleLowerCase("zh-CN").includes(search));
  }).sort((left, right) => {
    const dateDifference = (right.signedAt || right.createdAt).getTime() - (left.signedAt || left.createdAt).getTime();
    return dateDifference || right.id.localeCompare(left.id);
  });

  const offset = (query.page - 1) * query.pageSize;
  response.json({
    data: filtered.slice(offset, offset + query.pageSize),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total: filtered.length,
      totalPages: Math.ceil(filtered.length / query.pageSize),
    },
    summary,
  });
};

export const getOrder: RequestHandler = async (request, response) => {
  const { id } = validate(z.object({ id: z.string().min(1) }), request.params);
  const order = await prisma.order.findFirst({ where: { id, customer: customerAccessWhere(request) }, include: orderInclude });
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "订单不存在");
  response.json({ data: order });
};

export const createOrder: RequestHandler = async (request, response) => {
  const input = validate(z.object({
    customerId: z.string().min(1),
    title: z.string().trim().min(1).max(160),
    productSeries: z.array(z.string().trim().min(1).max(100)).default([]),
    totalAmount: positiveMoney,
    status: z.enum(["DRAFT", "CONFIRMED", "IN_PRODUCTION"]).default("DRAFT"),
    signedAt: z.coerce.date().optional(),
  }), request.body);
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, ...customerAccessWhere(request) },
    select: {
      id: true, totalAmount: true, depositAmount: true,
      _count: { select: { orders: true, transactions: true } },
    },
  });
  if (!customer) throw new AppError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
  if (customer._count.orders === 0 && (
    customer.totalAmount.greaterThan(0)
    || customer.depositAmount.greaterThan(0)
    || customer._count.transactions > 0
  )) {
    throw new AppError(409, "CUSTOMER_HAS_LEGACY_FINANCE", "该客户已有历史订单或回款数据，请先完成数据归并");
  }

  const order = await prisma.order.create({
    data: { ...input, totalAmount: new Prisma.Decimal(input.totalAmount), orderNumber: createOrderNumber() },
    include: orderInclude,
  });
  response.status(201).json({ data: order });
};

export const createPayment: RequestHandler = async (request, response) => {
  const { id } = validate(z.object({ id: z.string().min(1) }), request.params);
  const input = validate(z.object({
    type: z.enum(["DEPOSIT", "MILESTONE", "BALANCE"]),
    method: z.enum(["CARD", "BANK_TRANSFER", "WECHAT", "CASH"]),
    amount: positiveMoney,
    paidAt: z.coerce.date(),
    referenceNumber: z.string().trim().max(100).optional(),
  }), request.body);

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
    const order = await tx.order.findFirst({ where: { id, customer: customerAccessWhere(request) } });
    if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "订单不存在");
    if (order.status === "CANCELED") throw new AppError(400, "ORDER_CANCELED", "已取消订单不能登记回款");

    const amount = new Prisma.Decimal(input.amount);
    const balance = order.totalAmount.minus(order.paidAmount);
    if (amount.greaterThan(balance)) throw new AppError(400, "PAYMENT_EXCEEDS_BALANCE", `回款金额不能超过待收余额 ${balance.toFixed(2)} 元`);
    const paidAmount = order.paidAmount.plus(amount);
    const payment = await tx.payment.create({
      data: { ...input, amount, orderId: id, recordedById: request.user?.id },
      include: { recordedBy: { select: { id: true, name: true } } },
    });
    const updatedOrder = await tx.order.update({
      where: { id },
      data: { paidAmount, ...(paidAmount.equals(order.totalAmount) && { status: "COMPLETED" }) },
      include: orderInclude,
    });
    return { payment, order: updatedOrder };
  });

  response.status(201).json({ data: result });
};
