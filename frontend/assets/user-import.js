(() => {
  "use strict";

  const STORAGE_KEY = "faloco-users";
  const SHEETJS_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const aliases = {
    name: ["姓名", "name"],
    phone: ["手机号", "phone"],
    role: ["角色", "role"],
    organization: ["所属机构", "organization", "branch"],
    status: ["状态", "status"],
  };

  const elements = {
    button: document.querySelector("#user-import-button"),
    input: document.querySelector("#user-import-file"),
    modal: document.querySelector("#user-import-modal"),
    close: document.querySelector("#user-import-close"),
    cancel: document.querySelector("#user-import-cancel"),
    confirm: document.querySelector("#user-import-confirm"),
    fileName: document.querySelector("#user-import-file-name"),
    total: document.querySelector("#user-import-total"),
    valid: document.querySelector("#user-import-valid"),
    invalid: document.querySelector("#user-import-invalid"),
    error: document.querySelector("#user-import-error"),
    preview: document.querySelector("#user-import-preview"),
    tableBody: document.querySelector("#user-table-body"),
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
    return String(value ?? "").trim().toLowerCase();
  }

  function valueFor(row, field) {
    const sourceKey = Object.keys(row).find((key) => aliases[field].includes(normalizeHeader(key)));
    return sourceKey ? String(row[sourceKey] ?? "").trim() : "";
  }

  function validateRows(sourceRows) {
    return sourceRows
      .filter((row) => Object.values(row).some((value) => String(value ?? "").trim()))
      .map((row, index) => {
        const user = {
          id: `import-${Date.now()}-${index}`,
          name: valueFor(row, "name"),
          phone: valueFor(row, "phone"),
          role: valueFor(row, "role"),
          organization: valueFor(row, "organization"),
          status: valueFor(row, "status") || "在职",
          importedAt: new Date().toISOString(),
        };
        const reasons = [];
        if (!user.name) reasons.push("缺少姓名");
        if (!user.phone) reasons.push("缺少手机号");
        else if (!/^[+\d][\d\s()-]{5,19}$/.test(user.phone)) reasons.push("手机号格式不正确");
        if (!user.role) reasons.push("缺少角色");
        if (!user.organization) reasons.push("缺少所属机构");
        return { rowNumber: index + 2, user, reasons, valid: reasons.length === 0 };
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
        cell(row.user.name || "-"),
        cell(row.user.phone || "-"),
        cell(row.user.role || "-"),
        cell(row.user.organization || "-"),
        cell(row.valid ? "有效" : row.reasons.join("；"), row.valid
          ? "px-4 py-3 font-label-md text-label-md text-on-secondary-container"
          : "px-4 py-3 font-label-md text-label-md text-on-error-container")
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

  function makeUserRow(user) {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-surface-container-low/50 transition-colors group cursor-pointer";

    const employee = cell("", "px-6 py-4");
    const employeeWrap = document.createElement("div");
    employeeWrap.className = "flex items-center gap-3";
    const avatar = document.createElement("div");
    avatar.className = "w-10 h-10 rounded-full bg-surface-dim flex-shrink-0 flex items-center justify-center text-on-surface-variant font-bold";
    avatar.textContent = Array.from(user.name).slice(0, 2).join("").toUpperCase();
    const identity = document.createElement("div");
    const name = document.createElement("p");
    name.className = "font-body-md text-body-md font-semibold text-primary";
    name.textContent = user.name;
    const phone = document.createElement("p");
    phone.className = "font-label-md text-label-md text-on-surface-variant font-normal";
    phone.textContent = user.phone;
    identity.append(name, phone);
    employeeWrap.append(avatar, identity);
    employee.appendChild(employeeWrap);

    const role = cell("", "px-6 py-4");
    const roleBadge = document.createElement("span");
    roleBadge.className = "inline-flex items-center px-2.5 py-1 rounded-md bg-surface-container-high text-on-surface font-label-md text-label-md border border-outline-variant/30";
    roleBadge.textContent = user.role;
    role.appendChild(roleBadge);

    const status = cell("", "px-6 py-4");
    const statusWrap = document.createElement("div");
    statusWrap.className = "flex items-center gap-2";
    const dot = document.createElement("div");
    const inactive = /停用|离职|禁用|suspended|inactive/i.test(user.status);
    dot.className = `w-2 h-2 rounded-full ${inactive ? "bg-error-red" : "bg-status-sage"}`;
    const statusText = document.createElement("span");
    statusText.className = "font-body-md text-body-md text-on-surface";
    statusText.textContent = user.status;
    statusWrap.append(dot, statusText);
    status.appendChild(statusWrap);

    const actions = cell("", "px-6 py-4 text-right");
    const action = document.createElement("button");
    action.className = "text-on-surface-variant hover:text-primary p-1 opacity-0 group-hover:opacity-100 transition-opacity";
    action.type = "button";
    action.setAttribute("aria-label", `查看 ${user.name} 的操作`);
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined text-[20px]";
    icon.textContent = "more_vert";
    action.appendChild(icon);
    actions.appendChild(action);

    tr.append(employee, role, cell(user.organization, "px-6 py-4 font-body-md text-body-md text-on-surface"), status, actions);
    return tr;
  }

  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(stored)) elements.tableBody.prepend(...stored.map(makeUserRow));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  async function handleFile(file) {
    const extension = file.name.split(".").pop().toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(extension)) throw new Error("仅支持 .xlsx、.xls 或 .csv 文件");
    const XLSX = await loadSheetJs();
    const buffer = await file.arrayBuffer();
    const workbook = extension === "csv"
      ? XLSX.read(new TextDecoder("utf-8").decode(buffer), { type: "string" })
      : XLSX.read(buffer, { type: "array" });
    if (!workbook.SheetNames.length) throw new Error("文件中没有可读取的工作表");
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: false });
    if (!rows.length) throw new Error("首个工作表没有可导入的数据");

    const headers = Object.keys(rows[0]).map(normalizeHeader);
    const missing = ["name", "phone", "role", "organization"].filter(
      (field) => !aliases[field].some((alias) => headers.includes(alias))
    );
    if (missing.length) {
      const labels = { name: "姓名/name", phone: "手机号/phone", role: "角色/role", organization: "所属机构/organization/branch" };
      throw new Error(`缺少必要列：${missing.map((field) => labels[field]).join("、")}`);
    }

    parsedRows = validateRows(rows);
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
    const users = parsedRows.filter((row) => row.valid).map((row) => row.user);
    if (!users.length) return;
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      const existing = Array.isArray(stored) ? stored : [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...users, ...existing]));
      elements.tableBody.prepend(...users.map(makeUserRow));
      closeModal();
    } catch (error) {
      showError("导入结果无法保存到本地，请检查浏览器存储空间或隐私设置");
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
