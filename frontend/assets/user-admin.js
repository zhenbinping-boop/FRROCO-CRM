(() => {
  "use strict";

  const scopeLabels = { SELF: "仅本人", DEPARTMENT: "本机构", SUB_DEPARTMENT: "本机构及下级", ALL: "全部数据" };
  const state = { users: [], organizations: [], positions: [], roles: [], permissions: [], page: 1, totalPages: 1 };
  let userRequestId = 0;
  let currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem("farock-session") || "null"); } catch { currentUser = null; }

  const elements = {
    search: document.querySelector("#user-search"), role: document.querySelector("#user-role-filter"), position: document.querySelector("#user-position-filter"),
    organization: document.querySelector("#user-organization-filter"), active: document.querySelector("#user-active-filter"),
    body: document.querySelector("#user-table-body"), count: document.querySelector("#user-count"),
    page: document.querySelector("#user-page-label"), prev: document.querySelector("#user-prev"), next: document.querySelector("#user-next"),
    refresh: document.querySelector("#user-refresh"), createButton: document.querySelector("#user-create-button"),
    passwordButton: document.querySelector("#password-change-button"), createDialog: document.querySelector("#user-create-dialog"),
    editDialog: document.querySelector("#user-edit-dialog"), passwordDialog: document.querySelector("#password-dialog"),
    createForm: document.querySelector("#user-create-form"), editForm: document.querySelector("#user-edit-form"),
    passwordForm: document.querySelector("#password-form"), deleteButton: document.querySelector("#user-delete"), toast: document.querySelector("#user-toast"),
    positionList: document.querySelector("#position-list"), positionCreateButton: document.querySelector("#position-create-button"),
    positionCreateDialog: document.querySelector("#position-create-dialog"), positionCreateForm: document.querySelector("#position-create-form"),
    roleList: document.querySelector("#role-list"), roleCreateButton: document.querySelector("#role-create-button"),
    roleDialog: document.querySelector("#role-dialog"), roleForm: document.querySelector("#role-form"),
    roleDeleteButton: document.querySelector("#role-delete"), permissionList: document.querySelector("#permission-list"),
  };
  if (!window.FarockAPI || !elements.body) return;

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => elements.toast.classList.add("hidden"), 2800);
  }

  function showFormError(form, message) {
    const error = form.querySelector("[data-form-error]");
    error.textContent = message;
    error.classList.remove("hidden");
  }

  function clearFormError(form) { form.querySelector("[data-form-error]")?.classList.add("hidden"); }

  function formPayload(form) {
    const data = new FormData(form);
    return {
      name: String(data.get("name") || "").trim(), email: String(data.get("email") || "").trim(),
      phone: String(data.get("phone") || "").trim() || null, roleId: String(data.get("roleId") || ""),
      organizationId: String(data.get("organizationId") || "") || null, positionId: String(data.get("positionId") || "") || null,
      active: data.get("active") === "on",
    };
  }

  function setBusy(form, busy) {
    form.querySelectorAll("button, input, select").forEach((control) => { control.disabled = busy; });
  }

  function memberRow(user) {
    const row = document.createElement("tr");
    row.className = "hover:bg-[#fafaf7]";
    const initials = Array.from(user.name || "成员").slice(0, 2).join("");
    row.innerHTML = `
      <td class="px-5 py-4"><div class="flex items-center gap-3"><span class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e5e5df] font-semibold"></span><div><strong class="block font-semibold"></strong><span class="text-xs text-[#666a67]"></span></div></div></td>
      <td class="px-5 py-4 font-medium"></td>
      <td class="px-5 py-4"><span class="rounded-full bg-[#efefe9] px-2.5 py-1 text-xs font-semibold"></span></td>
      <td class="px-5 py-4 text-[#4f5350]"></td>
      <td class="px-5 py-4"><span class="inline-flex items-center gap-1.5 text-sm font-medium"><i class="h-2 w-2 rounded-full"></i><b class="font-medium"></b></span></td>
      <td class="px-5 py-4 text-right"><button class="farock-button farock-button--secondary" type="button"><span class="material-symbols-outlined">manage_accounts</span><span>管理</span></button></td>`;
    const cells = row.cells;
    cells[0].querySelector(".grid").textContent = initials;
    cells[0].querySelector("strong").textContent = user.name;
    cells[0].querySelector(".text-xs").textContent = user.email + (user.phone ? ` · ${user.phone}` : "");
    cells[1].textContent = user.position?.name || "未设置";
    cells[2].querySelector("span").textContent = user.dynamicRole?.name || user.role;
    cells[3].textContent = user.organization?.name || "未指定";
    const status = cells[4].querySelector("span");
    status.querySelector("i").classList.add(user.active ? "bg-emerald-600" : "bg-[#9a9d99]");
    status.querySelector("b").textContent = user.active ? "已启用" : "已停用";
    cells[5].querySelector("button").addEventListener("click", () => openEdit(user));
    return row;
  }

  function renderUsers(meta) {
    elements.body.replaceChildren();
    if (!state.users.length) {
      const row = document.createElement("tr");
      row.innerHTML = '<td class="px-5 py-12 text-center text-[#666a67]" colspan="6">没有符合条件的成员</td>';
      elements.body.append(row);
    } else elements.body.append(...state.users.map(memberRow));
    elements.count.textContent = `共 ${meta.total} 名成员`;
    elements.page.textContent = `第 ${meta.page} / ${Math.max(meta.totalPages, 1)} 页`;
    elements.prev.disabled = meta.page <= 1;
    elements.next.disabled = meta.page >= meta.totalPages;
  }

  async function loadUsers() {
    const requestId = ++userRequestId;
    elements.body.innerHTML = '<tr><td class="px-5 py-10 text-center text-[#666a67]" colspan="6">正在加载成员...</td></tr>';
    const params = new URLSearchParams({ page: String(state.page), pageSize: "50" });
    [["search", elements.search.value.trim()], ["positionId", elements.position.value], ["roleId", elements.role.value], ["organizationId", elements.organization.value], ["active", elements.active.value]].forEach(([key, value]) => { if (value) params.set(key, value); });
    try {
      const payload = await FarockAPI.get(`users?${params}`);
      if (requestId !== userRequestId) return;
      state.users = payload.data;
      const sessionUser = state.users.find((user) => user.id === currentUser?.id);
      if (sessionUser) {
        currentUser = { ...currentUser, ...sessionUser };
        localStorage.setItem("farock-session", JSON.stringify(currentUser));
        window.dispatchEvent(new CustomEvent("farock:user-updated", { detail: sessionUser }));
      }
      state.totalPages = payload.meta.totalPages;
      renderUsers(payload.meta);
    } catch (error) {
      if (requestId !== userRequestId) return;
      elements.body.innerHTML = '<tr><td class="px-5 py-10 text-center text-red-700" colspan="6"></td></tr>';
      elements.body.querySelector("td").textContent = error.message;
      elements.count.textContent = "加载失败";
    }
  }

  function fillOrganizationSelects() {
    document.querySelectorAll("[data-organization-select]").forEach((select) => {
      select.querySelectorAll("option:not(:first-child)").forEach((option) => option.remove());
      state.organizations.forEach((organization) => {
        const option = new Option(organization.name, organization.id);
        option.dataset.type = organization.type;
        select.add(option);
      });
    });
    elements.organization.querySelectorAll("option:not(:first-child)").forEach((option) => option.remove());
    state.organizations.forEach((organization) => elements.organization.add(new Option(organization.name, organization.id)));
  }

  async function loadOrganizations() {
    try { state.organizations = (await FarockAPI.get("organizations")).data; fillOrganizationSelects(); }
    catch (error) { showToast(error.message); }
  }

  function fillPositionSelects() {
    document.querySelectorAll("[data-position-select]").forEach((select) => {
      select.querySelectorAll("option:not(:first-child)").forEach((option) => option.remove());
      state.positions.filter((position) => position.active).forEach((position) => {
        const option = new Option(position.name, position.id);
        option.dataset.dealerOnly = String(position.dealerOnly);
        select.add(option);
      });
    });
    elements.positionList.replaceChildren(...state.positions.map((position) => {
      const badge = document.createElement("span");
      badge.className = "inline-flex items-center gap-2 rounded-md border border-[#dedfda] bg-[#f7f7f4] px-3 py-2 text-sm";
      badge.textContent = position.name;
      if (position.dealerOnly) badge.append(Object.assign(document.createElement("small"), { className: "text-[#666a67]", textContent: "代理商" }));
      return badge;
    }));
  }

  async function loadPositions() {
    try { state.positions = (await FarockAPI.get("positions")).data; fillPositionSelects(); }
    catch (error) { showToast(error.message); }
  }

  function fillRoleSelects() {
    document.querySelectorAll("[data-role-select]").forEach((select) => {
      select.querySelectorAll("option:not(:first-child)").forEach((option) => option.remove());
      state.roles.forEach((role) => {
        const option = new Option(`${role.name}${role.active ? "" : "（已停用）"}`, role.id);
        if (!role.active && select !== elements.role) option.disabled = true;
        select.add(option);
      });
    });
  }

  function renderPermissionOptions(selectedCodes = [], disabled = false) {
    const selected = new Set(selectedCodes);
    elements.permissionList.replaceChildren(...state.permissions.map((permission) => {
      const label = document.createElement("label");
      label.className = "flex items-start gap-3 rounded-md border border-[#dedfda] p-3";
      const checkbox = Object.assign(document.createElement("input"), { type: "checkbox", name: "permissionCodes", value: permission.code, checked: selected.has(permission.code), disabled });
      const text = document.createElement("span");
      text.className = "min-w-0 text-sm";
      text.append(Object.assign(document.createElement("strong"), { className: "block font-semibold", textContent: permission.name }));
      text.append(Object.assign(document.createElement("small"), { className: "block break-all text-[#666a67]", textContent: permission.code }));
      label.append(checkbox, text);
      return label;
    }));
    if (!state.permissions.length) elements.permissionList.textContent = "暂无可配置的权限节点";
  }

  function renderRoles() {
    elements.roleList.replaceChildren(...state.roles.map((role) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "grid min-h-[104px] gap-2 rounded-md border border-[#dedfda] bg-[#fafaf7] p-4 text-left transition hover:border-[#8b8e89] focus:outline-none focus:ring-2 focus:ring-[#1b1c19]/20";
      const header = document.createElement("span");
      header.className = "flex items-start justify-between gap-3";
      header.append(Object.assign(document.createElement("strong"), { className: "font-semibold", textContent: role.name }));
      header.append(Object.assign(document.createElement("small"), { className: role.active ? "text-emerald-700" : "text-[#777b77]", textContent: role.active ? "已启用" : "已停用" }));
      const summary = document.createElement("span");
      summary.className = "text-sm text-[#555955]";
      summary.textContent = `${scopeLabels[role.dataScope] || role.dataScope} · ${role.permissions.length} 项权限 · ${role._count.users} 名成员`;
      const type = document.createElement("small");
      type.className = "text-[#777b77]";
      type.textContent = role.isSystem ? "系统角色" : role.code;
      button.append(header, summary, type);
      button.addEventListener("click", () => openRole(role));
      return button;
    }));
  }

  async function loadRoles() {
    try {
      state.roles = (await FarockAPI.get("roles")).data;
      state.permissions = Array.from(new Map(state.roles.flatMap((role) => role.permissions).map(({ permission }) => [permission.code, permission])).values()).sort((left, right) => left.code.localeCompare(right.code));
      fillRoleSelects();
      renderRoles();
    } catch (error) {
      elements.roleList.textContent = error.message;
      showToast(error.message);
    }
  }

  function syncPlacementFields(form) {
    const position = state.positions.find((item) => item.id === form.elements.positionId.value);
    const dealerOnly = Boolean(position?.dealerOnly);
    const roleCode = state.roles.find((item) => item.id === form.elements.roleId.value)?.code;
    const requiresDealer = dealerOnly || roleCode === "DEALER_USER";
    const currentOrganization = form.elements.organizationId.value;
    form.elements.organizationId.querySelectorAll("option[data-type]").forEach((option) => { option.hidden = requiresDealer && option.dataset.type !== "DEALER"; });
    if (requiresDealer && state.organizations.find((item) => item.id === currentOrganization)?.type !== "DEALER") form.elements.organizationId.value = "";
    form.elements.organizationId.required = requiresDealer;
  }

  function openEdit(user) {
    const form = elements.editForm;
    form.elements.id.value = user.id;
    form.elements.name.value = user.name;
    form.elements.email.value = user.email;
    form.elements.phone.value = user.phone || "";
    form.elements.roleId.value = user.roleId;
    form.elements.positionId.value = user.positionId || "";
    form.elements.organizationId.value = user.organizationId || "";
    syncPlacementFields(form);
    form.elements.active.checked = user.active;
    elements.deleteButton.hidden = user.id === currentUser?.id;
    clearFormError(form);
    elements.editDialog.showModal();
  }

  async function submitCreate(event) {
    event.preventDefault(); clearFormError(elements.createForm);
    const payload = { ...formPayload(elements.createForm), password: elements.createForm.elements.password.value };
    setBusy(elements.createForm, true);
    try {
      await FarockAPI.post("users", payload);
      elements.createDialog.close(); elements.createForm.reset(); elements.createForm.elements.active.checked = true; syncPlacementFields(elements.createForm);
      state.page = 1; await loadUsers(); showToast("成员已添加");
    } catch (error) { showFormError(elements.createForm, error.message); }
    finally { setBusy(elements.createForm, false); }
  }

  async function submitEdit(event) {
    event.preventDefault(); clearFormError(elements.editForm);
    const payload = formPayload(elements.editForm);
    setBusy(elements.editForm, true);
    try {
      const result = await FarockAPI.patch(`users/${elements.editForm.elements.id.value}`, payload);
      if (result?.data?.id === currentUser?.id) {
        currentUser = { ...currentUser, ...result.data };
        localStorage.setItem("farock-session", JSON.stringify(currentUser));
        window.dispatchEvent(new CustomEvent("farock:user-updated", { detail: result.data }));
      }
      elements.editDialog.close(); await loadUsers(); showToast("成员信息已保存");
    } catch (error) { showFormError(elements.editForm, error.message); }
    finally { setBusy(elements.editForm, false); }
  }

  async function deleteMember() {
    const id = elements.editForm.elements.id.value;
    const name = elements.editForm.elements.name.value;
    if (!confirm(`确定删除成员“${name}”吗？此操作不可撤销。\n\n如成员仍有关联客户或未完成任务，系统会阻止删除。`)) return;
    elements.deleteButton.disabled = true;
    try { await FarockAPI.delete(`users/${id}`); elements.editDialog.close(); await loadUsers(); showToast("成员已删除"); }
    catch (error) { showFormError(elements.editForm, error.message); }
    finally { elements.deleteButton.disabled = false; }
  }

  async function submitPassword(event) {
    event.preventDefault(); clearFormError(elements.passwordForm);
    const currentPassword = elements.passwordForm.elements.currentPassword.value;
    const newPassword = elements.passwordForm.elements.newPassword.value;
    if (newPassword !== elements.passwordForm.elements.confirmPassword.value) return showFormError(elements.passwordForm, "两次输入的新密码不一致");
    setBusy(elements.passwordForm, true);
    try {
      await FarockAPI.patch("auth/me/password", { currentPassword, newPassword });
      localStorage.removeItem("farock-token"); localStorage.removeItem("farock-session");
      alert("密码已修改，请使用新密码重新登录"); location.href = "index.html";
    } catch (error) { showFormError(elements.passwordForm, error.message); setBusy(elements.passwordForm, false); }
  }

  async function submitPosition(event) {
    event.preventDefault(); clearFormError(elements.positionCreateForm);
    const data = new FormData(elements.positionCreateForm);
    setBusy(elements.positionCreateForm, true);
    try {
      await FarockAPI.post("positions", { name: String(data.get("name") || "").trim(), dealerOnly: data.get("dealerOnly") === "on" });
      elements.positionCreateDialog.close(); elements.positionCreateForm.reset(); await loadPositions(); showToast("职位已创建");
    } catch (error) { showFormError(elements.positionCreateForm, error.message); }
    finally { setBusy(elements.positionCreateForm, false); }
  }

  function openRole(role = null) {
    const form = elements.roleForm;
    form.reset();
    clearFormError(form);
    form.elements.id.value = role?.id || "";
    form.elements.name.value = role?.name || "";
    form.elements.dataScope.value = role?.dataScope || "SELF";
    form.elements.active.checked = role?.active ?? true;
    const immutable = Boolean(role?.isSystem);
    form.querySelectorAll("input:not([name=id]), select").forEach((control) => { control.disabled = immutable; });
    form.querySelector('[type="submit"]').hidden = immutable;
    elements.roleDeleteButton.hidden = !role || immutable;
    elements.roleDeleteButton.disabled = Boolean(role?._count.users);
    renderPermissionOptions(role?.permissions.map(({ permission }) => permission.code) || [], immutable);
    elements.roleDialog.showModal();
  }

  async function submitRole(event) {
    event.preventDefault();
    clearFormError(elements.roleForm);
    const data = new FormData(elements.roleForm);
    const id = String(data.get("id") || "");
    const payload = {
      name: String(data.get("name") || "").trim(),
      dataScope: String(data.get("dataScope") || "SELF"),
      active: data.get("active") === "on",
      permissionCodes: data.getAll("permissionCodes").map(String),
    };
    if (!id) payload.code = `CUSTOM_${Date.now().toString(36).toUpperCase()}`;
    setBusy(elements.roleForm, true);
    try {
      if (id) await FarockAPI.patch(`roles/${id}`, payload);
      else await FarockAPI.post("roles", payload);
      elements.roleDialog.close();
      await loadRoles();
      await loadUsers();
      showToast(id ? "角色已保存" : "角色已创建");
    } catch (error) { showFormError(elements.roleForm, error.message); }
    finally { setBusy(elements.roleForm, false); }
  }

  async function deleteRole() {
    const id = elements.roleForm.elements.id.value;
    const role = state.roles.find((item) => item.id === id);
    if (!role || role.isSystem || !confirm(`确定删除角色“${role.name}”吗？`)) return;
    elements.roleDeleteButton.disabled = true;
    try {
      await FarockAPI.delete(`roles/${id}`);
      elements.roleDialog.close();
      await loadRoles();
      showToast("角色已删除");
    } catch (error) { showFormError(elements.roleForm, error.message); }
    finally { elements.roleDeleteButton.disabled = false; }
  }

  let searchTimer;
  elements.search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.page = 1; loadUsers(); }, 250); });
  [elements.position, elements.role, elements.organization, elements.active].forEach((control) => control.addEventListener("change", () => { state.page = 1; loadUsers(); }));
  elements.refresh.addEventListener("click", loadUsers);
  elements.prev.addEventListener("click", () => { if (state.page > 1) { state.page -= 1; loadUsers(); } });
  elements.next.addEventListener("click", () => { if (state.page < state.totalPages) { state.page += 1; loadUsers(); } });
  elements.createButton?.addEventListener("click", () => { clearFormError(elements.createForm); syncPlacementFields(elements.createForm); elements.createDialog.showModal(); });
  elements.passwordButton?.addEventListener("click", () => { elements.passwordForm.reset(); clearFormError(elements.passwordForm); elements.passwordDialog.showModal(); });
  elements.positionCreateButton?.addEventListener("click", () => { clearFormError(elements.positionCreateForm); elements.positionCreateDialog.showModal(); });
  elements.roleCreateButton?.addEventListener("click", () => openRole());
  [elements.createForm, elements.editForm].forEach((form) => {
    form.elements.positionId.addEventListener("change", () => syncPlacementFields(form));
    form.elements.roleId.addEventListener("change", () => syncPlacementFields(form));
  });
  elements.createForm.addEventListener("submit", submitCreate);
  elements.editForm.addEventListener("submit", submitEdit);
  elements.passwordForm.addEventListener("submit", submitPassword);
  elements.positionCreateForm.addEventListener("submit", submitPosition);
  elements.roleForm?.addEventListener("submit", submitRole);
  elements.deleteButton.addEventListener("click", deleteMember);
  elements.roleDeleteButton?.addEventListener("click", deleteRole);
  document.querySelectorAll("[data-dialog-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));

  let initialized = false;
  function initializeForCurrentUser() {
    if (initialized || !currentUser?.id) return;
    initialized = true;
    Promise.all([loadOrganizations(), loadPositions(), loadRoles()]).then(() => loadUsers());
  }

  window.addEventListener("farock:user-updated", (event) => {
    if (!event.detail?.id) return;
    currentUser = { ...(currentUser || {}), ...event.detail };
    initializeForCurrentUser();
  });
})();
