import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const superAdminRole = await prisma.role.upsert({
    where: { code: "SUPER_ADMIN" },
    update: { name: "超级管理员", dataScope: "ALL", isSystem: true, active: true },
    create: { id: "system-role-super-admin", code: "SUPER_ADMIN", name: "超级管理员", dataScope: "ALL", isSystem: true },
  });
  const headquarters = await prisma.organization.upsert({
    where: { code: "HQ-SH" },
    update: { name: "法洛可中国总部", type: "HEADQUARTERS" },
    create: { code: "HQ-SH", name: "法洛可中国总部", type: "HEADQUARTERS" },
  });
  const directOrganization = await prisma.organization.upsert({
    where: { code: "DIRECT-SH-XH" },
    update: { name: "上海徐汇直营中心", type: "DIRECT_STORE" },
    create: { code: "DIRECT-SH-XH", name: "上海徐汇直营中心", type: "DIRECT_STORE" },
  });
  const dealerOrganization = await prisma.organization.upsert({
    where: { code: "DEALER-HZ-CX" },
    update: { name: "杭州法洛可家居有限公司", type: "DEALER" },
    create: { code: "DEALER-HZ-CX", name: "杭州法洛可家居有限公司", type: "DEALER" },
  });

  const dealerGroup = await prisma.dealerGroup.upsert({
    where: { code: "DG-HZ-CX" },
    update: { organizationId: dealerOrganization.id },
    create: {
      code: "DG-HZ-CX", dealerName: "杭州法洛可家居有限公司", regionProvince: "浙江省",
      regionCity: "杭州市", regionDistrict: "西湖区", organizationId: dealerOrganization.id,
    },
  });
  const directStore = await prisma.store.upsert({
    where: { code: "STORE-SH-XH" },
    update: { organizationId: directOrganization.id },
    create: {
      code: "STORE-SH-XH", storeName: "上海徐汇直营店", storeType: "DIRECT",
      regionProvince: "上海市", regionCity: "上海市", regionDistrict: "徐汇区",
      organizationId: directOrganization.id,
    },
  });
  const dealerStore = await prisma.store.upsert({
    where: { code: "STORE-HZ-CX" },
    update: { dealerGroupId: dealerGroup.id, organizationId: dealerOrganization.id },
    create: {
      code: "STORE-HZ-CX", storeName: "杭州城西代理店", storeType: "DEALER",
      regionProvince: "浙江省", regionCity: "杭州市", regionDistrict: "西湖区",
      dealerGroupId: dealerGroup.id, organizationId: dealerOrganization.id,
    },
  });

  const email = process.env.SEED_ADMIN_EMAIL || "admin@frroco.com";
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error("SEED_ADMIN_PASSWORD environment variable is missing");
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "林晓雅",
      role: "ADMIN",
      roleId: superAdminRole.id,
      active: true,
      organizationId: headquarters.id,
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  const directCustomer = await prisma.customer.upsert({
    where: { phone: "13800001001" },
    update: { salesRepId: admin.id },
    create: {
      name: "陈静", phone: "13800001001", storeType: "DIRECT", regionProvince: "上海市",
      regionCity: "上海市", regionDistrict: "徐汇区", community: "尚海湾豪庭", dealYear: 2026,
      totalAmount: 480000, depositAmount: 120000, productSeries: ["极简隐形门", "全屋衣帽间"],
      whyFarock: "认可极简工艺与整体设计", tier: "S", stage: "CONTRACTED",
      personaSummary: "重视设计完整度与交付质量", salesRepId: admin.id, storeId: directStore.id,
    },
  });
  await prisma.customer.upsert({
    where: { phone: "13800001002" },
    update: { salesRepId: admin.id },
    create: {
      name: "周先生", phone: "13800001002", storeType: "DEALER", regionProvince: "浙江省",
      regionCity: "杭州市", regionDistrict: "西湖区", community: "绿城西溪云庐", dealYear: 2026,
      totalAmount: 320000, depositAmount: 80000, productSeries: ["全屋高定"], whyFarock: "看重本地服务与高定设计",
      tier: "A", stage: "PROPOSAL", personaSummary: "关注空间利用率与售后响应", salesRepId: admin.id,
      storeId: dealerStore.id, dealerGroupId: dealerGroup.id,
    },
  });
  await prisma.task.upsert({
    where: { id: "seed-follow-up-task" },
    update: { assigneeId: admin.id },
    create: {
      id: "seed-follow-up-task", title: "确认深化设计方案", content: "与客户确认隐形门节点和衣帽间材质",
      customerId: directCustomer.id, assigneeId: admin.id, priority: "HIGH", dueAt: new Date(Date.now() + 86400000),
    },
  });
  const seedOrder = await prisma.order.upsert({
    where: { orderNumber: "FR-SEED-2026-001" },
    update: {
      customerId: directCustomer.id, title: "徐汇直营店全屋定制项目", productSeries: ["极简隐形门", "全屋衣帽间"],
      totalAmount: 480000, paidAmount: 120000, status: "CONFIRMED", signedAt: new Date("2026-02-18"),
    },
    create: {
      orderNumber: "FR-SEED-2026-001", customerId: directCustomer.id, title: "徐汇直营店全屋定制项目",
      productSeries: ["极简隐形门", "全屋衣帽间"], totalAmount: 480000, paidAmount: 120000,
      status: "CONFIRMED", signedAt: new Date("2026-02-18"),
    },
  });
  await prisma.payment.upsert({
    where: { id: "seed-payment-2026-001" },
    update: { orderId: seedOrder.id, type: "DEPOSIT", method: "BANK_TRANSFER", amount: 120000, paidAt: new Date("2026-02-18"), recordedById: admin.id },
    create: { id: "seed-payment-2026-001", orderId: seedOrder.id, type: "DEPOSIT", method: "BANK_TRANSFER", amount: 120000, paidAt: new Date("2026-02-18"), recordedById: admin.id },
  });

  console.log(`种子数据初始化完成，管理员账号：${email}`);
}

main().finally(async () => prisma.$disconnect());
