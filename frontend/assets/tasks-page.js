(() => {
  "use strict";
  window.FAROCK_TASKS_API = true;
  const api = window.FarockAPI;
  const main = document.querySelector("main");
  if (!api || !main) return;

  const priorityLabels = { LOW: "低", MEDIUM: "普通", HIGH: "高", URGENT: "紧急" };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const startOfToday = () => { const date = new Date(); date.setHours(0, 0, 0, 0); return date; };
  const endOfToday = () => { const date = new Date(); date.setHours(23, 59, 59, 999); return date; };
  let tasks = [];
  let customerOptions;

  main.innerHTML = `<section class="max-w-6xl mx-auto space-y-8">
    <div class="flex flex-wrap items-end justify-between gap-4"><div><h2 class="text-2xl font-semibold">任务与跟进</h2><p class="text-on-surface-variant mt-1" data-task-summary>正在加载任务...</p></div><select class="rounded-lg border border-outline-variant/50 bg-white px-4 py-2" data-task-status><option value="PENDING">待办任务</option><option value="COMPLETED">已完成</option><option value="">全部任务</option></select></div>
    ${section("warning", "逾期", "overdue", "text-error-red")}
    ${section("today", "今日", "today", "text-status-sage")}
    ${section("event_upcoming", "即将开始", "upcoming", "text-on-surface-variant")}
  </section>`;

  function section(icon, title, key, color) {
    return `<section><div class="flex items-center gap-2 mb-4"><span class="material-symbols-outlined ${color}">${icon}</span><h3 class="text-xl font-semibold">${title}</h3><span class="rounded-full bg-surface-container-high px-2 py-0.5 text-sm" data-task-count="${key}">0</span></div><div class="grid grid-cols-1 md:grid-cols-2 gap-4" data-task-list="${key}"><p class="text-on-surface-variant">正在加载...</p></div></section>`;
  }

  function taskCard(task) {
    const done = task.status === "COMPLETED";
    return `<article class="bg-surface-white rounded-xl border border-outline-variant/30 p-5 shadow-sm" data-task-id="${task.id}"><div class="flex items-start justify-between gap-3"><div><span class="inline-block rounded-md bg-surface-container-high px-2 py-1 text-xs font-semibold">${priorityLabels[task.priority] || task.priority}</span><h4 class="text-lg font-semibold mt-2">${escapeHtml(task.title)}</h4><p class="text-on-surface-variant mt-1">客户：${escapeHtml(task.customer.name)}</p></div><time class="text-sm whitespace-nowrap">${new Date(task.dueAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>${task.content ? `<p class="mt-4 text-on-surface-variant">${escapeHtml(task.content)}</p>` : ""}<div class="flex flex-wrap gap-2 mt-5"><button class="farock-btn" data-task-action="followup" type="button">记录跟进</button>${done ? "" : '<button class="farock-btn" data-task-action="reschedule" type="button">重新安排</button><button class="farock-btn primary" data-task-action="complete" type="button">标记完成</button>'}</div></article>`;
  }

  function render() {
    const todayStart = startOfToday();
    const todayEnd = endOfToday();
    const groups = { overdue: [], today: [], upcoming: [] };
    tasks.forEach((task) => {
      const due = new Date(task.dueAt);
      if (task.status === "PENDING" && due < todayStart) groups.overdue.push(task);
      else if (due <= todayEnd && due >= todayStart) groups.today.push(task);
      else groups.upcoming.push(task);
    });
    Object.entries(groups).forEach(([key, items]) => {
      const list = main.querySelector(`[data-task-list="${key}"]`);
      const count = main.querySelector(`[data-task-count="${key}"]`);
      count.textContent = items.length;
      list.innerHTML = items.length ? items.map(taskCard).join("") : '<p class="text-on-surface-variant md:col-span-2">暂无任务</p>';
    });
    main.querySelector("[data-task-summary]").textContent = `共 ${tasks.length} 项任务`;
  }

  async function load() {
    const status = main.querySelector("[data-task-status]").value;
    const query = new URLSearchParams({ page: "1", pageSize: "100" });
    if (status) query.set("status", status);
    try { tasks = (await api.get(`/tasks?${query}`)).data; render(); }
    catch (error) { main.querySelector("[data-task-summary]").textContent = error.message || "任务加载失败"; }
  }

  function modal(title, body, submitLabel, onSubmit) {
    const backdrop = document.createElement("div");
    backdrop.className = "farock-modal-backdrop";
    backdrop.innerHTML = `<section class="farock-modal" role="dialog" aria-modal="true"><header class="farock-modal-header"><h2>${title}</h2><button type="button" data-close aria-label="关闭"><span class="material-symbols-outlined">close</span></button></header><form><div class="farock-modal-body">${body}<p class="hidden mt-3 rounded-lg bg-error-container px-3 py-2 text-on-error-container" data-error></p></div><footer class="farock-modal-actions"><button class="farock-btn" type="button" data-close>取消</button><button class="farock-btn primary" type="submit">${submitLabel}</button></footer></form></section>`;
    const close = () => backdrop.remove();
    backdrop.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", close));
    backdrop.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = event.currentTarget.querySelector('[type="submit"]');
      submit.disabled = true;
      try { await onSubmit(Object.fromEntries(new FormData(event.currentTarget))); close(); await load(); }
      catch (error) { const box = event.currentTarget.querySelector("[data-error]"); box.textContent = error.message || "保存失败"; box.classList.remove("hidden"); submit.disabled = false; }
    });
    document.body.append(backdrop);
  }

  main.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-task-action]");
    if (!button) return;
    const task = tasks.find((item) => item.id === button.closest("[data-task-id]").dataset.taskId);
    if (!task) return;
    if (button.dataset.taskAction === "complete") { button.disabled = true; await api.patch(`/tasks/${task.id}`, { status: "COMPLETED" }); await load(); return; }
    if (button.dataset.taskAction === "reschedule") modal("重新安排任务", `<label class="farock-field"><span>新的跟进时间</span><input name="dueAt" type="datetime-local" required></label>`, "保存时间", (data) => api.patch(`/tasks/${task.id}`, { dueAt: new Date(data.dueAt).toISOString() }));
    if (button.dataset.taskAction === "followup") modal("记录客户跟进", `<label class="farock-field"><span>跟进内容</span><textarea name="content" rows="4" required></textarea></label><label class="farock-field"><span>下次跟进时间</span><input name="nextFollowUpAt" type="datetime-local"></label>`, "保存记录", (data) => api.patch(`/tasks/${task.id}`, { followUp: { content: data.content, ...(data.nextFollowUpAt && { nextFollowUpAt: new Date(data.nextFollowUpAt).toISOString() }) } }));
  });

  async function openCreateTask() {
    if (!customerOptions) customerOptions = (await api.get("/customers?page=1&pageSize=100")).data;
    modal("新建跟进任务", `<label class="farock-field"><span>任务标题</span><input name="title" required maxlength="160"></label><label class="farock-field"><span>客户</span><select name="customerId" required><option value="">请选择客户</option>${customerOptions.map((customer) => `<option value="${customer.id}">${escapeHtml(customer.name)} · ${escapeHtml(customer.phone)}</option>`).join("")}</select></label><label class="farock-field"><span>优先级</span><select name="priority"><option value="MEDIUM">普通</option><option value="HIGH">高</option><option value="URGENT">紧急</option><option value="LOW">低</option></select></label><label class="farock-field"><span>计划时间</span><input name="dueAt" type="datetime-local" required></label><label class="farock-field"><span>任务说明</span><textarea name="content" rows="3"></textarea></label>`, "创建任务", (data) => api.post("/tasks", { ...data, dueAt: new Date(data.dueAt).toISOString() }));
  }

  main.querySelector("[data-task-status]").addEventListener("change", load);
  document.querySelector("#task-create-button")?.addEventListener("click", () => openCreateTask().catch((error) => { main.querySelector("[data-task-summary]").textContent = error.message || "客户列表加载失败"; }));
  load();
})();
