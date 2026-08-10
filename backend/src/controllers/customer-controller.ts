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
  const store = await verifyAttribution(input.storeType, input.storeId, input.dealerGroupId);
  assertOrganizationAccess(request, store.organizationId);
  if (input.storeType === "DEALER" && (input.regionProvince !== store.regionProvince || input.regionCity !== store.regionCity)) {
    throw new AppError(400, "DEALER_REGION_MISMATCH", "代理商客户地区必须属于代理商特许经营区域");
  }
  const customer = await prisma.customer.create({ data: input, include: { store: true, dealerGroup: true } });
  response.status(201).json({ data: customer });
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
