CREATE TYPE "DataScope" AS ENUM ('SELF', 'DEPARTMENT', 'SUB_DEPARTMENT', 'ALL');

ALTER TABLE "Organization" ADD COLUMN "parentId" TEXT;
ALTER TABLE "User" ADD COLUMN "roleId" TEXT;
ALTER TABLE "User" ADD COLUMN "supabaseAuthId" UUID;

CREATE TABLE "Role" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "dataScope" "DataScope" NOT NULL DEFAULT 'SELF',
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Permission" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "description" VARCHAR(255),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RolePermission" (
  "roleId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);

CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");
CREATE INDEX "Role_active_name_idx" ON "Role"("active", "name");
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");
CREATE INDEX "Organization_parentId_idx" ON "Organization"("parentId");
CREATE UNIQUE INDEX "User_supabaseAuthId_key" ON "User"("supabaseAuthId");
CREATE INDEX "User_roleId_active_idx" ON "User"("roleId", "active");
CREATE INDEX "Customer_designerId_stage_idx" ON "Customer"("designerId", "stage");

INSERT INTO "Role" ("id", "code", "name", "dataScope", "isSystem", "active", "updatedAt") VALUES
  ('system-role-super-admin', 'SUPER_ADMIN', '超级管理员', 'ALL', true, true, CURRENT_TIMESTAMP),
  ('system-role-sales-rep', 'SALES_REP', '销售员', 'SELF', true, true, CURRENT_TIMESTAMP),
  ('system-role-designer', 'DESIGNER', '设计师', 'SELF', true, true, CURRENT_TIMESTAMP),
  ('system-role-dealer-user', 'DEALER_USER', '代理商用户', 'DEPARTMENT', true, true, CURRENT_TIMESTAMP);

INSERT INTO "Permission" ("id", "code", "name") VALUES
  ('perm-role-read', 'role.read', '查看角色'), ('perm-role-manage', 'role.manage', '管理角色'),
  ('perm-user-read', 'user.read', '查看成员'), ('perm-user-manage', 'user.manage', '管理成员'),
  ('perm-position-read', 'position.read', '查看职位'), ('perm-position-manage', 'position.manage', '管理职位'),
  ('perm-organization-read', 'organization.read', '查看机构'), ('perm-organization-manage', 'organization.manage', '管理机构'),
  ('perm-customer-read', 'customer.read', '查看客户'), ('perm-customer-create', 'customer.create', '新增客户'),
  ('perm-customer-update', 'customer.update', '修改客户'), ('perm-customer-delete', 'customer.delete', '删除客户'),
  ('perm-customer-transfer', 'customer.transfer', '转移客户'), ('perm-customer-export', 'customer.export', '导出客户'),
  ('perm-order-read', 'order.read', '查看订单'), ('perm-order-manage', 'order.manage', '管理订单'),
  ('perm-payment-read', 'payment.read', '查看回款'), ('perm-payment-manage', 'payment.manage', '管理回款'),
  ('perm-task-read', 'task.read', '查看任务'), ('perm-task-manage', 'task.manage', '管理任务'),
  ('perm-analytics-read', 'analytics.read', '查看分析');

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'system-role-super-admin', "id" FROM "Permission";
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'system-role-sales-rep', "id" FROM "Permission" WHERE "code" IN
  ('customer.read','customer.create','customer.update','order.read','order.manage','payment.read','task.read','task.manage','analytics.read');
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'system-role-designer', "id" FROM "Permission" WHERE "code" IN
  ('customer.read','customer.update','order.read','task.read','task.manage');
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'system-role-dealer-user', "id" FROM "Permission" WHERE "code" IN
  ('customer.read','customer.create','customer.update','order.read','order.manage','payment.read','payment.manage','task.read','task.manage','analytics.read');

UPDATE "User" SET "roleId" = CASE "role"::text
  WHEN 'ADMIN' THEN 'system-role-super-admin'
  WHEN 'DESIGNER' THEN 'system-role-designer'
  WHEN 'DEALER_USER' THEN 'system-role-dealer-user'
  ELSE 'system-role-sales-rep'
END;
ALTER TABLE "User" ALTER COLUMN "roleId" SET NOT NULL;

ALTER TABLE "Organization" ADD CONSTRAINT "Organization_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
