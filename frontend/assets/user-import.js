(() => {
  "use strict";

  const STORAGE_KEY = "faloco-users";
  const SHEETJS_URLS = [
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
    "https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js",
  ];
  const aliases = {
    name: ["姓名", "员工姓名", "name"],
    phone: ["手机号", "手机号码", "联系电话", "电话", "phone", "mobile"],
    role: ["角色", "role"],
    organization: ["所属机构", "所属组织", "机构", "组织", "organization", "branch"],
    status: ["状态", "在职状态", "status"],
  };
  const fieldLabels = {
    name: "姓名/name",
    phone: "手机号/phone",
    role: "角色/role",
    organization: "所属机构/organization/branch",
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

    sheetJsPromise = SHEETJS_URLS.reduce(
      (promise, url) => promise.catch(() => new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = url;
        script.async = true;
        script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error("表格解析组件加载失败"));
        script.onerror = () => reject(new Error("表格解析组件加载失败"));
        document.head.appendChild(script);
      })),
      Promise.reject(new Error("表格解析组件加载失败"))
    ).catch((error) => {
      sheetJsPromise = undefined;
      throw new Error(`${error.message}，请检查网络后重试`);
    });
    return sheetJsPromise;
  }

  function normalizeHeader(value) {
    return String(value ?? "").trim().toLowerCase().replace(/[\s_-]/g, "");
  }

  function valueFor(row, field) {
    const accepted = aliases[field].map(normalizeHeader);
    const sourceKey = Object.keys(row).find((key) => accepted.includes(normalizeHeader(key)));
    return sourceKey ? String(row[sourceKey] ?? "").trim() : "";
  }

  function readStoredUsers() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  }

  function validateRows(sourceRows) {
    const existingPhones = new Set(readStoredUsers().map((user) => String(user.phone || "").replace(/\D/g, "")));
    const importedPhones = new Set();

    return sourceRows
      .filter((row) => Object.values(row).some((value) => String(value ?? "").trim()))
      .map((row, index) => {
        const user = {
          id: globalThis.crypto?.randomUUID?.() || `import-${Date.now()}-${index}`,
          name: valueFor(row, "name"),
          phone: valueFor(row, "phone"),
          role: valueFor(row, "role"),
          organization: valueFor(row, "organization"),
          status: valueFor(row, "status") || "在职",
          importedAt: new Date().toISOString(),
        };
        const reasons = [];
        const phoneDigits = user.phone.replace(/\D/g, "");
        if (!user.name) reasons.push("缺少姓名");
        if (!user.phone) reasons.push("缺少手机号");
        else if (phoneDigits.length < 6 || phoneDigits.length > 20) reasons.push("手机号格式不正确");
        else if (existingPhones.has(phoneDigits)) reasons.push("手机号已存在");
        else if (importedPhones.has(phoneDigits)) reasons.push("文件内手机号重复");
        if (!user.role) reasons.push("缺少角色");
        if (!user.organization) reasons.push("缺少所属机构");
        if (phoneDigits) importedPhones.add(phoneDigits);
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

    parsedRows.slice(0, 500).forEach((row) => {
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
    elements.confirm.disabled = true;
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

    const role = cell(user.role, "px-6 py-4");
    const organization = cell(user.organization, "px-6 py-4 font-body-md text-body-md text-on-surface");
    const status = cell(user.status, "px-6 py-4");
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

    tr.append(employee, role, organization, status, actions);
    return tr;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const next = text[index + 1];
      if (character === '"' && quoted && next === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = !quoted;
      else if (character === "," && !quoted) { row.push(value); value = ""; }
      else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r" && next === "\n") index += 1;
        row.push(value); rows.push(row); row = []; value = "";
      } else value += character;
    }
    if (value || row.length) { row.push(value); rows.push(row); }
    const [headers, ...data] = rows.filter((items) => items.some((item) => item.trim()));
    return data.map((items) => Object.fromEntries(headers.map((header, index) => [header, items[index] || ""])));
  }

  async function handleFile(file) {
    const extension = file.name.split(".").pop().toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(extension)) throw new Error("仅支持 .xlsx、.xls 或 .csv 文件");

    const buffer = await file.arrayBuffer();
    let rows;
    if (extension === "csv") {
      rows = parseCsv(new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, ""));
    } else {
      const XLSX = await loadSheetJs();
      const workbook = XLSX.read(buffer, { type: "array" });
      if (!workbook.SheetNames.length) throw new Error("文件中没有可读取的工作表");
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: false });
    }
    if (!rows.length) throw new Error("文件中没有可导入的数据");

    const headers = Object.keys(rows[0]).map(normalizeHeader);
    const missing = ["name", "phone", "role", "organization"].filter(
      (field) => !aliases[field].some((alias) => headers.includes(normalizeHeader(alias)))
    );
    if (missing.length) throw new Error(`缺少必要列：${missing.map((field) => fieldLabels[field]).join("、")}`);

    parsedRows = validateRows(rows);
    openModal(file.name);
    renderPreview();
  }

  elements.button.addEventListener("click", () => elements.input.click());
  elements.button.dataset.importReady = "true";
  elements.input.addEventListener("change", async () => {
    const file = elements.input.files?.[0];
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
      const stored = readStoredUsers();
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...users, ...stored]));
      elements.tableBody.prepend(...users.map(makeUserRow));
      closeModal();
    } catch {
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

  readStoredUsers().forEach((user) => elements.tableBody.prepend(makeUserRow(user)));
})();
