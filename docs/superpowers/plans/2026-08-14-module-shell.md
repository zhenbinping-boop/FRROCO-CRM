# FRROCO CRM 单页工作台壳 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the six primary CRM modules switch inside one persistent shell without a full-page reload.

**Architecture:** Keep the existing HTML pages as module content sources. Add a small browser-side router that fetches and replaces only `main`, updates the existing shell through a narrow `FarockShell` API, and re-executes only the module-specific scripts. Detail and form pages remain normal navigations.

**Tech Stack:** Existing static HTML, vanilla browser APIs (`fetch`, `DOMParser`, `history.pushState`, `popstate`), existing scripts and Node contract tests.

---

### Task 1: Add the failing shell contract

**Files:**
- Create: `frontend/tests/module-shell-contract.mjs`
- Test: `frontend/tests/module-shell-contract.mjs`

- [ ] **Step 1: Write assertions for the requested behavior**

Assert that the router source defines the six primary module routes, uses `history.pushState` and `popstate`, fetches HTML, replaces the active `main`, and does not use `location.href` for module navigation.

- [ ] **Step 2: Run the contract and verify it fails because the router does not exist**

Run `node frontend/tests/module-shell-contract.mjs`.

Expected result: fail because `frontend/assets/module-shell.js` is missing.

### Task 2: Expose shell page updates

**Files:**
- Modify: `frontend/assets/layout.js:88-263`

- [ ] **Step 1: Add a narrow `window.FarockShell.setPage` API**

Reuse the existing page config and action templates to update the header title, active sidebar link, and action bar without rebuilding the sidebar or refreshing the page.

- [ ] **Step 2: Keep the existing standalone-page initialization unchanged**

Existing pages must still build their shell from `layout.js` when opened directly.

### Task 3: Implement the module router

**Files:**
- Create: `frontend/assets/module-shell.js`

- [ ] **Step 1: Define the six primary routes and script order**

Use the existing page names and load only module scripts after the target `main` is installed. Run customer filtering setup before customer API rendering; run task/order API scripts before the shared app enhancement refresh so their existing API flags suppress fallback handlers.

- [ ] **Step 2: Replace content without rebuilding the document**

Fetch the target document, parse it, clone its `main`, retain required dialog nodes, replace the old `main`, update the shell, and update history. Handle failed fetch/script loads with a visible error and keep the current view.

- [ ] **Step 3: Bind click, popstate, and keyboard-safe navigation**

Intercept only primary module links. Let detail/form links continue to use normal navigation. Use `pushState` for clicks and `replaceState` for initial route normalization.

### Task 4: Wire the persistent shell into module entry pages

**Files:**
- Modify: `frontend/dashboard.html`
- Modify: `frontend/customers.html`
- Modify: `frontend/follow-up-tasks.html`
- Modify: `frontend/channel-analysis.html`
- Modify: `frontend/orders-payments.html`
- Modify: `frontend/master-data.html`

- [ ] **Step 1: Load `module-shell.js` after existing page scripts**

This preserves direct-page behavior while allowing navigation from any primary module to stay in the shell.

- [ ] **Step 2: Run the contract test and verify it passes**

Run `node frontend/tests/module-shell-contract.mjs`.

Expected result: pass with no output other than the test summary.

### Task 5: Verify behavior

**Files:**
- No production file changes.

- [ ] **Step 1: Run static checks**

Run `node frontend/tests/module-shell-contract.mjs`, `git diff --check`, and `node --check` for each changed JavaScript file.

- [ ] **Step 2: Run the frontend server**

Run `npm run dev` in `frontend` and open the local dashboard with an authenticated session if available.

- [ ] **Step 3: Verify module switching in the browser**

Confirm that the URL changes without a document load, content changes inside the existing shell, customers/tasks/orders still trigger their API loading, and browser back/forward restores the prior module.
