# Role Permissions UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an administrator-facing role and data-permission editor to the existing people-and-permissions page and bind members to dynamic roles.

**Architecture:** Reuse the existing static HTML dialogs and `FarockApi` client. Load role records once with the page reference data, render the role list and all member role selects from that response, and submit `roleId` for member mutations. Extend the existing safe user selects so list and edit responses include the assigned dynamic role.

**Tech Stack:** Static HTML, browser JavaScript, Tailwind utility classes, Express, Prisma, Node.js assertions.

---

### Task 1: Add a failing contract check

**Files:**
- Create: `frontend/tests/role-permissions-contract.mjs`

- [ ] Assert the HTML exposes role list/editor selectors and member forms use `roleId`.
- [ ] Assert the browser script calls `/roles` and implements create, update, and delete requests.
- [ ] Assert the backend safe user response selects `roleId` and `dynamicRole`.
- [ ] Run `node frontend/tests/role-permissions-contract.mjs` and confirm it fails because the UI contract is absent.

### Task 2: Add the role management surface

**Files:**
- Modify: `frontend/users-permissions.html`

- [ ] Add the role/data-permission section below position management.
- [ ] Add a role editor dialog with name, data scope, active status, and permission checkboxes.
- [ ] Replace hardcoded member role options with empty dynamic `roleId` selects.

### Task 3: Extend the backend user response contract

**Files:**
- Modify: `backend/src/controllers/user-controller.ts`

- [ ] Select `roleId` and the minimal `dynamicRole` display fields from list/current-user queries.
- [ ] Run `npm run typecheck` in `backend`.

### Task 4: Implement dynamic role administration

**Files:**
- Modify: `frontend/assets/user-admin.js`

- [ ] Load and cache `/roles` with existing reference data.
- [ ] Render role summaries and populate filters/member forms from active roles.
- [ ] Submit `roleId` in member create/update requests.
- [ ] Implement role create/update/delete actions and disable protected controls for system roles.
- [ ] Run the contract check and `node --check frontend/assets/user-admin.js`.

### Task 5: Verify the integrated workflow

**Files:**
- Verify only.

- [ ] Run `npm run typecheck`, `npm run build`, and `npm run check:user-policy` in `backend`.
- [ ] Run `node frontend/tests/role-permissions-contract.mjs` and `git diff --check`.
- [ ] Open the page locally and verify desktop/mobile layout, role editing, member binding, and system-role protection.
