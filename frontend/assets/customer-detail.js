(() => {
  "use strict";

  const id = new URLSearchParams(location.search).get("id");
  const api = window.FarockAPI;
  const emptyText = "未填写";
  const stageLabels = { LEAD: "潜在客户", FOLLOWING: "跟进中", PROPOSAL: "方案阶段", CONTRACTED: "已成交", LOST: "已流失" };
  const currency = (value) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 }).format(Number(value) || 0);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const valueOf = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");
  let customer;

  function setText(selector, value, fallback = emptyText) {
    const element = document.querySelector(selector);
    if (element) element.textContent = valueOf(value, fallback);
  }

  function formatDate(value, fallback = emptyText) {
    if (!value) return fallback;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("zh-CN");
  }

  function personName(data, nameKey, relationKey, idKey) {
    return valueOf(data[nameKey], data[relationKey]?.name, data[idKey]);
  }

  function renderTransactions(data) {
    const body = document.querySelector("[data-customer-transactions]");
    if (!body) return;
    const transactions = valueOf(data.transactions, data.customerTransactions, data.payments, []) || [];
    body.innerHTML = transactions.length ? transactions.map((item) => {
      const amount = Number(item.amount) || 0;
      const amountClass = amount < 0 ? "customer-ledger__amount--refund" : "customer-ledger__amount--income";
      const prefix = amount > 0 ? "+" : "";
      return `<tr><td>${escapeHtml(formatDate(valueOf(item.occurredAt, item.paidAt, item.date)))}</td><td class="customer-ledger__amount ${amountClass}">${prefix}${escapeHtml(currency(amount))}</td><td>${escapeHtml(valueOf(item.channel, item.method, emptyText))}</td><td>${escapeHtml(valueOf(item.progress, item.type, emptyText))}</td></tr>`;
    }).join("") : '<tr><td class="customer-empty" colspan="4">暂无财务流水</td></tr>';
  }

  function render(data) {
    customer = data;
    const sourceStore = [valueOf(data.sourceSheet, data.legacyStoreName), data.store?.storeName, data.dealerGroup?.dealerName].filter(Boolean).join(" / ");
    const address = valueOf(data.address, [data.regionProvince, data.regionCity, data.regionDistrict, data.community, data.projectName].filter(Boolean).join(" "));
    const dealDate = data.dealDate ? formatDate(data.dealDate) : (data.dealYear ? `${data.dealYear}年` : emptyText);

    setText("[data-customer-name]", data.name);
    setText("[data-customer-avatar]", String(data.name || "客").slice(0, 1));
    setText("[data-customer-contact]", [data.phone, data.wechat ? `微信：${data.wechat}` : ""].filter(Boolean).join(" · "));
    setText("[data-customer-mode]", data.storeType === "DEALER" ? "代理商客户" : data.storeType === "DIRECT" ? "直营客户" : emptyText);
    setText("[data-customer-tier]", data.tier ? `${data.tier} 级客户` : emptyText);
    setText("[data-customer-stage]", stageLabels[data.stage] || data.stage);

    const fields = {
      name: data.name,
      phone: data.phone,
      birthday: formatDate(data.birthday),
      isReturningCustomer: data.isReturningCustomer === true ? "是" : data.isReturningCustomer === false ? "否" : emptyText,
      address,
      sourceStore,
      customerSource: data.customerSource,
      salesRep: personName(data, "salesRepName", "salesRep", "salesRepId"),
      designer: personName(data, "designerName", "designer", "designerId"),
      referralDesigner: valueOf(data.referralDesignerName, data.referralDesigner),
      dealDate,
      totalAmount: currency(data.totalAmount),
      designRebateAmount: data.designRebateAmount == null ? emptyText : currency(data.designRebateAmount),
      designRebateStatus: data.designRebateStatus,
      invoiceAmount: data.invoiceAmount == null ? emptyText : currency(data.invoiceAmount),
      notes: valueOf(data.notes, data.remark),
    };
    Object.entries(fields).forEach(([key, value]) => setText(`[data-field="${key}"]`, value));
    renderTransactions(data);
  }

  function field(name, label, value = "", required = false, type = "text", attributes = "") {
    return `<label class="farock-field"><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? "required" : ""} ${attributes}></label>`;
  }

  function area(name, label, value = "", attributes = "") {
    return `<label class="farock-field md:col-span-2"><span>${label}</span><textarea name="${name}" rows="3" ${attributes}>${escapeHtml(value)}</textarea></label>`;
  }

  function select(name, label, options, value, labels = {}) {
    return `<label class="farock-field"><span>${label}</span><select name="${name}">${options.map((option) => `<option value="${option}" ${option === value ? "selected" : ""}>${labels[option] || option}</option>`).join("")}</select></label>`;
  }

  function dateInputValue(value) {
    if (!value) return "";
    const matched = String(value).match(/^\d{4}-\d{2}-\d{2}/);
    if (matched) return matched[0];
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }

  function checkbox(name, label, checked) {
    return `<label class="farock-field"><span>${label}</span><span style="display:flex;min-height:46px;align-items:center;gap:10px"><input name="${name}" type="checkbox" ${checked ? "checked" : ""} style="width:20px;height:20px;padding:0"><span>是</span></span></label>`;
  }

  function openEditor() {
    if (!customer) return;
    const backdrop = document.createElement("div");
    backdrop.className = "farock-modal-backdrop";
    backdrop.innerHTML = `<section class="farock-modal" role="dialog" aria-modal="true" aria-labelledby="customer-editor-title"><header class="farock-modal-header"><h2 id="customer-editor-title">编辑客户</h2><button type="button" data-close aria-label="关闭"><span class="material-symbols-outlined">close</span></button></header><form><div class="farock-modal-body grid grid-cols-1 md:grid-cols-2 gap-4">
      ${field("name", "客户姓名", customer.name, true)}${field("phone", "联系电话", customer.phone, true)}${field("wechat", "微信号", customer.wechat)}${field("birthday", "生日", dateInputValue(customer.birthday), false, "date")}${field("ageGroup", "年龄段", customer.ageGroup)}${checkbox("isReturningCustomer", "老客户", customer.isReturningCustomer)}${field("community", "小区", customer.community)}${field("houseType", "户型", customer.houseType)}${area("address", "地址", customer.address, 'maxlength="255"')}${field("customerSource", "客户来源", customer.customerSource, false, "text", 'maxlength="160"')}${field("salesRepName", "导购姓名", customer.salesRepName, false, "text", 'maxlength="100"')}${field("designerName", "设计师姓名", customer.designerName, false, "text", 'maxlength="100"')}${field("referralDesignerName", "带单设计师", customer.referralDesignerName, false, "text", 'maxlength="100"')}${select("tier", "客户等级", ["S", "A", "B", "C"], customer.tier)}${select("stage", "跟进状态", Object.keys(stageLabels), customer.stage, stageLabels)}${field("dealDate", "下单日期", dateInputValue(customer.dealDate), false, "date")}${field("dealYear", "订购年份", customer.dealYear, false, "number", 'min="2000" max="2100"')}${field("totalAmount", "订购金额", customer.totalAmount, false, "number", 'min="0" step="0.01"')}${field("depositAmount", "已付定金", customer.depositAmount, false, "number", 'min="0" step="0.01"')}${field("designRebateAmount", "设计返点金额", customer.designRebateAmount, false, "number", 'min="0" step="0.01"')}${field("designRebateStatus", "设计返点状态", customer.designRebateStatus, false, "text", 'maxlength="64"')}${field("invoiceAmount", "开发票金额", customer.invoiceAmount, false, "number", 'min="0" step="0.01"')}${field("productSeries", "产品系列（顿号分隔）", (customer.productSeries || []).join("、"))}${area("notes", "备注", customer.notes)}${area("whyFarock", "为什么选择法洛可", customer.whyFarock)}${area("personaSummary", "用户画像", customer.personaSummary)}
      </div><footer class="farock-modal-actions"><button class="farock-btn" type="button" data-close>取消</button><button class="farock-btn primary" type="submit">保存</button></footer></form></section>`;
    const close = () => backdrop.remove();
    backdrop.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", close));
    backdrop.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = event.currentTarget.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const values = Object.fromEntries(new FormData(event.currentTarget));
        values.isReturningCustomer = event.currentTarget.elements.isReturningCustomer.checked;
        values.productSeries = values.productSeries.split(/[、，,]/).map((value) => value.trim()).filter(Boolean);
        ["dealYear", "totalAmount", "depositAmount", "designRebateAmount", "invoiceAmount"].forEach((key) => { values[key] = values[key] === "" ? undefined : Number(values[key]); });
        ["birthday", "dealDate"].forEach((key) => { values[key] = values[key] || undefined; });
        const result = await api.patch(`/customers/${encodeURIComponent(id)}`, values);
        render({ ...customer, ...result.data });
        close();
      } catch (error) {
        submit.disabled = false;
        submit.textContent = error.message || "保存失败";
      }
    });
    document.body.append(backdrop);
  }

  async function load() {
    if (!id) {
      setText("[data-customer-name]", "缺少客户编号");
      setText("[data-customer-contact]", "请从客户列表重新进入详情页");
      return;
    }
    try {
      const result = await api.get(`/customers/${encodeURIComponent(id)}`);
      render(result.data);
    } catch (error) {
      setText("[data-customer-name]", "客户加载失败");
      setText("[data-customer-contact]", error.message || "无法读取客户资料");
      document.querySelector("[data-customer-contact]")?.classList.add("customer-load-error");
    }
  }

  const deleteButton = document.querySelector("#customer-delete-button");
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
