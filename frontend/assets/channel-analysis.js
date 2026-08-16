(() => {
  "use strict";

  const main = document.querySelector("[data-analysis-page]");
  const api = window.FarockAPI;
  if (!main || !api) return;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const money = (value) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(Number(value) || 0);
  const integer = (value) => Number(value || 0).toLocaleString("zh-CN");
  const colors = ["#F2CC8F", "#84A59D", "#5c614d", "#747878", "#1b1c19", "#c4c7c7"];

  const elements = {
    totalLeads: main.querySelector("[data-analysis-total-leads]"),
    totalNote: main.querySelector("[data-analysis-total-note]"),
    conversionRate: main.querySelector("[data-analysis-conversion-rate]"),
    conversionNote: main.querySelector("[data-analysis-conversion-note]"),
    totalRevenue: main.querySelector("[data-analysis-total-revenue]"),
    revenueNote: main.querySelector("[data-analysis-revenue-note]"),
    revenueChart: main.querySelector("[data-analysis-revenue-chart]"),
    revenueLabels: main.querySelector("[data-analysis-revenue-labels]"),
    sourceChart: main.querySelector("[data-analysis-source-chart]"),
    sourceTotal: main.querySelector("[data-analysis-source-total]"),
    sourceLegend: main.querySelector("[data-analysis-source-legend]"),
    sourceTable: main.querySelector("[data-analysis-source-table]"),
  };

  function setLoading() {
    elements.totalLeads.textContent = "--";
    elements.conversionRate.textContent = "--";
    elements.totalRevenue.textContent = "--";
    elements.totalNote.textContent = "正在加载客户数据...";
    elements.conversionNote.textContent = "正在计算成交率...";
    elements.revenueNote.textContent = "正在汇总订单金额...";
    elements.revenueChart.innerHTML = '<p class="m-auto text-on-surface-variant">正在加载渠道金额...</p>';
    elements.revenueLabels.innerHTML = "";
    elements.sourceChart.className = "farock-source-chart w-48 h-48 rounded-full flex items-center justify-center";
    elements.sourceChart.removeAttribute("style");
    elements.sourceChart.innerHTML = '<span class="font-label-md text-label-md text-on-surface-variant">加载中</span>';
    elements.sourceTotal.textContent = "--";
    elements.sourceLegend.innerHTML = '<p class="text-center text-on-surface-variant">正在加载来源分布...</p>';
    elements.sourceTable.innerHTML = '<tr><td class="px-6 py-8 text-center text-on-surface-variant" colspan="5">正在加载渠道数据...</td></tr>';
  }

  function renderBars(sources) {
    const items = sources.slice(0, 6);
    if (!items.length) {
      elements.revenueChart.innerHTML = '<p class="m-auto text-on-surface-variant">暂无渠道金额数据</p>';
      elements.revenueLabels.innerHTML = "";
      return;
    }
    const maximum = Math.max(...items.map((item) => Number(item.revenue) || 0), 1);
    elements.revenueChart.innerHTML = items.map((item, index) => {
      const height = Math.round(((Number(item.revenue) || 0) / maximum) * 100);
      return `<div class="flex h-full flex-1 items-end justify-center group">
        <div class="relative w-10 rounded-t-md opacity-85 transition-opacity group-hover:opacity-100 md:w-14" style="height:${height}%;background:${colors[index % colors.length]}">
          <span class="absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-surface-container-high px-2 py-1 font-data-mono text-xs text-primary group-hover:block">${escapeHtml(money(item.revenue))}</span>
        </div>
      </div>`;
    }).join("");
    elements.revenueLabels.innerHTML = items.map((item) => `<span class="w-10 truncate text-center font-label-md text-label-md text-on-surface-variant md:w-14" title="${escapeHtml(item.source)}">${escapeHtml(item.source)}</span>`).join("");
  }

  function renderDistribution(sources, totalLeads) {
    if (!sources.length || !totalLeads) {
      elements.sourceChart.className = "farock-source-chart w-48 h-48 rounded-full bg-surface-container flex items-center justify-center";
      elements.sourceChart.removeAttribute("style");
      elements.sourceChart.innerHTML = '<span class="text-on-surface-variant">暂无数据</span>';
      elements.sourceTotal.textContent = "0 位客户";
      elements.sourceLegend.innerHTML = "";
      return;
    }
    let cursor = 0;
    const segments = sources.slice(0, colors.length).map((item, index) => {
      const start = cursor;
      cursor += (item.leads / totalLeads) * 100;
      return `${colors[index]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    });
    if (cursor < 100) segments.push(`#e3e3de ${cursor.toFixed(2)}% 100%`);
    elements.sourceChart.className = "farock-source-chart w-48 h-48 rounded-full";
    elements.sourceChart.style.background = `conic-gradient(${segments.join(",")})`;
    elements.sourceChart.innerHTML = "";
    elements.sourceTotal.textContent = `共 ${integer(totalLeads)} 位客户`;
    elements.sourceLegend.innerHTML = sources.slice(0, colors.length).map((item, index) => {
      const share = ((item.leads / totalLeads) * 100).toFixed(1);
      return `<div class="flex items-center justify-between gap-3"><div class="flex min-w-0 items-center gap-2"><span class="h-3 w-3 shrink-0 rounded-sm" style="background:${colors[index]}"></span><span class="truncate font-body-md text-body-md text-primary">${escapeHtml(item.source)}</span></div><span class="font-data-mono text-on-surface-variant">${share}%</span></div>`;
    }).join("");
  }

  function renderTable(sources) {
    elements.sourceTable.innerHTML = sources.length ? sources.map((item, index) => `<tr class="hover:bg-surface-container-low transition-colors">
      <td class="py-4 px-6 font-body-md text-primary font-medium"><span class="mr-3 inline-block h-3 w-3 rounded-sm" style="background:${colors[index % colors.length]}"></span>${escapeHtml(item.source)}</td>
      <td class="py-4 px-6 font-data-mono text-on-surface-variant">${integer(item.leads)}</td>
      <td class="py-4 px-6 font-data-mono text-primary">${Number(item.conversionRate || 0).toFixed(1)}%</td>
      <td class="py-4 px-6 font-data-mono text-on-surface-variant">${money(item.averageDealSize)}</td>
      <td class="py-4 px-6 font-data-mono text-primary font-medium text-right">${money(item.revenue)}</td>
    </tr>`).join("") : '<tr><td class="px-6 py-8 text-center text-on-surface-variant" colspan="5">暂无渠道数据</td></tr>';
  }

  async function load() {
    setLoading();
    try {
      const { data } = await api.get("/analytics/dashboard");
      const metrics = data.metrics || {};
      const sources = data.sourcePerformance || [];
      elements.totalLeads.textContent = integer(metrics.totalCustomers);
      elements.conversionRate.textContent = `${Number(metrics.conversionRate || 0).toFixed(1)}%`;
      elements.totalRevenue.textContent = money(metrics.totalRevenue);
      elements.totalNote.textContent = `本月新增 ${integer(metrics.newCustomers)} 位`;
      elements.conversionNote.textContent = `已成交 ${integer(metrics.contractedCustomers)} 位`;
      elements.revenueNote.textContent = `覆盖 ${integer(sources.length)} 个客户来源`;
      renderBars(sources);
      renderDistribution(sources, Number(metrics.totalCustomers) || 0);
      renderTable(sources);
    } catch (error) {
      elements.totalNote.textContent = error.message || "客户数据加载失败";
      elements.conversionNote.textContent = "--";
      elements.revenueNote.textContent = "--";
      elements.revenueChart.innerHTML = '<p class="m-auto text-error-red">渠道分析加载失败</p>';
      elements.revenueLabels.innerHTML = "";
      elements.sourceChart.className = "farock-source-chart w-48 h-48 rounded-full bg-surface-container flex items-center justify-center";
      elements.sourceChart.removeAttribute("style");
      elements.sourceChart.innerHTML = '<span class="text-error-red">加载失败</span>';
      elements.sourceTotal.textContent = "--";
      elements.sourceLegend.innerHTML = "";
      elements.sourceTable.innerHTML = `<tr><td class="px-6 py-8 text-center text-error-red" colspan="5">${escapeHtml(error.message || "渠道数据加载失败")}</td></tr>`;
    }
  }

  load();
})();
