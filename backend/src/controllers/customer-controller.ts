import { Prisma } from "@prisma/client";
import type { RequestHandler } from "express";
import { z } from "zod";

import { assertOrganizationAccess, assertUserAssignmentAccess, customerAccessWhere, hasGlobalBusinessAccess } from "../lib/access.js";
import { customerBatchChangesSchema, customerBatchDeleteSchema, customerBatchIdsSchema, customerBatchWhere, splitBatchDeleteTargets } from "../lib/customer-bulk.js";
import { AppError, validate } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const optionalDate = z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  z.coerce.date().optional(),
);

const customerInput = z.object({
  name: z.string().trim().min(1).max(100), phone: z.string().trim().min(6).max(32).optional(), wechat: z.string().trim().max(100).optional(),
  birthday: optionalDate, isReturningCustomer: z.boolean().default(false), address: z.string().trim().max(255).optional(),
  age: z.coerce.number().int().min(0).max(120).optional(), ageGroup: z.string().max(32).optional(),
  storeType: z.enum(["DIRECT", "DEALER"]), regionProvince: z.string().min(1).max(64), regionCity: z.string().min(1).max(64),
  regionDistrict: z.string().min(1).max(64), community: z.string().max(120).optional(), projectName: z.string().max(160).optional(),
  houseType: z.string().max(64).optional(), dealYear: z.coerce.number().int().min(2000).max(2100).optional(),
  totalAmount: z.coerce.number().min(0).default(0), depositAmount: z.coerce.number().min(0).default(0),
  productSeries: z.array(z.string().min(1)).default([]), whyFarock: z.string().optional(), tier: z.enum(["S", "A", "B", "C"]).default("B"),
  stage: z.enum(["LEAD", "FOLLOWING", "PROPOSAL", "CONTRACTED", "LOST"]).default("LEAD"), personaSummary: z.string().optional(),
  customerSource: z.string().trim().max(160).optional(), sourceSheet: z.string().trim().max(100).optional(),
  salesRepName: z.string().trim().max(100).optional(), designerName: z.string().trim().max(100).optional(),
  referralDesignerName: z.string().trim().max(100).optional(), dealDate: optionalDate,
  designRebateAmount: z.coerce.number().min(0).default(0), designRebateStatus: z.string().trim().max(64).optional(),
  invoiceAmount: z.coerce.number().min(0).default(0), notes: z.string().trim().optional(),
  salesRepId: z.string().optional(), designerId: z.string().optional(), storeId: z.string().min(1), dealerGroupId: z.string().optional(),
});

const customerUpdateInput = customerInput.omit({ storeType: true, storeId: true, dealerGroupId: true }).partial();
const transactionInput = z.object({
  amount: z.coerce.number().refine((value) => value !== 0, "流水金额不能为 0"),
  channel: z.string().trim().max(120).optional(), progress: z.string().trim().max(80).optional(),
  occurredAt: optionalDate, sourceSheet: z.string().trim().max(100).optional(),
  sourceRow: z.coerce.number().int().positive().optional(),
});
const importedCustomerInput = customerInput.extend({ transactions: z.array(transactionInput).max(500).default([]) });
const customerDeleteSchema = z.object({ confirmTransactions: z.boolean().default(false) });
const storeInput = z.object({
  code: z.string().trim().min(1).max(64), storeName: z.string().trim().min(1).max(160),
  storeType: z.enum(["DIRECT", "DEALER"]), regionProvince: z.string().trim().min(1).max(64),
  regionCity: z.string().trim().min(1).max(64), regionDistrict: z.string().trim().max(64).optional(),
  dealerGroupId: z.string().trim().min(1).optional(), organizationId: z.string().trim().min(1).optional(),
});

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join("、") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function validateAmounts(totalAmount: Prisma.Decimal | number, depositAmount: Prisma.Decimal | number): void {
  if (Number(depositAmount) > Number(totalAmount)) throw new AppError(400, "INVALID_DEPOSIT", "已付定金不能超过订购金额");
}

async function verifyAttribution(storeType: "DIRECT" | "DEALER", storeId: string, dealerGroupId?: string) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new AppError(400, "INVALID_STORE", "门店不存在");
  if (store.storeType !== storeType) throw new AppError(400, "STORE_TYPE_MISMATCH", "经营模式与门店类型不一致");
  if (storeType === "DIRECT" && dealerGroupId) throw new AppError(400, "DIRECT_DEALER_CONFLICT", "直营客户不能关联代理商分组");
  if (storeType === "DEALER" && (!dealerGroupId || store.dealerGroupId !== dealerGroupId)) {
    throw new AppError(400, "DEALER_GROUP_REQUIRED", "代理商客户必须关联门店所属代理商分组");
  }
  return store;
}

