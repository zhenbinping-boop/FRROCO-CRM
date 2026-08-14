(() => {
  "use strict";

  const shell = document.querySelector(".farock-shell-main");
  const initialMain = document.querySelector("main");
  if (!shell || !initialMain || !window.FarockShell) return;

  const modules = {
    "dashboard.html": { scripts: ["api-pages.js"], refreshBeforeScripts: true },
    "customers.html": { scripts: ["customer-import.js", "customer-export.js", "api-pages.js"], refreshBeforeScripts: true },
    "follow-up-tasks.html": { scripts: ["tasks-page.js"], refreshBeforeScripts: false },
    "channel-analysis.html": { scripts: [], refreshBeforeScripts: false },
    "orders-payments.html": { scripts: ["order-actions.js"], refreshBeforeScripts: false },
    "master-data.html": { scripts: [], refreshBeforeScripts: false }
  };
  const modulePages = new Set(Object.keys(modules));
  const viewCache = new Map();
  let activePage = location.pathname.split("/").pop() || "dashboard.html";
  let navigationId = 0;
  let navigationInFlight = false;

  if (!modulePages.has(activePage)) return;

  function isModuleExtra(element) {
    if (!element || element.closest(".farock-shell-main, farock-sidebar")) return false;
    if (["SCRIPT", "STYLE", "HEADER", "NAV", "ASIDE"].includes(element.tagName)) return false;
    return Boolean(element.id || element.getAttribute("role") === "dialog" || element.querySelector?.('[role="dialog"]'));
  }

  function markExistingExtras() {
    Array.from(document.body.children).filter(isModuleExtra).forEach((element) => {
      element.dataset.farockModuleExtra = "true";
    });
  }

  function collectAttachedView() {
    return {
      main: document.querySelector("main"),
      extras: Array.from(document.querySelectorAll("[data-farock-module-extra]") )
    };
  }

  function detachView(view) {
    view?.main?.remove();
    view?.extras?.forEach((element) => element.remove());
  }

  function mountView(view) {
    if (!view?.main) throw new Error("模块内容缺少 main 容器");
    shell.append(view.main);
    view.extras?.forEach((element) => document.body.append(element));
  }

  function removeLegacyHeader(main) {
    const heading = main.querySelector("h1, h2");
    if (!heading) return;
    const headingGroup = heading.parentElement;
    const headerRow = headingGroup?.parentElement;
    const hasControls = headerRow?.querySelectorAll("button, a").length > 0;
    const hasFormFields = headerRow?.querySelectorAll("input:not([type=\"file\"]), select, textarea").length > 0;
    if (headerRow && headerRow !== main && hasControls && !hasFormFields) {
      headerRow.remove();
      return;
    }
    headingGroup?.remove();
  }

  function viewFromDocument(sourceDocument) {
    const sourceMain = sourceDocument.querySelector("main");
    if (!sourceMain) throw new Error("目标页面缺少 main 容器");
    const main = sourceMain.cloneNode(true);
    removeLegacyHeader(main);
    const extras = Array.from(sourceDocument.body.children)
      .filter(isModuleExtra)
      .map((element) => {
        const clone = element.cloneNode(true);
        clone.dataset.farockModuleExtra = "true";
        return clone;
      });
    return { main, extras };
  }

  function showError(message) {
    const currentMain = document.querySelector("main");
    if (!currentMain) return;
    const error = document.createElement("p");
    error.className = "farock-route-error";
    error.setAttribute("role", "alert");
    error.textContent = message;
    currentMain.prepend(error);
    setTimeout(() => error.remove(), 5000);
  }

  function loadScript(file, page) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `assets/${file}?view=${encodeURIComponent(page)}`;
      script.dataset.farockModuleScript = "true";
      script.onload = () => { script.remove(); resolve(); };
      script.onerror = () => { script.remove(); reject(new Error(`模块脚本加载失败：${file}`)); };
      document.body.append(script);
    });
  }

  async function runModuleScripts(page, request) {
    const config = modules[page];
    if (config.refreshBeforeScripts) window.FarockApp?.refreshPage(page);
    for (const script of config.scripts) {
      if (request !== navigationId) return false;
      await loadScript(script, page);
    }
    if (!config.refreshBeforeScripts) window.FarockApp?.refreshPage(page);
    return request === navigationId;
  }

  async function fetchView(page) {
    const response = await fetch(page, { headers: { Accept: "text/html" } });
    if (!response.ok) throw new Error(`页面加载失败（${response.status}）`);
    return viewFromDocument(new DOMParser().parseFromString(await response.text(), "text/html"));
  }

  async function navigate(nextPage, { replace = false } = {}) {
    if (navigationInFlight || !modulePages.has(nextPage) || nextPage === activePage) return;
    navigationInFlight = true;
    const request = ++navigationId;
    const previousPage = activePage;
    document.querySelectorAll(".farock-modal-backdrop").forEach((element) => element.remove());
    const previousView = collectAttachedView();
    viewCache.set(previousPage, previousView);
    try {
      const nextView = viewCache.get(nextPage) || await fetchView(nextPage);
      if (request !== navigationId) return;
      previousView.extras?.forEach((element) => element.remove());
      if (previousView.main) previousView.main.replaceWith(nextView.main);
      else mountView(nextView);
      nextView.extras?.forEach((element) => document.body.append(element));
      window.FarockShell.setPage(nextPage);
      const cached = viewCache.has(nextPage);
      if (cached) window.FarockApp?.refreshPage(nextPage, { rebindOnly: true });
      const ready = cached || await runModuleScripts(nextPage, request);
      if (!ready) throw new Error("模块切换已取消");
      viewCache.set(nextPage, collectAttachedView());
      activePage = nextPage;
      if (replace) window.history.replaceState({ farockModule: nextPage }, "", nextPage);
      else window.history.pushState({ farockModule: nextPage }, "", nextPage);
    } catch (error) {
      if (request !== navigationId) return;
      detachView(collectAttachedView());
      mountView(previousView);
      window.FarockShell.setPage(previousPage);
      window.FarockApp?.refreshPage(previousPage, { rebindOnly: true });
      activePage = previousPage;
      window.history.replaceState({ farockModule: previousPage }, "", previousPage);
      showError(error.message || "模块切换失败，请重试。");
    } finally {
      navigationInFlight = false;
    }
  }

  function pageFromUrl(value) {
    const url = new URL(value, location.href);
    const page = url.pathname.split("/").pop() || "dashboard.html";
    return modulePages.has(page) ? page : null;
  }

  markExistingExtras();
  viewCache.set(activePage, collectAttachedView());
  window.history.replaceState({ farockModule: activePage }, "", activePage);
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest?.("a");
    const target = anchor ? pageFromUrl(anchor.href) : null;
    if (!target) return;
    event.preventDefault();
    void navigate(target);
  });
  window.addEventListener("popstate", () => {
    const target = pageFromUrl(location.href);
    if (target && target !== activePage) void navigate(target, { replace: true });
  });
  window.FarockModuleShell = { navigate, modules };
})();
