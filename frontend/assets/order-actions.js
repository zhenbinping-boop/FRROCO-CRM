(() => {
  "use strict";
  window.FAROCK_ORDERS_API = true;
  const api = window.FarockAPI;
  const body = document.querySelector("#orders-table-body") || document.querySelector("table tbody");
  if (!api || !body) return;

  const tabs = [...document.querySelectorAll("[data-order-tab]")];
  const statusFilter = document.querySelector("#order-status-filter");
  const search = document.querySelector("#order-search");
  const previous = document.querySelector("#order-page-prev");
  const next = document.querySelector("#order-page-next");
  const summary = document.querySelector("#order-pagination-summary");
  const indicator = document.querySelector("#order-page-indicator");
  const pageSize = 10;
  let page = 1;
  let tab = "all";
  let requestId = 0;
  const statusLabels = { DRAFT: "草稿", CONFIRMED: "已确认", IN_PRODUCTION: "生产中", COMPLETED: "已完成", CANCELED: "已取消" };
  const money = (value) => `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const escape = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

  function row(order) {
    const total = Number(order.totalAmount || 0);
    const paid = Number(order.paidAmount || 0);
    const balance = Math.max(0, total - paid);
    const status = statusLabels[order.status] || order.status;
    return `<tr class="hover:bg-surface-container-low/50 transition-colors group" data-order-id="${escape(order.id)}" data-order-status="${escape(order.status)}" data-has-balance="${balance > 0}">
      <td class="py-4 px-6 font-data-mono text-primary font-medium">${escape(order.orderNumber)}</td>
      <td class="py-4 px-6 font-medium text-primary">${escape(order.customer?.name)}</td>
      <td class="py-4 px-6 text-on-surface-variant">${escape((order.productSeries || []).join("、") || "未填写")}</td>
      <td class="py-4 px-6 text-right font-data-mono">${money(total)}</td>
      <td class="py-4 px-6 text-right font-data-mono text-secondary">${money(paid)}</td>
      <td class="py-4 px-6 text-right font-data-mono font-semibold ${balance ? "text-error-red" : "text-on-surface-variant"}">${money(balance)}</td>
      <td class="py-4 px-6 text-center"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${order.status === "COMPLETED" ? "bg-status-sage/20" : "bg-warning-amber/20"}">${escape(status)}</span></td>
      <td class="py-4 px-4 text-right"><button aria-label="订单操作" class="text-outline hover:text-primary transition-colors" data-order-actions type="button"><span class="material-symbols-outlined">more_vert</span></button></td>
    </tr>`;
  }

  async function load() {
    const current = ++requestId;
    body.innerHTML = `<tr><td class="py-8 text-center text-on-surface-variant" colspan="8">正在加载订单...</td></tr>`;
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const selectedStatus = statusFilter?.value;
    if (tab === "pending" || selectedStatus === "pending") params.set("hasBalance", "true");
    else if (tab === "completed") params.set("status", "COMPLETED");
    else if (selectedStatus && selectedStatus !== "all") params.set("status", selectedStatus.toUpperCase());
    if (search?.value.trim()) params.set("search", search.value.trim());
    try {
      const payload = await api.get(`/orders?${params}`);
      if (current !== requestId) return;
      const orders = payload.data || [];
      body.innerHTML = orders.length ? orders.map(row).join("") : `<tr><td class="py-8 text-center text-on-surface-variant" colspan="8">暂无符合条件的订单</td></tr>`;
      const meta = payload.meta || { page, total: orders.length, totalPages: 1 };
      page = meta.page;
      if (summary) summary.textContent = meta.total ? `显示第 ${(page - 1) * pageSize + 1} 至 ${Math.min(page * pageSize, meta.total)} 条，共 ${meta.total} 条订单` : "暂无订单";
      if (indicator) indicator.textContent = `第 ${page} / ${Math.max(1, meta.totalPages)} 页`;
      if (previous) previous.disabled = page <= 1;
      if (next) next.disabled = page >= meta.totalPages;
    } catch (error) {
      body.innerHTML = `<tr><td class="py-8 text-center text-error-red" colspan="8">${escape(error.message || "订单加载失败")}</td></tr>`;
    }
  }

  body.addEventListener("click", (event) => {
    const button = event.target.closest("[data-order-actions]");
    if (!button) return;
    const orderId = button.closest("tr")?.dataset.orderId;
    if (!orderId) return;
    window.location.href = `payment-entry.html?orderId=${encodeURIComponent(orderId)}`;
  });
  tabs.forEach((item) => item.addEventListener("click", () => { tab = item.dataset.orderTab || "all"; page = 1; load(); }));
  statusFilter?.addEventListener("change", () => { page = 1; load(); });
  let searchTimer;
  search?.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { page = 1; load(); }, 250); });
  previous?.addEventListener("click", () => { if (page > 1) { page -= 1; load(); } });
  next?.addEventListener("click", () => { page += 1; load(); });
  load();
})();
