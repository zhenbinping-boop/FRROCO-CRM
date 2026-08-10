(() => {
  "use strict";

  const id = new URLSearchParams(location.search).get("id");
  const api = window.FarockAPI;
  const stageLabels = { LEAD: "潜在客户", FOLLOWING: "跟进中", PROPOSAL: "方案阶段", CONTRACTED: "已成交", LOST: "已流失" };
  const currency = (value) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(Number(value) || 0);
  const setText = (selector, value) => { const element = document.querySelector(selector); if (element) element.textContent = value || "-"; };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  let customer;

  function render(data) {
    customer = data;
    setText("[data-customer-name]", data.name);
    setText("[data-customer-contact]", [data.phone, data.wechat ? `微信：${data.wechat}` : ""].filter(Boolean).join("\n"));
    setText("[data-customer-tier]", `${data.tier}级客户`);
    setText("[data-customer-stage]", stageLabels[data.stage] || data.stage);
    setText("[data-customer-house]", [data.houseType, data.projectName].filter(Boolean).join(" / ") || "户型待完善");
    setText("[data-customer-community]", data.community || "小区待完善");
    setText("[data-customer-location]", [data.regionProvince, data.regionCity, data.regionDistrict].filter(Boolean).join(" / "));
    setText("[data-customer-persona]", data.personaSummary || "客户画像待完善");

    const followUps = document.querySelector("[data-customer-followups]");
    if (followUps) followUps.innerHTML = data.followUps.length ? data.followUps.map((item, index) => `<div class="relative pl-6"><div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full ${index ? "bg-outline-variant" : "bg-primary"} border-4 border-surface-white"></div><p class="font-label-md text-label-md text-on-surface-variant mb-1">${new Date(item.followedAt).toLocaleString("zh-CN")} · ${escapeHtml(item.author?.name || "系统")}</p><div class="bg-surface-container-low p-4 rounded-lg border border-masked-gray"><p class="font-body-md text-body-md text-primary">${escapeHtml(item.content)}</p></div></div>`).join("") : '<p class="pl-6 text-on-surface-variant">暂无跟进记录</p>';

    const order = document.querySelector("[data-customer-order-summary]");
    if (order) order.innerHTML = `<h3 class="font-label-md text-label-md text-on-surface-variant mb-3">订购信息</h3><div class="bg-surface-container-low p-4 rounded-lg border border-masked-gray"><p class="font-body-md text-body-md text-primary mb-1">${escapeHtml(data.productSeries.join("、") || "产品系列待完善")}</p><p class="font-body-md text-body-md text-on-surface-variant">订购年份：${escapeHtml(data.dealYear || "-")} · ${escapeHtml(data.store?.storeName || "-")}</p></div>`;
    const payment = document.querySelector("[data-customer-payment-summary]");
    const total = Number(data.totalAmount) || 0;
    const deposit = Number(data.depositAmount) || 0;
    const percent = total ? Math.min(100, Math.round((deposit / total) * 100)) : 0;
    if (payment) payment.innerHTML = `<h3 class="font-label-md text-label-md text-on-surface-variant mb-3">付款进度</h3><div class="flex justify-between font-data-mono text-data-mono mb-2"><span>${currency(deposit)} 已付</span><span class="text-outline">${currency(Math.max(0, total - deposit))} 待付</span></div><div class="w-full bg-surface-variant rounded-full h-3 mb-2 overflow-hidden"><div class="bg-primary h-3 rounded-full" style="width:${percent}%"></div></div><p class="text-right text-on-surface-variant">${percent}%</p>`;
    const why = document.querySelector("[data-customer-why]");
    if (why) why.innerHTML = `<li class="flex items-start"><span class="material-symbols-outlined text-status-sage mr-2">check_circle</span><span>${escapeHtml(data.whyFarock || "选择原因待完善")}</span></li>`;
  }

  function openEditor() {
    if (!customer) return;
    const backdrop = document.createElement("div");
    backdrop.className = "farock-modal-backdrop";
    backdrop.innerHTML = `<section class="farock-modal" role="dialog" aria-modal="true"><header class="farock-modal-header"><h2>编辑客户</h2><button type="button" data-close aria-label="关闭"><span class="material-symbols-outlined">close</span></button></header><form><div class="farock-modal-body grid grid-cols-1 md:grid-cols-2 gap-4">
      ${field("name", "客户姓名", customer.name, true)}${field("phone", "联系电话", customer.phone, true)}${field("wechat", "微信号", customer.wechat)}${select("tier", "客户等级", ["S","A","B","C"], customer.tier)}${select("stage", "跟进状态", Object.keys(stageLabels), customer.stage, stageLabels)}${field("ageGroup", "年龄段", customer.ageGroup)}${field("community", "小区", customer.community)}${field("houseType", "户型", customer.houseType)}${field("dealYear", "订购年份", customer.dealYear, false, "number")}${field("totalAmount", "订购金额", customer.totalAmount, false, "number")}${field("depositAmount", "已付定金", customer.depositAmount, false, "number")}${field("productSeries", "产品系列（顿号分隔）", customer.productSeries.join("、"))}${area("whyFarock", "为什么选择法洛可", customer.whyFarock)}${area("personaSummary", "用户画像", customer.personaSummary)}
      </div><footer class="farock-modal-actions"><button class="farock-btn" type="button" data-close>取消</button><button class="farock-btn primary" type="submit">保存</button></footer></form></section>`;
    const close = () => backdrop.remove();
    backdrop.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", close));
    backdrop.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = event.currentTarget.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const values = Object.fromEntries(new FormData(event.currentTarget));
        values.productSeries = values.productSeries.split(/[、,，]/).map((value) => value.trim()).filter(Boolean);
        ["dealYear", "totalAmount", "depositAmount"].forEach((key) => { values[key] = values[key] === "" ? undefined : Number(values[key]); });
        const result = await api.patch(`/customers/${id}`, values);
        render({ ...customer, ...result.data });
        close();
      } catch (error) { submit.disabled = false; submit.textContent = error.message || "保存失败"; }
    });
    document.body.append(backdrop);
  }

  function field(name, label, value = "", required = false, type = "text") { return `<label class="farock-field"><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? "required" : ""}></label>`; }
  function area(name, label, value = "") { return `<label class="farock-field md:col-span-2"><span>${label}</span><textarea name="${name}" rows="3">${escapeHtml(value)}</textarea></label>`; }
  function select(name, label, options, value, labels = {}) { return `<label class="farock-field"><span>${label}</span><select name="${name}">${options.map((option) => `<option value="${option}" ${option === value ? "selected" : ""}>${labels[option] || option}</option>`).join("")}</select></label>`; }

  async function load() {
    if (!id) { setText("[data-customer-name]", "缺少客户编号"); return; }
    try { const result = await api.get(`/customers/${encodeURIComponent(id)}`); render(result.data); }
    catch (error) { setText("[data-customer-name]", "客户加载失败"); setText("[data-customer-contact]", error.message); }
  }
  const deleteButton = document.querySelector("#customer-delete-button");
  let session;
  try { session = JSON.parse(localStorage.getItem("farock-session") || "null"); } catch { session = null; }
  if (deleteButton && session?.role !== "ADMIN") deleteButton.remove();
  deleteButton?.addEventListener("click", async () => {
    const customerName = document.querySelector("[data-customer-name]")?.textContent?.trim() || "该客户";
    if (!window.confirm(`确认永久删除客户“${customerName}”吗？此操作无法撤销。`)) return;
    deleteButton.disabled = true;
    try {
      await api.delete(`/customers/${encodeURIComponent(id)}`);
      location.href = "customers.html";
    } catch (error) {
      deleteButton.disabled = false;
      window.alert(error.message || "客户删除失败");
    }
  });
  document.querySelector("#customer-edit-button")?.addEventListener("click", openEditor);
  load();
})();
