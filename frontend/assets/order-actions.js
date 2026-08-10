(() => {
  const rows = Array.from(document.querySelectorAll("tbody tr[data-order-status]"));
  const tabs = Array.from(document.querySelectorAll("[data-order-tab]"));
  const filterToggle = document.querySelector("#order-filter-toggle");
  const filterPanel = document.querySelector("#order-filter-panel");
  const statusFilter = document.querySelector("#order-status-filter");
  const previous = document.querySelector("#order-page-prev");
  const next = document.querySelector("#order-page-next");
  const summary = document.querySelector("#order-pagination-summary");
  const indicator = document.querySelector("#order-page-indicator");
  const pageSize = 2;
  let page = 1;
  let activeTab = "all";

  if (!rows.length || !summary || !indicator) return;

  const text = (row, selector) => row.querySelector(selector)?.textContent.trim() || "";
  const statusMatches = (row, value) => value === "all"
    || (value === "pending" && row.dataset.hasBalance === "true")
    || row.dataset.orderStatus === value;
  const tabMatches = (row) => activeTab === "all"
    || (activeTab === "pending" && row.dataset.hasBalance === "true")
    || (activeTab === "completed" && row.dataset.orderStatus === "completed");

  function closeMenus() {
    document.querySelectorAll("[data-order-menu]").forEach((menu) => menu.remove());
  }

  function showOrderDetails(row) {
    const orderId = text(row, "td:nth-child(1)");
    const customer = text(row, "td:nth-child(2)");
    const material = text(row, "td:nth-child(3)");
    const total = text(row, "td:nth-child(4)");
    const balance = text(row, "td:nth-child(6)");
    const status = text(row, "td:nth-child(7)");
    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4";
    overlay.setAttribute("role", "presentation");
    overlay.innerHTML = `
      <section aria-labelledby="order-details-title" aria-modal="true" class="w-full max-w-md rounded-xl border border-outline-variant bg-surface-white p-6 shadow-xl" role="dialog">
        <div class="mb-5 flex items-center justify-between border-b border-outline-variant/30 pb-4">
          <h2 class="font-headline-md text-headline-md text-primary" id="order-details-title">订单详情</h2>
          <button aria-label="关闭订单详情" class="rounded p-1 text-on-surface-variant hover:bg-surface-container-low hover:text-primary" data-order-close type="button">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <dl class="space-y-3 text-body-md">
          <div class="flex justify-between gap-4"><dt class="text-on-surface-variant">订单编号</dt><dd class="font-medium text-primary">${orderId}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-on-surface-variant">客户名称</dt><dd class="font-medium text-primary">${customer}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-on-surface-variant">材料系列</dt><dd class="text-right text-primary">${material}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-on-surface-variant">订单总额</dt><dd class="font-data-mono text-primary">${total}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-on-surface-variant">待付余额</dt><dd class="font-data-mono text-primary">${balance}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-on-surface-variant">状态</dt><dd class="text-primary">${status}</dd></div>
        </dl>
        <button class="mt-6 w-full rounded-lg bg-primary px-4 py-3 text-label-md text-on-primary hover:opacity-90" data-order-close type="button">关闭</button>
      </section>`;
    const close = () => overlay.remove();
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    overlay.querySelectorAll("[data-order-close]").forEach((button) => button.addEventListener("click", close));
    document.body.append(overlay);
  }

  function showOrderMenu(row, trigger) {
    closeMenus();
    const cell = trigger.parentElement;
    cell.classList.add("relative");
    const menu = document.createElement("div");
    menu.dataset.orderMenu = "true";
    menu.className = "absolute right-4 top-9 z-30 w-32 rounded-lg border border-outline-variant bg-surface-white p-1 shadow-lg";
    menu.innerHTML = `
      <button class="block w-full rounded px-3 py-2 text-left text-body-md text-on-surface hover:bg-surface-container-low" data-order-view type="button">查看订单</button>
      <button class="block w-full rounded px-3 py-2 text-left text-body-md text-on-surface hover:bg-surface-container-low" data-order-payment type="button">登记收款</button>`;
    menu.addEventListener("click", (event) => event.stopPropagation());
    menu.querySelector("[data-order-view]").addEventListener("click", () => {
      closeMenus();
      showOrderDetails(row);
    });
    menu.querySelector("[data-order-payment]").addEventListener("click", () => {
      const orderId = text(row, "td:nth-child(1)");
      window.location.href = `payment-entry.html?orderId=${encodeURIComponent(orderId)}`;
    });
    cell.append(menu);
  }

  function render() {
    const selectedStatus = statusFilter?.value || "all";
    const matching = rows.filter((row) => tabMatches(row) && statusMatches(row, selectedStatus));
    const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
    page = Math.min(page, pageCount);
    const start = (page - 1) * pageSize;
    const visible = new Set(matching.slice(start, start + pageSize));

    rows.forEach((row) => {
      row.classList.remove("farock-hidden");
      row.hidden = !visible.has(row);
    });
    summary.textContent = matching.length
      ? `显示第 ${start + 1} 至 ${Math.min(start + pageSize, matching.length)} 条，共 ${matching.length} 条订单`
      : "暂无符合条件的订单";
    indicator.textContent = `第 ${page} / ${pageCount} 页`;
    if (previous) previous.disabled = page <= 1;
    if (next) next.disabled = page >= pageCount;
    tabs.forEach((tab) => {
      const active = tab.dataset.orderTab === activeTab;
      tab.classList.toggle("bg-surface-container-low", active);
      tab.classList.toggle("text-primary", active);
      tab.classList.toggle("border", active);
      tab.classList.toggle("border-outline-variant/30", active);
      tab.setAttribute("aria-pressed", String(active));
    });
  }

  filterToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = filterPanel?.classList.toggle("hidden") === false;
    filterToggle.setAttribute("aria-expanded", String(open));
  });
  filterPanel?.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => {
    closeMenus();
    if (filterPanel && !filterPanel.classList.contains("hidden")) {
      filterPanel.classList.add("hidden");
      filterToggle?.setAttribute("aria-expanded", "false");
    }
  });
  statusFilter?.addEventListener("change", () => {
    page = 1;
    render();
  });
  tabs.forEach((tab) => tab.addEventListener("click", () => {
    activeTab = tab.dataset.orderTab || "all";
    page = 1;
    render();
  }));
  previous?.addEventListener("click", () => {
    if (page > 1) {
      page -= 1;
      render();
    }
  });
  next?.addEventListener("click", () => {
    page += 1;
    render();
  });
  document.querySelectorAll("[data-order-actions]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      showOrderMenu(button.closest("tr"), button);
    });
  });
  render();
})();
