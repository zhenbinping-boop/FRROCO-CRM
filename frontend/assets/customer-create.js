(() => {
  "use strict";

  window.FAROCK_CUSTOMER_CREATE_API = true;
  const main = document.querySelector("main");
  if (!main || !window.FarockAPI) return;

  const inputClass = "w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 focus:border-black focus:ring-1 focus:ring-black";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const field = (label, control, wide = false) => `<label class="${wide ? "md:col-span-2" : ""} block"><span class="block mb-2 text-sm font-semibold">${label}</span>${control}</label>`;
  const section = (title) => `<div class="md:col-span-2 mt-3 border-b border-gray-200 pb-4 first:mt-0"><h2 class="text-xl font-semibold">${title}</h2></div>`;

  main.innerHTML = `<div class="mx-auto max-w-5xl">
    <form class="farock-card grid grid-cols-1 gap-5 p-5 md:grid-cols-2 md:p-8" data-customer-create-form>
      ${section("客户基本身份")}
      ${field("客户姓名 *", `<input class="${inputClass}" name="name" required maxlength="100" autocomplete="name">`)}
      ${field("联系电话 *", `<input class="${inputClass}" name="phone" required type="tel" minlength="6" maxlength="32" autocomplete="tel">`)}
      ${field("微信号", `<input class="${inputClass}" name="wechat" maxlength="100">`)}
      ${field("生日", `<input class="${inputClass}" name="birthday" type="date">`)}
      ${field("年龄段", `<select class="${inputClass}" name="ageGroup"><option value="">请选择</option><option>25岁以下</option><option>25-34岁</option><option>35-44岁</option><option>45-54岁</option><option>55岁以上</option></select>`)}
      ${field("老客户", `<span class="flex min-h-12 items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4"><input class="h-5 w-5 rounded border-gray-300 text-black focus:ring-black" name="isReturningCustomer" type="checkbox"><span class="text-sm text-gray-600">该客户曾经购买或复购</span></span>`)}
      ${field("地址", `<textarea class="${inputClass}" name="address" rows="2" maxlength="255" placeholder="项目、小区及门牌地址"></textarea>`, true)}

      ${section("地区与归属")}
      ${field("经营模式 *", `<select class="${inputClass}" name="storeType" required><option value="DIRECT">直营</option><option value="DEALER">代理商</option></select>`)}
      ${field("归属门店 *", `<select class="${inputClass}" name="storeId" required><option value="">正在加载门店...</option></select>`)}
      ${field("代理商分组", `<select class="${inputClass}" name="dealerGroupId" disabled><option value="">直营客户无需选择</option></select>`)}
      ${field("省份 *", `<input class="${inputClass}" name="regionProvince" required maxlength="64">`)}
      ${field("城市 *", `<input class="${inputClass}" name="regionCity" required maxlength="64">`)}
      ${field("区县 *", `<input class="${inputClass}" name="regionDistrict" required maxlength="64">`)}
      ${field("小区 / 项目", `<input class="${inputClass}" name="community" maxlength="120">`)}
      ${field("户型", `<input class="${inputClass}" name="houseType" maxlength="64">`)}

      ${section("来源与服务团队")}
      ${field("客户来源", `<input class="${inputClass}" name="customerSource" maxlength="160" placeholder="例如：店面、乐屋客户、东易日盛">`)}
      ${field("导购姓名", `<input class="${inputClass}" name="salesRepName" maxlength="100">`)}
      ${field("设计师姓名", `<input class="${inputClass}" name="designerName" maxlength="100">`)}
      ${field("带单设计师", `<input class="${inputClass}" name="referralDesignerName" maxlength="100">`)}

      ${section("订单与合同")}
      ${field("客户等级", `<select class="${inputClass}" name="tier"><option>S</option><option>A</option><option selected>B</option><option>C</option></select>`)}
      ${field("下单日期", `<input class="${inputClass}" name="dealDate" type="date">`)}
      ${field("订购年份", `<input class="${inputClass}" name="dealYear" type="number" min="2000" max="2100">`)}
      ${field("下单金额", `<input class="${inputClass}" name="totalAmount" type="number" min="0" step="0.01" value="0">`)}
      ${field("已付定金", `<input class="${inputClass}" name="depositAmount" type="number" min="0" step="0.01" value="0">`)}
      ${field("设计返点金额", `<input class="${inputClass}" name="designRebateAmount" type="number" min="0" step="0.01" value="0">`)}
      ${field("设计返点状态", `<select class="${inputClass}" name="designRebateStatus"><option value="">请选择</option><option>未返点</option><option>部分返点</option><option>已返点</option></select>`)}
      ${field("开发票金额", `<input class="${inputClass}" name="invoiceAmount" type="number" min="0" step="0.01" value="0">`)}
      ${field("产品系列（顿号分隔）", `<input class="${inputClass}" name="productSeries" placeholder="极简隐形门、全屋衣帽间">`, true)}
      ${field("备注", `<textarea class="${inputClass}" name="notes" rows="3" placeholder="合同、返点或客户相关补充说明"></textarea>`, true)}

      ${section("客户画像")}
      ${field("为什么选择法洛可", `<textarea class="${inputClass}" name="whyFarock" rows="3"></textarea>`, true)}
      ${field("用户画像总结", `<textarea class="${inputClass}" name="personaSummary" rows="4"></textarea>`, true)}
      <p class="hidden md:col-span-2 rounded-2xl bg-red-50 px-4 py-3 text-red-700" data-form-error role="alert"></p>
      <div class="md:col-span-2 flex justify-end gap-3 pt-3"><a class="farock-button farock-button--secondary" href="customers.html">取消</a><button class="farock-button farock-button--primary" type="submit">保存客户</button></div>
    </form>
  </div>`;

  const form = main.querySelector("form");
  const modeSelect = form.elements.storeType;
  const storeSelect = form.elements.storeId;
  const dealerSelect = form.elements.dealerGroupId;
  const errorBox = form.querySelector("[data-form-error]");
  let stores = [];
  let groups = [];

  function renderStores() {
    const mode = modeSelect.value;
    const available = stores.filter((store) => store.storeType === mode);
    storeSelect.innerHTML = `<option value="">请选择门店</option>${available.map((store) => `<option value="${escapeHtml(store.id)}">${escapeHtml(`${store.regionProvince}${store.regionCity} · ${store.storeName}`)}</option>`).join("")}`;
    dealerSelect.disabled = mode !== "DEALER";
    dealerSelect.innerHTML = mode === "DEALER"
      ? `<option value="">请选择代理商分组</option>${groups.map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(`${group.regionProvince}${group.regionCity} · ${group.dealerName}`)}</option>`).join("")}`
      : '<option value="">直营客户无需选择</option>';
  }

  function syncStore() {
    const store = stores.find((item) => item.id === storeSelect.value);
    if (!store) return;
    form.elements.regionProvince.value = store.regionProvince;
    form.elements.regionCity.value = store.regionCity;
    form.elements.regionDistrict.value = store.regionDistrict || "";
    if (store.storeType === "DEALER") dealerSelect.value = store.dealerGroupId || "";
  }

  modeSelect.addEventListener("change", renderStores);
  storeSelect.addEventListener("change", syncStore);

  (async () => {
    try {
      stores = (await window.FarockAPI.get("/stores")).data;
      groups = (await window.FarockAPI.get("/dealer-groups")).data;
      renderStores();
    } catch (error) {
      errorBox.textContent = error.message || "门店数据加载失败";
      errorBox.classList.remove("hidden");
    }
  })();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.classList.add("hidden");
    const submit = form.querySelector('[type="submit"]');
    const values = Object.fromEntries(new FormData(form));
    values.isReturningCustomer = form.elements.isReturningCustomer.checked;
    values.productSeries = values.productSeries.split(/[、，,]/).map((value) => value.trim()).filter(Boolean);
    ["dealYear", "totalAmount", "depositAmount", "designRebateAmount", "invoiceAmount"].forEach((key) => {
      values[key] = values[key] === "" ? undefined : Number(values[key]);
    });
    ["wechat", "birthday", "address", "ageGroup", "community", "houseType", "customerSource", "salesRepName", "designerName", "referralDesignerName", "dealDate", "designRebateStatus", "notes", "whyFarock", "personaSummary", "dealerGroupId"].forEach((key) => {
      if (!values[key]) delete values[key];
    });
    if (Number(values.depositAmount) > Number(values.totalAmount)) {
      errorBox.textContent = "已付定金不能超过下单金额";
      errorBox.classList.remove("hidden");
      return;
    }
    submit.disabled = true;
    submit.textContent = "正在保存...";
    try {
      await window.FarockAPI.post("/customers", values);
      location.href = "customers.html";
    } catch (error) {
      errorBox.textContent = error.message || "客户保存失败";
      errorBox.classList.remove("hidden");
      submit.disabled = false;
      submit.textContent = "保存客户";
    }
  });
})();
