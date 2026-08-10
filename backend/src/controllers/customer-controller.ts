import { Prisma } from "@prisma/client";
import type { RequestHandler } from "express";
import { z } from "zod";

import { assertOrganizationAccess, customerAccessWhere } from "../lib/access.js";
import { AppError, validate } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

const customerInput = z.object({
  name: z.string().trim().min(1).max(100), phone: z.string().trim().min(6).max(32), wechat: z.string().trim().max(100).optional(),
  age: z.coerce.number().int().min(0).max(120).optional(), ageGroup: z.string().max(32).optional(),
  storeType: z.enum(["DIRECT", "DEALER"]), regionProvince: z.string().min(1).max(64), regionCity: z.string().min(1).max(64),
  regionDistrict: z.string().min(1).max(64), community: z.string().max(120).optional(), projectName: z.string().max(160).optional(),
  houseType: z.string().max(64).optional(), dealYear: z.coerce.number().int().min(2000).max(2100).optional(),
  totalAmount: z.coerce.number().min(0).default(0), depositAmount: z.coerce.number().min(0).default(0),
  productSeries: z.array(z.string().min(1)).default([]), whyFarock: z.string().optional(), tier: z.enum(["S", "A", "B", "C"]).default("B"),
  stage: z.enum(["LEAD", "FOLLOWING", "PROPOSAL", "CONTRACTED", "LOST"]).default("LEAD"), personaSummary: z.string().optional(),
  salesRepId: z.string().optional(), designerId: z.string().optional(), storeId: z.string().min(1), dealerGroupId: z.string().optional(),
});

const customerUpdateInput = customerInput.omit({ storeType: true, storeId: true, dealerGroupId: true }).partial();

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

export const listCustomers: RequestHandler = async (request, response) => {
  const query = validate(z.object({
    page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
    storeType: z.enum(["DIRECT", "DEALER"]).optional(), province: z.string().optional(), city: z.string().optional(),
    dealerGroupId: z.string().optional(), tier: z.enum(["S", "A", "B", "C"]).optional(), search: z.string().trim().optional(),
  }), request.query);
  const where = {
    ...customerAccessWhere(request),
    ...(query.storeType && { storeType: query.storeType }), ...(query.province && { regionProvince: query.province }),
    ...(query.city && { regionCity: query.city }), ...(query.dealerGroupId && { dealerGroupId: query.dealerGroupId }),
    ...(query.tier && { tier: query.tier }), ...(query.search && { OR: [
      { name: { contains: query.search, mode: "insensitive" as const } }, { phone: { contains: query.search } },
    ] }),
  };
  const [items, total] = await prisma.$transaction([
    prisma.customer.findMany({ where, include: { store: true, dealerGroup: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.customer.count({ where }),
  ]);
  response.json({ data: items, meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } });
};

export const createCustomer: RequestHandler = async (request, response) => {
  const input = validate(customerInput, request.body);
  validateAmounts(input.totalAmount, input.depositAmount);
  const store = await verifyAttribution(input.storeType, input.storeId, input.dealerGroupId);
  assertOrganizationAccess(request, store.organizationId);
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
  validateAmounts(input.totalAmount ?? existing.totalAmount, input.depositAmount ?? existing.depositAmount);
  const customer = await prisma.customer.update({ where: { id }, data: input, include: { store: true, dealerGroup: true } });
  response.json({ data: customer });
};

export const importCustomers: RequestHandler = async (request, response) => {
  const { customers } = validate(z.object({ customers: z.array(customerInput).min(1).max(200) }), request.body);
  const phones = customers.map((customer) => customer.phone);
  if (new Set(phones).size !== phones.length) throw new AppError(400, "DUPLICATE_PHONE_IN_FILE", "导入数据中存在重复手机号");

  const storeIds = [...new Set(customers.map((customer) => customer.storeId))];
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
  const duplicate = await prisma.customer.findFirst({ where: { phone: { in: phones } }, select: { phone: true } });
  if (duplicate) throw new AppError(409, "DUPLICATE_PHONE", `手机号 ${duplicate.phone} 已存在`);

  const created = await prisma.$transaction(customers.map((input) => prisma.customer.create({ data: input })));
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
  const customers = await prisma.customer.findMany({ where, include: { store: true, dealerGroup: true }, orderBy: [{ dealYear: "desc" }, { name: "asc" }] });
  const header = ["客户姓名", "联系电话", "经营模式", "省份", "城市", "区县", "门店", "代理商", "建档年份", "订购金额", "已付定金", "产品系列", "客户等级", "跟进状态"];
  const rows = customers.map((customer) => [customer.name, customer.phone, customer.storeType === "DIRECT" ? "直营" : "代理商", customer.regionProvince, customer.regionCity, customer.regionDistrict, customer.store.storeName, customer.dealerGroup?.dealerName, customer.dealYear, customer.totalAmount, customer.depositAmount, customer.productSeries, customer.tier, customer.stage]);
  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="regional-customers-${Date.now()}.csv"`);
  response.send(csv);
};

export const listStores: RequestHandler = async (request, response) => {
  const query = validate(z.object({ storeType: z.enum(["DIRECT", "DEALER"]).optional() }), request.query);
  const where: Prisma.StoreWhereInput = {
    ...(query.storeType && { storeType: query.storeType }),
    ...(request.user?.role !== "ADMIN" && { organizationId: request.user?.organizationId || "__none__" }),
  };
  const stores = await prisma.store.findMany({ where, include: { dealerGroup: true }, orderBy: [{ regionProvince: "asc" }, { regionCity: "asc" }, { storeName: "asc" }] });
  response.json({ data: stores });
};

export const listDealerGroups: RequestHandler = async (request, response) => {
  const where: Prisma.DealerGroupWhereInput = request.user?.role === "ADMIN" ? {} : { organizationId: request.user?.organizationId || "__none__" };
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
  const customer = await prisma.customer.update({
    where: { id: params.id }, data: { ...input, dealerGroupId: input.dealerGroupId || null }, include: { store: true, dealerGroup: true },
  });
  response.json({ data: customer });
};
