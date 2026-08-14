(() => {
  "use strict";
  if (window.FarockCustomerBulkLoaded) return;
  window.FarockCustomerBulkLoaded = true;

  const MAX_SELECTED = 100;
  const selectedIds = new Set();
  const customerBatch = { update: "/customers/batch", remove: "/customers/batch-delete" };
  const toolbar = () => document.querySelector("[data-customer-bulk-toolbar]");
  const grid = () => document.querySelector("[data-customer-grid]");

  function showMessage(message, error = false) {
    let stack = document.querySelector(".farock-toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "farock-toast-stack";
      stack.setAttribute("aria-live", "polite");
      document.body.append(stack);
    }
    const item = document.createElement("div");
    item.className = `farock-toast${error ? " error" : " success"}`;
    item.innerHTML = `<span class="material-symbols-outlined">${error ? "error" : "check_circle"}</span><span></span>`;
    item.lastElementChild.textContent = message;
    stack.append(item);
    setTimeout(() => item.remove(), 4200);
  }

  function renderToolbar() {
    const element = toolbar();
    if (!element) return;
    const count = selectedIds.size;
    element.classList.toggle("hidden", count === 0);
    element.classList.toggle("flex", count > 0);
    element.querySelector("[data-customer-bulk-count]").textContent = String(count);
    element.querySelector("[data-customer-bulk-edit]").disabled = count === 0;
    element.querySelector("[data-customer-bulk-delete]").disabled = count === 0;
    grid()?.querySelectorAll("[data-customer-select]").forEach((input) => {
      input.checked = selectedIds.has(input.value);
    });
  }

  function selectCard(id, checked) {
    if (checked && !selectedIds.has(id) && selectedIds.size >= MAX_SELECTED) {
      showMessage("一次最多选择 100 位客户", true);
      return false;
    }
    if (checked) selectedIds.add(id); else selectedIds.delete(id);
    renderToolbar();
    return true;
  }

  function selectVisible() {
    const cards = [...(grid()?.querySelectorAll("article[data-customer-id]") || [])]
      .filter((card) => !card.classList.contains("farock-hidden"));
    const candidates = cards.filter((card) => !selectedIds.has(card.dataset.customerId));
    const available = Math.max(0, MAX_SELECTED - selectedIds.size);
    candidates.slice(0, available).forEach((card) => selectedIds.add(card.dataset.customerId));
    if (candidates.length > available) showMessage("当前筛选结果超过 100 位，仅选择前 100 位", true);
    renderToolbar();
  }

  function focusCustomerGrid() {
    const customerGrid = grid();
    if (!customerGrid) return;
    customerGrid.tabIndex = -1;
    customerGrid.focus();
  }

  function closeModal(backdrop, restoreFocus = true) {
    backdrop.remove();
    document.removeEventListener("keydown", backdrop._onKeyDown);
    if (restoreFocus) backdrop._returnFocus?.focus?.();
  }

  function openEditModal() {
    const returnFocus = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.className = "farock-modal-backdrop";
    backdrop.innerHTML = `<section class="farock-modal" role="dialog" aria-modal="true" aria-labelledby="customer-bulk-edit-title"><header class="farock-modal-header"><h2 id="customer-bulk-edit-title">批量修改客户</h2><button aria-label="关闭" data-customer-bulk-close type="button"><span class="material-symbols-outlined">close</span></button></header><form><div class="farock-modal-body"><p class="text-on-surface-variant">已选择 ${selectedIds.size} 位客户。勾选要修改的字段，未勾选字段保持不变。</p><label class="farock-bulk-field"><input name="tierEnabled" type="checkbox"><span>客户等级</span><select disabled name="tier"><option value="S">S</option><option value="A">A</option><option value="B" selected>B</option><option value="C">C</option></select></label><label class="farock-bulk-field"><input name="stageEnabled" type="checkbox"><span>跟进阶段</span><select disabled name="stage"><option value="LEAD">线索</option><option value="FOLLOWING">跟进中</option><option value="PROPOSAL">方案中</option><option value="CONTRACTED">已签约</option><option value="LOST">已流失</option></select></label><label class="farock-bulk-field"><input name="sourceEnabled" type="checkbox"><span>客户来源</span><input disabled maxlength="160" name="customerSource" type="text"></label><label class="farock-bulk-field"><input name="notesEnabled" type="checkbox"><span>备注</span><textarea disabled name="notes" rows="3"></textarea></label><p class="hidden farock-bulk-error" data-customer-bulk-error role="alert"></p></div><footer class="farock-modal-actions"><button class="farock-btn" data-customer-bulk-close type="button">取消</button><button class="farock-btn primary" data-customer-bulk-submit type="submit">保存修改</button></footer></form></section>`;
    document.body.append(backdrop);
    const form = backdrop.querySelector("form");
    const dialog = backdrop.querySelector('[role="dialog"]');
    const error = backdrop.querySelector("[data-customer-bulk-error]");
    const submit = backdrop.querySelector("[data-customer-bulk-submit]");
    const enableFields = () => ["tier", "stage", "customerSource", "notes"].forEach((name) => {
      const control = form.elements[name];
      control.disabled = !form.elements[`${name === "customerSource" ? "source" : name}Enabled`].checked;
    });
    form.querySelectorAll('input[type="checkbox"]').forEach((input) => input.addEventListener("change", enableFields));
    backdrop.querySelectorAll("[data-customer-bulk-close]").forEach((button) => button.addEventListener("click", () => closeModal(backdrop)));
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) closeModal(backdrop); });
    backdrop._returnFocus = returnFocus;
    backdrop._onKeyDown = (event) => {
      if (event.key === "Escape") {
        closeModal(backdrop);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", backdrop._onKeyDown);
    backdrop.querySelector("[data-customer-bulk-close]")?.focus();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const changes = {};
      if (form.elements.tierEnabled.checked) changes.tier = form.elements.tier.value;
      if (form.elements.stageEnabled.checked) changes.stage = form.elements.stage.value;
      if (form.elements.sourceEnabled.checked) changes.customerSource = form.elements.customerSource.value.trim();
      if (form.elements.notesEnabled.checked) changes.notes = form.elements.notes.value;
      if (!Object.keys(changes).length) {
        error.textContent = "至少启用一个修改字段";
        error.classList.remove("hidden");
        return;
      }
      submit.disabled = true;
      const count = selectedIds.size;
      try {
        await window.FarockAPI.patch(customerBatch.update, { ids: [...selectedIds], changes });
        closeModal(backdrop, false);
        if (await refreshAfterMutation()) showMessage(`已修改 ${Object.keys(changes).length} 个字段，共 ${count} 位客户`);
      } catch (requestError) {
        if (!backdrop.isConnected) {
          showMessage(requestError.message || "批量修改后刷新失败", true);
          return;
        }
        error.textContent = requestError.message || "批量修改失败";
        error.classList.remove("hidden");
        submit.disabled = false;
      }
    });
  }

  async function refreshAfterMutation() {
    const refresh = window.FarockCustomers?.refresh;
    selectedIds.clear();
    renderToolbar();
    if (typeof refresh !== "function") {
      showMessage("操作已完成，但客户列表刷新入口不可用，请手动刷新页面", true);
      return false;
    }
    await refresh();
    focusCustomerGrid();
    return true;
  }

  async function deleteSelected() {
    if (deleteSelected.busy) return;
    const count = selectedIds.size;
    if (!window.confirm(`确定删除已选择的 ${count} 位客户吗？\n已有订单或回款记录的客户将保留，并返回失败明细。`)) return;
    deleteSelected.busy = true;
    const button = document.querySelector("[data-customer-bulk-delete]");
    if (button) button.disabled = true;
    try {
      const result = await window.FarockAPI.post(customerBatch.remove, { ids: [...selectedIds] });
      const deleted = Number(result.data?.deleted) || 0;
      const failed = result.data?.failed || [];
      if (!await refreshAfterMutation()) return;
      const detail = failed.map((item) => `${item.id}：${item.message}`).join("；");
      showMessage(failed.length ? `已删除 ${deleted} 位客户，${failed.length} 位客户因已有订单或回款未删除。${detail}` : `已删除 ${deleted} 位客户` , Boolean(failed.length));
    } catch (error) {
      showMessage(error.message || "批量删除失败", true);
    } finally {
      deleteSelected.busy = false;
      renderToolbar();
    }
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest?.("[data-customer-select]");
    if (target) {
      event.stopPropagation();
      return;
    }
    if (event.target.closest?.("[data-customer-bulk-select-visible]")) selectVisible();
    if (event.target.closest?.("[data-customer-bulk-clear]")) {
      selectedIds.clear();
      renderToolbar();
    }
    if (event.target.closest?.("[data-customer-bulk-edit]")) openEditModal();
    if (event.target.closest?.("[data-customer-bulk-delete]")) void deleteSelected();
  }, true);

  document.addEventListener("change", (event) => {
    if (event.target.matches?.("[data-customer-select]")) {
      event.stopPropagation();
      if (!selectCard(event.target.value, event.target.checked)) event.target.checked = false;
    }
  }, true);

  document.addEventListener("farock:customers-loaded", () => {
    const ids = new Set([...document.querySelectorAll("[data-customer-select]")].map((input) => input.value));
    [...selectedIds].forEach((id) => { if (!ids.has(id)) selectedIds.delete(id); });
    renderToolbar();
  });

  renderToolbar();
})();
