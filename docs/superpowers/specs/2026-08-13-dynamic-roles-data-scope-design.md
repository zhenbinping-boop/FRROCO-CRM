# Dynamic Roles and Data Scope Design

**Goal:** Add administrator-managed single roles, stable permission codes, and consistent SELF/DEPARTMENT/SUB_DEPARTMENT/ALL filtering without breaking existing users.

## Decisions

- `User.roleId` is the new source of truth; legacy `User.role` remains during migration and is used only as a fallback for old rows.
- `SUPER_ADMIN` is a seeded, system-owned role with `ALL` scope and all permission codes. It cannot be deleted or edited.
- `Permission.code` is code-owned and migration-seeded. Administrators assign existing permissions to roles; they do not create permission codes.
- `Organization.parentId` provides the organization tree. `SUB_DEPARTMENT` includes the current organization and descendants.
- SELF ownership is resource-specific: customers use `salesRepId`/`designerId`; tasks use `assigneeId`; follow-ups use `authorId`; orders, payments, and transactions inherit customer access.
- Express remains the primary API boundary and applies Prisma `where` filters. `rls.sql` adds a database boundary for Supabase Auth and direct SQL contexts.

## Performance

Authentication loads one compact role/permission/organization snapshot and caches it for the existing 30-second TTL. Organization descendants are resolved from a single indexed parent query. Permission checks are set membership checks in memory. Data filters use indexed organization and ownership columns.

## Migration

The migration creates role and permission tables, adds the organization parent relation and nullable `User.roleId`, seeds permissions and `SUPER_ADMIN`, and backfills existing `ADMIN` users to `SUPER_ADMIN`. The legacy enum role is retained until all API consumers have migrated.

## Security

RLS maps `auth.uid()` through `User.supabaseAuthId`; unbound users are denied. Express runtime context must be set with transaction-local `app.user_id` when using a non-BYPASSRLS database role. Session-level settings are forbidden because pooled connections can leak identity between requests.

## Testing

Unit checks cover all four scopes, permission membership, and legacy ADMIN fallback. Typecheck, build, policy checks, JS syntax checks, and SQL diff checks remain required.
