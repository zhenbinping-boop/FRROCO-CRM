(() => {
  "use strict";

  const api = window.FarockAPI;
  if (!api) return;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const currency = (value) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(Number(value) || 0);

  function messageCard(message, retry) {
    return `<div class="col-span-full bg-surface-white rounded-2xl border border-outline-variant/30 p-8 text-center" role="${retry ? "alert" : "status"}"><p class="text-on-surface-variant">${escapeHtml(message)}</p>${retry ? '<button class="mt-4 bg-primary text-on-primary px-5 py-2.5 rounded-lg" type="button" data-api-retry>重新加载</button>' : ""}</div>`;
  }

  function customerCard(customer) {
    const dealer = customer.storeType === "DEALER";
    const owner = dealer ? customer.dealerGroup?.dealerName : customer.store?.storeName;
    const location = [customer.regionProvince, customer.regionCity, customer.regionDistrict].filter(Boolean).join(" / ");
    return `<article class="bg-surface-white rounded-3xl p-6 shadow-sm border border-outline-variant/30 hover:shadow-lg transition-shadow flex flex-col group" data-operation-mode="${customer.storeType}" data-province="${escapeHtml(customer.regionProvince)}" data-city="${escapeHtml(customer.regionCity)}" data-store="${escapeHtml(customer.store?.id || "")}" data-store-label="${escapeHtml(customer.store?.storeName || "")}" data-dealer-group="${escapeHtml(customer.dealerGroupId || "")}" data-dealer-group-label="${escapeHtml(customer.dealerGroup?.dealerName || customer.dealerGroupId || "")}" data-tier="${customer.tier}" data-created-at="${customer.createdAt}">
      <div class="flex justify-between items-start mb-4 gap-2"><div class="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center"><span class="material-symbols-outlined">${dealer ? "storefront" : "business"}</span></div><div class="flex gap-2"><span class="bg-secondary-fixed px-2.5 py-1 rounded-md font-bold">${customer.tier}级</span><span class="customer-mode-badge ${dealer ? "customer-mode-dealer" : "customer-mode-direct"}"><span class="material-symbols-outlined">${dealer ? "storefront" : "business"}</span>${dealer ? "代理商" : "直营"}</span></div></div>
      <h3 class="font-headline-md text-headline-md text-primary mb-1">${escapeHtml(customer.name)}</h3>
      <p class="font-body-md text-body-md text-on-surface-variant mb-6 line-clamp-2">${escapeHtml(customer.personaSummary || customer.whyFarock || "客户画像待完善")}</p>
      <div class="space-y-3 mt-auto"><div class="flex items-center gap-2 text-on-surface-variant"><span class="material-symbols-outlined text-[18px]">location_on</span><span>${escapeHtml(location)}</span></div><div class="flex justify-between items-center gap-3 pt-4 border-t border-outline-variant/20"><span class="truncate text-on-surface-variant">${escapeHtml(owner || "归属待完善")}</span><a class="text-primary whitespace-nowrap" href="customer-detail.html?id=${encodeURIComponent(customer.id)}">查看详情</a></div></div>
    </article>`;
  }

  async function loadCustomers() {
    const grid = document.querySelector("[data-customer-grid]");
    if (!grid) return;
    const total = document.querySelector("[data-customer-total]");
    grid.innerHTML = messageCard("正在加载客户数据...");
    try {
      const firstPage = await api.get("/customers?page=1&pageSize=100");
      const totalPages = Number(firstPage.meta?.totalPages) || 1;
      const remaining = totalPages > 1 ? await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => (
        api.get(`/customers?page=${index + 2}&pageSize=100`)
      ))) : [];
      const customers = [firstPage, ...remaining].flatMap((page) => page.data);
      grid.innerHTML = customers.length ? customers.map(customerCard).join("") : messageCard("暂无客户数据");
      if (total) total.textContent = `${firstPage.meta.total} 位客户`;
      grid._farockRefreshOptions?.();
      grid._farockRender?.();
    } catch (error) {
      grid.innerHTML = messageCard(`客户数据加载失败：${error.message}`, true);
      if (total) total.textContent = "加载失败";
      grid.querySelector("[data-api-retry]")?.addEventListener("click", loadCustomers);
    }
  }

  async function loadDashboard() {
    const ranking = document.querySelector("[data-dashboard-ranking]");
    if (!ranking) return;
    const dashboard = ranking.closest("main") || ranking;
    ranking.innerHTML = messageCard("正在加载业绩数据...");
    try {
      const { data } = await api.get("/analytics/dashboard");
      const metrics = data.metrics;
      dashboard.querySelector("[data-dashboard-new-customers]").textContent = metrics.newCustomers;
      dashboard.querySelector("[data-dashboard-new-change]").textContent = `待跟进 ${metrics.pendingTasks} 项`;
      dashboard.querySelector("[data-dashboard-success-rate]").textContent = `${metrics.conversionRate}%`;
      dashboard.querySelector("[data-dashboard-success-gauge]")?.setAttribute("stroke-dasharray", `${metrics.conversionRate}, 100`);
      dashboard.querySelector("[data-dashboard-revenue]").textContent = currency(metrics.totalRevenue);
      ranking.innerHTML = data.ranking.length ? `<div class="bg-surface-white rounded-2xl border border-outline-variant/30 overflow-hidden min-w-[680px] w-full"><div class="grid grid-cols-[72px_1fr_140px_180px] gap-4 px-6 py-4 bg-surface-container-low"><span>排名</span><span>姓名</span><span class="text-right">客户数</span><span class="text-right">业绩金额</span></div>${data.ranking.map((item) => `<div class="grid grid-cols-[72px_1fr_140px_180px] gap-4 px-6 py-4 border-t border-outline-variant/20"><span>${item.rank}</span><strong>${escapeHtml(item.name)}</strong><span class="text-right">${item.customers}</span><span class="text-right">${currency(item.revenue)}</span></div>`).join("")}</div>` : messageCard("暂无排行榜数据");
    } catch (error) {
      dashboard.querySelectorAll("[data-dashboard-value]").forEach((element) => { element.textContent = "--"; });
      ranking.innerHTML = messageCard(`看板数据加载失败：${error.message}`, true);
      ranking.querySelector("[data-api-retry]")?.addEventListener("click", loadDashboard);
    }
  }

  loadCustomers();
  loadDashboard();
})();
