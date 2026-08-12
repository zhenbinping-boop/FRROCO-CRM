(() => {
  "use strict";

  const roleLabels = { ADMIN: "管理员", SALES_REP: "导购", DESIGNER: "设计师", DEALER_USER: "代理商用户" };
  const state = { users: [], organizations: [], page: 1, totalPages: 1 };
  let currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem("farock-session") || "null"); } catch { currentUser = null; }

  const elements = {
    search: document.querySelector("#user-search"), role: document.querySelector("#user-role-filter"),
    organization: document.querySelector("#user-organization-filter"), active: document.querySelector("#user-active-filter"),
    body: document.querySelector("#user-table-body"), count: document.querySelector("#user-count"),
    page: document.querySelector("#user-page-label"), prev: document.querySelector("#user-prev"), next: document.querySelector("#user-next"),
    refresh: document.querySelector("#user-refresh"), createButton: document.querySelector("#user-create-button"),
    passwordButton: document.querySelector("#password-change-button"), createDialog: document.querySelector("#user-create-dialog"),
    editDialog: document.querySelector("#user-edit-dialog"), passwordDialog: document.querySelector("#password-dialog"),
    createForm: document.querySelector("#user-create-form"), editForm: document.querySelector("#user-edit-form"),
    passwordForm: document.querySelector("#password-form"), deleteButton: document.querySelector("#user-delete"), toast: document.querySelector("#user-toast"),
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
      phone: String(data.get("phone") || "").trim() || null, role: String(data.get("role") || ""),
      organizationId: String(data.get("organizationId") || "") || null, active: data.get("active") === "on",
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
      <td class="px-5 py-4"><span class="rounded-full bg-[#efefe9] px-2.5 py-1 text-xs font-semibold"></span></td>
      <td class="px-5 py-4 text-[#4f5350]"></td>
      <td class="px-5 py-4"><span class="inline-flex items-center gap-1.5 text-sm font-medium"><i class="h-2 w-2 rounded-full"></i><b class="font-medium"></b></span></td>
      <td class="px-5 py-4 text-right"><button class="farock-button farock-button--secondary" type="button"><span class="material-symbols-outlined">manage_accounts</span><span>管理</span></button></td>`;
    const cells = row.cells;
    cells[0].querySelector(".grid").textContent = initials;
    cells[0].querySelector("strong").textContent = user.name;
    cells[0].querySelector(".text-xs").textContent = user.email + (user.phone ? ` · ${user.phone}` : "");
    cells[1].querySelector("span").textContent = roleLabels[user.role] || user.role;
    cells[2].textContent = user.organization?.name || "未指定";
    const status = cells[3].querySelector("span");
    status.querySelector("i").classList.add(user.active ? "bg-emerald-600" : "bg-[#9a9d99]");
    status.querySelector("b").textContent = user.active ? "已启用" : "已停用";
    cells[4].querySelector("button").addEventListener("click", () => openEdit(user));
    return row;
  }

  function renderUsers(meta) {
    elements.body.replaceChildren();
    if (!state.users.length) {
      const row = document.createElement("tr");
      row.innerHTML = '<td class="px-5 py-12 text-center text-[#666a67]" colspan="5">没有符合条件的成员</td>';
      elements.body.append(row);
    } else elements.body.append(...state.users.map(memberRow));
    elements.count.textContent = `共 ${meta.total} 名成员`;
    elements.page.textContent = `第 ${meta.page} / ${Math.max(meta.totalPages, 1)} 页`;
    elements.prev.disabled = meta.page <= 1;
    elements.next.disabled = meta.page >= meta.totalPages;
  }

  async function loadUsers() {
    elements.body.innerHTML = '<tr><td class="px-5 py-10 text-center text-[#666a67]" colspan="5">正在加载成员...</td></tr>';
    const params = new URLSearchParams({ page: String(state.page), pageSize: "50" });
    [["search", elements.search.value.trim()], ["role", elements.role.value], ["organizationId", elements.organization.value], ["active", elements.active.value]].forEach(([key, value]) => { if (value) params.set(key, value); });
    try {
      const payload = await FarockAPI.get(`users?${params}`);
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
      elements.body.innerHTML = '<tr><td class="px-5 py-10 text-center text-red-700" colspan="5"></td></tr>';
      elements.body.querySelector("td").textContent = error.message;
      elements.count.textContent = "加载失败";
    }
  }

  function fillOrganizationSelects() {
    document.querySelectorAll("[data-organization-select]").forEach((select) => {
      select.querySelectorAll("option:not(:first-child)").forEach((option) => option.remove());
      state.organizations.forEach((organization) => select.add(new Option(organization.name, organization.id)));
    });
    elements.organization.querySelectorAll("option:not(:first-child)").forEach((option) => option.remove());
    state.organizations.forEach((organization) => elements.organization.add(new Option(organization.name, organization.id)));
  }

  async function loadOrganizations() {
    try { state.organizations = (await FarockAPI.get("organizations")).data; fillOrganizationSelects(); }
    catch (error) { showToast(error.message); }
  }

  function openEdit(user) {
    const form = elements.editForm;
    form.elements.id.value = user.id;
    form.elements.name.value = user.name;
    form.elements.email.value = user.email;
    form.elements.phone.value = user.phone || "";
    form.elements.role.value = user.role;
    form.elements.organizationId.value = user.organizationId || "";
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
      elements.createDialog.close(); elements.createForm.reset(); elements.createForm.elements.active.checked = true;
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

  let searchTimer;
  elements.search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.page = 1; loadUsers(); }, 250); });
  [elements.role, elements.organization, elements.active].forEach((control) => control.addEventListener("change", () => { state.page = 1; loadUsers(); }));
  elements.refresh.addEventListener("click", loadUsers);
  elements.prev.addEventListener("click", () => { if (state.page > 1) { state.page -= 1; loadUsers(); } });
  elements.next.addEventListener("click", () => { if (state.page < state.totalPages) { state.page += 1; loadUsers(); } });
  elements.createButton?.addEventListener("click", () => { clearFormError(elements.createForm); elements.createDialog.showModal(); });
  elements.passwordButton?.addEventListener("click", () => { elements.passwordForm.reset(); clearFormError(elements.passwordForm); elements.passwordDialog.showModal(); });
  elements.createForm.addEventListener("submit", submitCreate);
  elements.editForm.addEventListener("submit", submitEdit);
  elements.passwordForm.addEventListener("submit", submitPassword);
  elements.deleteButton.addEventListener("click", deleteMember);
  document.querySelectorAll("[data-dialog-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));

  let initialized = false;
  function initializeForCurrentUser() {
    if (initialized || currentUser?.role !== "ADMIN") return;
    initialized = true;
    Promise.all([loadOrganizations(), loadUsers()]);
  }

  window.addEventListener("farock:user-updated", (event) => {
    if (!event.detail?.id) return;
    currentUser = { ...(currentUser || {}), ...event.detail };
    initializeForCurrentUser();
  });
})();
