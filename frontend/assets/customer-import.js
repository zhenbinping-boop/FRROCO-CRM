(() => {
  "use strict";

  const STORAGE_KEY = "farock-customers";
  const SHEETJS_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const aliases = {
    name: ["姓名", "name"],
    phone: ["手机号", "phone"],
    wechat: ["微信", "wechat"],
    ageGroup: ["年龄段", "agegroup"],
    city: ["城市", "city"],
    community: ["小区", "community"],
    houseType: ["户型", "housetype"],
    channel: ["渠道", "channel"],
    operationMode: ["运营模式", "operationmode"],
    organization: ["归属机构", "organization"],
    salesRep: ["导购", "salesrep"],
    designer: ["设计师", "designer"],
    tier: ["客户分级", "tier"],
    style: ["风格偏好", "style"],
    persona: ["画像", "persona"],
  };

  const elements = {
    button: document.querySelector("#customer-import-button"),
    input: document.querySelector("#customer-import-file"),
    modal: document.querySelector("#customer-import-modal"),
    close: document.querySelector("#customer-import-close"),
    cancel: document.querySelector("#customer-import-cancel"),
    confirm: document.querySelector("#customer-import-confirm"),
    fileName: document.querySelector("#customer-import-file-name"),
    total: document.querySelector("#customer-import-total"),
    valid: document.querySelector("#customer-import-valid"),
    invalid: document.querySelector("#customer-import-invalid"),
    error: document.querySelector("#customer-import-error"),
    preview: document.querySelector("#customer-import-preview"),
  };

  if (Object.values(elements).some((element) => !element)) return;

  let parsedRows = [];
  let sheetJsPromise;

  function loadSheetJs() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (sheetJsPromise) return sheetJsPromise;

    sheetJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SHEETJS_URL;
      script.async = true;
      script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error("表格解析组件加载失败"));
      script.onerror = () => reject(new Error("表格解析组件加载失败，请检查网络后重试"));
      document.head.appendChild(script);
    });
    return sheetJsPromise;
  }

  function normalizeHeader(value) {
    return String(value ?? "").replace(/^\uFEFF/, "").trim().toLowerCase();
  }

  function valueFor(row, field) {
    const key = Object.keys(row).find((candidate) => aliases[field].includes(normalizeHeader(candidate)));
    return key ? String(row[key] ?? "").trim() : "";
  }

  function readStoredCustomers() {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(stored)) throw new Error("已有客户数据格式异常，无法完成导入");
    return stored;
  }

  function validateRows(sourceRows, existingCustomers) {
    const existingPhones = new Set(existingCustomers.map((customer) => String(customer.phone || "").replace(/\D/g, "")).filter(Boolean));
    const filePhones = new Set();

    return sourceRows
      .map((row, index) => ({ row, rowNumber: index + 2 }))
      .filter(({ row }) => Object.values(row).some((value) => String(value ?? "").trim()))
      .map(({ row, rowNumber }, index) => {
        const customer = {
          id: crypto.randomUUID?.() || `import-${Date.now()}-${index}`,
          name: valueFor(row, "name"),
          phone: valueFor(row, "phone"),
          wechat: valueFor(row, "wechat"),
          ageGroup: valueFor(row, "ageGroup"),
          city: valueFor(row, "city"),
          community: valueFor(row, "community"),
          houseType: valueFor(row, "houseType"),
          channel: valueFor(row, "channel"),
          operationMode: valueFor(row, "operationMode"),
          organization: valueFor(row, "organization"),
          salesRep: valueFor(row, "salesRep"),
          designer: valueFor(row, "designer"),
          tier: valueFor(row, "tier") || "B",
          style: valueFor(row, "style"),
          persona: valueFor(row, "persona"),
          createdAt: new Date().toISOString(),
        };
        const reasons = [];
        const normalizedPhone = customer.phone.replace(/\D/g, "");
        if (!customer.name) reasons.push("缺少姓名");
        if (!customer.phone) reasons.push("缺少手机号");
        else if (!/^[+\d][\d\s()-]{5,19}$/.test(customer.phone)) reasons.push("手机号格式不正确");
        else if (existingPhones.has(normalizedPhone)) reasons.push("手机号已存在");
        else if (filePhones.has(normalizedPhone)) reasons.push("文件内手机号重复");
        if (normalizedPhone) filePhones.add(normalizedPhone);
        return { rowNumber, customer, reasons, valid: reasons.length === 0 };
      });
  }

  function cell(text, className = "px-4 py-3 font-body-md text-body-md text-on-surface whitespace-nowrap") {
    const td = document.createElement("td");
    td.className = className;
    td.textContent = text;
    return td;
  }

  function renderPreview() {
    const validCount = parsedRows.filter((row) => row.valid).length;
    elements.total.textContent = String(parsedRows.length);
    elements.valid.textContent = String(validCount);
    elements.invalid.textContent = String(parsedRows.length - validCount);
    elements.confirm.disabled = validCount === 0;
    elements.preview.replaceChildren();

    parsedRows.forEach((row) => {
      const tr = document.createElement("tr");
      if (!row.valid) tr.className = "bg-error-container/30";
      tr.append(
        cell(String(row.rowNumber)),
        cell(row.customer.name || "-"),
        cell(row.customer.phone || "-"),
        cell([row.customer.city, row.customer.community].filter(Boolean).join(" / ") || "-"),
        cell(row.customer.channel || "-"),
        cell(row.customer.tier || "B"),
        cell(row.valid ? "有效" : row.reasons.join("；"), row.valid
          ? "px-4 py-3 font-label-md text-label-md text-on-secondary-container whitespace-nowrap"
          : "px-4 py-3 font-label-md text-label-md text-on-error-container whitespace-nowrap")
      );
      elements.preview.appendChild(tr);
    });
  }

  function showError(message) {
    elements.error.textContent = message;
    elements.error.classList.remove("hidden");
  }

  function openModal(fileName) {
    elements.fileName.textContent = fileName;
    elements.error.classList.add("hidden");
    elements.modal.classList.remove("hidden");
    elements.modal.classList.add("flex");
    elements.close.focus();
  }

  function closeModal() {
    elements.modal.classList.add("hidden");
    elements.modal.classList.remove("flex");
    elements.input.value = "";
    parsedRows = [];
    elements.button.focus();
  }

  async function handleFile(file) {
    const extension = file.name.split(".").pop().toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(extension)) throw new Error("仅支持 .xlsx、.xls 或 .csv 文件");

    const XLSX = await loadSheetJs();
    const buffer = await file.arrayBuffer();
    const workbook = extension === "csv"
      ? XLSX.read(new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, ""), { type: "string" })
      : XLSX.read(buffer, { type: "array" });
    if (!workbook.SheetNames.length) throw new Error("文件中没有可读取的工作表");

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: false });
    if (!rows.length) throw new Error("首个工作表没有可导入的数据");
    const headers = Object.keys(rows[0]).map(normalizeHeader);
    const missing = ["name", "phone"].filter((field) => !aliases[field].some((alias) => headers.includes(alias)));
    if (missing.length) {
      const labels = { name: "姓名/name", phone: "手机号/phone" };
      throw new Error(`缺少必要列：${missing.map((field) => labels[field]).join("、")}`);
    }

    parsedRows = validateRows(rows, readStoredCustomers());
    openModal(file.name);
    renderPreview();
  }

  elements.button.addEventListener("click", () => elements.input.click());
  elements.input.addEventListener("change", async () => {
    const file = elements.input.files[0];
    if (!file) return;
    elements.button.disabled = true;
    try {
      await handleFile(file);
    } catch (error) {
      openModal(file.name);
      parsedRows = [];
      renderPreview();
      showError(error instanceof Error ? error.message : "文件解析失败，请检查格式后重试");
    } finally {
      elements.button.disabled = false;
    }
  });

  elements.confirm.addEventListener("click", () => {
    const customers = parsedRows.filter((row) => row.valid).map((row) => row.customer);
    if (!customers.length) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...customers, ...readStoredCustomers()]));
      window.location.reload();
    } catch (error) {
      showError(error instanceof SyntaxError
        ? "已有客户数据格式异常，无法完成导入"
        : "导入结果无法保存到本地，请检查浏览器存储空间或隐私设置");
    }
  });

  [elements.close, elements.cancel].forEach((button) => button.addEventListener("click", closeModal));
  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.modal.classList.contains("hidden")) closeModal();
  });
})();