const customerCardSelect = {
  id: true, name: true, storeType: true, regionProvince: true, regionCity: true, regionDistrict: true,
  personaSummary: true, whyFarock: true, tier: true, dealerGroupId: true, createdAt: true,
  store: { select: { id: true, storeName: true } },
  dealerGroup: { select: { id: true, dealerName: true } },
} satisfies Prisma.CustomerSelect;

export const listCustomers: RequestHandler = async (request, response) => {
  const query = validate(z.object({
    page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
    storeType: z.enum(["DIRECT", "DEALER"]).optional(), province: z.string().optional(), city: z.string().optional(),
    storeId: z.string().optional(), dealerGroupId: z.string().optional(), tier: z.enum(["S", "A", "B", "C"]).optional(),
    search: z.string().trim().optional(), sort: z.enum(["recent", "name", "tier"]).default("recent"),
  }), request.query);
  const filters: Prisma.CustomerWhereInput = {
    ...(query.storeType && { storeType: query.storeType }), ...(query.province && { regionProvince: query.province }),
    ...(query.city && { regionCity: query.city }), ...(query.storeId && { storeId: query.storeId }),
    ...(query.dealerGroupId && { dealerGroupId: query.dealerGroupId }), ...(query.tier && { tier: query.tier }),
  };
  const where: Prisma.CustomerWhereInput = { AND: [
    customerAccessWhere(request), filters, ...(query.search ? [{ OR: [
      { name: { contains: query.search, mode: "insensitive" as const } }, { phone: { contains: query.search } },
    ] }] : []),
  ] };
  const orderBy: Prisma.CustomerOrderByWithRelationInput[] = query.sort === "name"
    ? [{ name: "asc" }, { id: "asc" }]
    : query.sort === "tier"
      ? [{ tier: "asc" }, { createdAt: "desc" }, { id: "desc" }]
      : [{ createdAt: "desc" }, { id: "desc" }];
  const [items, total] = await prisma.$transaction([
    prisma.customer.findMany({ where, select: customerCardSelect, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.customer.count({ where }),
  ]);
  response.json({ data: items, meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } });
};

export const createCustomer: RequestHandler = async (request, response) => {
  const input = validate(customerInput, request.body);
  validateAmounts(input.totalAmount, input.depositAmount);
  const store = await verifyAttribution(input.storeType, input.storeId, input.dealerGroupId);
  assertOrganizationAccess(request, store.organizationId);
  await assertUserAssignmentAccess(request, [input.salesRepId, input.designerId]);
  if (input.storeType === "DEALER" && (input.regionProvince !== store.regionProvince || input.regionCity !== store.regionCity)) {
    throw new AppError(400, "DEALER_REGION_MISMATCH", "代理商客户地区必须属于代理商特许经营区域");
  }
  const customer = await prisma.customer.create({ data: input, include: { store: true, dealerGroup: true } });
  response.status(201).json({ data: customer });
};

export const getCustomer: RequestHandler = async (request, response) => {
  const { id } = validate(z.object({ id: z.string().min(1) }), request.params);
  const customer = await prisma.customer.findFirst({
    where: { id, ...customerAccessWhere(request) },
    include: {
      store: true,
      dealerGroup: true,
      transactions: { orderBy: [{ occurredAt: "desc" }, { sourceRow: "desc" }] },
      tasks: { include: { assignee: { select: { id: true, name: true } } }, orderBy: { dueAt: "desc" } },
      followUps: { include: { author: { select: { id: true, name: true } } }, orderBy: { followedAt: "desc" } },
    },
  });
  if (!customer) throw new AppError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
  response.json({ data: customer });
};

export const updateCustomer: RequestHandler = async (request, response) => {
  const { id } = validate(z.object({ id: z.string().min(1) }), request.params);
  const input = validate(customerUpdateInput, request.body);
  const existing = await prisma.customer.findFirst({ where: { id, ...customerAccessWhere(request) }, select: { id: true, totalAmount: true, depositAmount: true } });
  if (!existing) throw new AppError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
  await assertUserAssignmentAccess(request, [input.salesRepId, input.designerId]);
  validateAmounts(input.totalAmount ?? existing.totalAmount, input.depositAmount ?? existing.depositAmount);
  const customer = await prisma.customer.update({ where: { id }, data: input, include: { store: true, dealerGroup: true } });
  response.json({ data: customer });
};

export const batchUpdateCustomers: RequestHandler = async (request, response) => {
  const { ids } = validate(customerBatchIdsSchema, request.body);
  const changes = validate(customerBatchChangesSchema, request.body?.changes);
  if (!request.user) throw new AppError(401, "UNAUTHORIZED", "请先登录");
  const result = await prisma.$transaction(async (tx) => {
    const where = customerBatchWhere(request.user!, ids);
    const visible = await tx.customer.findMany({ where, select: { id: true } });
    if (visible.length !== ids.length) throw new AppError(409, "CUSTOMER_SELECTION_CHANGED", "客户列表已变化，请刷新后重试");
    const updated = await tx.customer.updateMany({ where, data: changes });
    if (updated.count !== ids.length) throw new AppError(409, "CUSTOMER_SELECTION_CHANGED", "客户列表已变化，请刷新后重试");
    return updated;
  });
  response.json({ data: { updated: result.count } });
};

export const deleteCustomer: RequestHandler = async (request, response) => {
  const { id } = validate(z.object({ id: z.string().min(1) }), request.params);
  const { confirmTransactions } = validate(customerDeleteSchema, request.body ?? {});
  const customer = await prisma.customer.findFirst({
    where: { id, ...customerAccessWhere(request) },
    select: { id: true, _count: { select: { orders: true, transactions: true } } },
  });
  if (!customer) throw new AppError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
  if (customer._count.orders > 0) throw new AppError(409, "CUSTOMER_HAS_ORDERS", "该客户已有订单，不能删除");
  if (customer._count.transactions > 0 && !confirmTransactions) {
    throw new AppError(409, "CUSTOMER_HAS_TRANSACTIONS", "该客户已有回款记录，请确认后删除");
  }
  const deleted = await prisma.customer.deleteMany({
    where: { AND: [{ id }, customerAccessWhere(request), { orders: { none: {} } }] },
  });
  if (!deleted.count) throw new AppError(409, "CUSTOMER_SELECTION_CHANGED", "客户列表已变化，请刷新后重试");
  response.status(204).send();
};

export const batchDeleteCustomers: RequestHandler = async (request, response) => {
  const { ids, confirmTransactions } = validate(customerBatchDeleteSchema, request.body);
  if (!request.user) throw new AppError(401, "UNAUTHORIZED", "请先登录");
  const result = await prisma.$transaction(async (tx) => {
    const targets = await tx.customer.findMany({
      where: customerBatchWhere(request.user!, ids),
      select: { id: true, _count: { select: { orders: true, transactions: true } } },
    });
    if (targets.length !== ids.length) throw new AppError(409, "CUSTOMER_SELECTION_CHANGED", "客户列表已变化，请刷新后重试");
    const { deletableIds, failed } = splitBatchDeleteTargets(targets, confirmTransactions);
    const deletableWhere: Prisma.CustomerWhereInput = {
      AND: [customerBatchWhere(request.user!, deletableIds), { orders: { none: {} } }],
    };
    const deleted = deletableIds.length
      ? await tx.customer.deleteMany({ where: deletableWhere })
      : { count: 0 };
    if (deleted.count !== deletableIds.length) throw new AppError(409, "CUSTOMER_SELECTION_CHANGED", "客户列表已变化，请刷新后重试");
    return { requested: ids.length, deleted: deleted.count, failed };
  });
  response.json({ data: result });
};

export const importCustomers: RequestHandler = async (request, response) => {
  const { customers } = validate(z.object({ customers: z.array(importedCustomerInput).min(1).max(200) }), request.body);
  const phones = customers.map((customer) => customer.phone).filter((phone): phone is string => Boolean(phone));
  if (new Set(phones).size !== phones.length) throw new AppError(400, "DUPLICATE_PHONE_IN_FILE", "导入数据中存在重复手机号");

  const storeIds = [...new Set(customers.map((customer) => customer.storeId))];
  await assertUserAssignmentAccess(request, customers.flatMap((customer) => [customer.salesRepId, customer.designerId]));
  const stores = await prisma.store.findMany({ where: { id: { in: storeIds } } });
  const storesById = new Map(stores.map((store) => [store.id, store]));
  for (const input of customers) {
    validateAmounts(input.totalAmount, input.depositAmount);
    const store = storesById.get(input.storeId);
    if (!store) throw new AppError(400, "INVALID_STORE", `客户“${input.name}”关联的门店不存在`);
    assertOrganizationAccess(request, store.organizationId);
    if (store.storeType !== input.storeType) throw new AppError(400, "STORE_TYPE_MISMATCH", `客户“${input.name}”经营模式与门店不一致`);
    if (input.storeType === "DEALER") {
      if (!input.dealerGroupId || store.dealerGroupId !== input.dealerGroupId) throw new AppError(400, "DEALER_GROUP_REQUIRED", `客户“${input.name}”代理商分组不正确`);
      if (input.regionProvince !== store.regionProvince || input.regionCity !== store.regionCity) throw new AppError(400, "DEALER_REGION_MISMATCH", `客户“${input.name}”不属于代理商特许经营区域`);
    } else if (input.dealerGroupId) {
      throw new AppError(400, "DIRECT_DEALER_CONFLICT", `直营客户“${input.name}”不能关联代理商分组`);
    }
  }
  const duplicate = phones.length ? await prisma.customer.findFirst({ where: { phone: { in: phones } }, select: { phone: true } }) : null;
  if (duplicate) throw new AppError(409, "DUPLICATE_PHONE", `手机号 ${duplicate.phone} 已存在`);

  const created = await prisma.$transaction(customers.map(({ transactions, ...input }) => prisma.customer.create({
    data: { ...input, transactions: { create: transactions } },
  })));
  response.status(201).json({ data: { imported: created.length, customers: created } });
};

export const exportRegionalCustomers: RequestHandler = async (request, response) => {
  const query = validate(z.object({ dealerGroupId: z.string().optional(), city: z.string().optional() }).refine(
    (value) => Boolean(value.dealerGroupId || value.city), { message: "必须指定代理商分组或城市" },
  ), request.query);
  const where: Prisma.CustomerWhereInput = {
    ...customerAccessWhere(request),
    ...(query.dealerGroupId && { dealerGroupId: query.dealerGroupId }),
    ...(query.city && { regionCity: query.city }),
  };
  const customers = await prisma.customer.findMany({
    where,
    include: { store: true, dealerGroup: true, transactions: { select: { amount: true } } },
    orderBy: [{ dealYear: "desc" }, { name: "asc" }],
  });
  const header = [
    "客户姓名", "联系电话", "生日", "老客户", "地址", "经营模式", "省份", "城市", "区县", "门店", "代理商", "来源工作表",
    "客户来源", "导购", "设计师", "带单设计师", "下单日期", "建档年份", "下单金额", "已付定金", "设计返点金额",
    "设计返点状态", "开发票金额", "累计收款", "累计退款", "产品系列", "客户等级", "跟进状态", "备注",
  ];
  const rows = customers.map((customer) => {
    const received = customer.transactions.reduce((sum, transaction) => sum + Math.max(Number(transaction.amount), 0), 0);
    const refunded = customer.transactions.reduce((sum, transaction) => sum + Math.abs(Math.min(Number(transaction.amount), 0)), 0);
    return [
      customer.name, customer.phone, customer.birthday?.toISOString().slice(0, 10), customer.isReturningCustomer ? "是" : "否", customer.address,
      customer.storeType === "DIRECT" ? "直营" : "代理商", customer.regionProvince, customer.regionCity, customer.regionDistrict,
      customer.store.storeName, customer.dealerGroup?.dealerName, customer.sourceSheet, customer.customerSource, customer.salesRepName,
      customer.designerName, customer.referralDesignerName, customer.dealDate?.toISOString().slice(0, 10), customer.dealYear, customer.totalAmount,
      customer.depositAmount, customer.designRebateAmount, customer.designRebateStatus, customer.invoiceAmount, received, refunded,
      customer.productSeries, customer.tier, customer.stage, customer.notes,
    ];
  });
  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="regional-customers-${Date.now()}.csv"`);
  response.send(csv);
};

export const listStores: RequestHandler = async (request, response) => {
  const query = validate(z.object({ storeType: z.enum(["DIRECT", "DEALER"]).optional() }), request.query);
  const where: Prisma.StoreWhereInput = {
    ...(query.storeType && { storeType: query.storeType }),
    ...(!hasGlobalBusinessAccess(request) && { organizationId: request.user?.organizationId || "__none__" }),
  };
  const stores = await prisma.store.findMany({ where, include: { dealerGroup: true }, orderBy: [{ regionProvince: "asc" }, { regionCity: "asc" }, { storeName: "asc" }] });
  response.json({ data: stores });
};

export const createStore: RequestHandler = async (request, response) => {
  const input = validate(storeInput, request.body);
  const organizationId = input.organizationId || request.user?.organizationId || null;
  assertOrganizationAccess(request, organizationId);
  if (input.storeType === "DIRECT" && input.dealerGroupId) {
    throw new AppError(400, "DIRECT_DEALER_CONFLICT", "直营门店不能关联代理商分组");
  }
  if (input.storeType === "DEALER" && !input.dealerGroupId) {
    throw new AppError(400, "DEALER_GROUP_REQUIRED", "代理商门店必须关联代理商分组");
  }
  if (organizationId) {
    const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { type: true } });
    if (!organization) throw new AppError(400, "INVALID_ORGANIZATION", "所属机构不存在");
    if (input.storeType === "DEALER" && organization.type !== "DEALER") throw new AppError(400, "ORGANIZATION_TYPE_MISMATCH", "代理商门店必须属于代理商机构");
    if (input.storeType === "DIRECT" && !["HEADQUARTERS", "DIRECT_STORE"].includes(organization.type)) throw new AppError(400, "ORGANIZATION_TYPE_MISMATCH", "直营门店不能属于代理商机构");
  }
  const dealerGroup = input.dealerGroupId ? await prisma.dealerGroup.findUnique({ where: { id: input.dealerGroupId }, select: { organizationId: true, regionProvince: true, regionCity: true } }) : null;
  if (input.storeType === "DEALER" && !dealerGroup) throw new AppError(400, "INVALID_DEALER_GROUP", "代理商分组不存在");
  if (dealerGroup && (dealerGroup.regionProvince !== input.regionProvince || dealerGroup.regionCity !== input.regionCity)) {
    throw new AppError(400, "DEALER_REGION_MISMATCH", "门店地区必须与代理商分组一致");
  }
  if (dealerGroup?.organizationId && organizationId && dealerGroup.organizationId !== organizationId) {
    throw new AppError(400, "DEALER_ORGANIZATION_MISMATCH", "门店机构必须与代理商分组一致");
  }
  const store = await prisma.store.create({
    data: { ...input, organizationId, dealerGroupId: input.storeType === "DEALER" ? input.dealerGroupId : undefined },
    include: { dealerGroup: true },
  });
  response.status(201).json({ data: store });
};

export const listDealerGroups: RequestHandler = async (request, response) => {
  const where: Prisma.DealerGroupWhereInput = hasGlobalBusinessAccess(request) ? {} : { organizationId: request.user?.organizationId || "__none__" };
  const groups = await prisma.dealerGroup.findMany({
    where,
    include: { _count: { select: { customers: true } }, stores: { select: { id: true, storeName: true } } },
    orderBy: [{ regionProvince: "asc" }, { regionCity: "asc" }, { dealerName: "asc" }],
  });
  response.json({ data: groups });
};

export const changeOwnership: RequestHandler = async (request, response) => {
  const params = validate(z.object({ id: z.string().min(1) }), request.params);
  const input = validate(z.object({
    storeType: z.enum(["DIRECT", "DEALER"]), storeId: z.string().min(1), dealerGroupId: z.string().nullable().optional(),
    salesRepId: z.string().nullable().optional(), designerId: z.string().nullable().optional(),
  }), request.body);
  const existing = await prisma.customer.findFirst({ where: { id: params.id, ...customerAccessWhere(request) }, select: { id: true } });
  if (!existing) throw new AppError(404, "CUSTOMER_NOT_FOUND", "客户不存在");
  const store = await verifyAttribution(input.storeType, input.storeId, input.dealerGroupId || undefined);
  assertOrganizationAccess(request, store.organizationId);
  await assertUserAssignmentAccess(request, [input.salesRepId, input.designerId]);
  const customer = await prisma.customer.update({
    where: { id: params.id }, data: { ...input, dealerGroupId: input.dealerGroupId || null }, include: { store: true, dealerGroup: true },
  });
  response.json({ data: customer });
};
