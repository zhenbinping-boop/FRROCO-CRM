(() => {
  "use strict";

  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const defaultBaseUrl = isLocal ? "http://localhost:3000/api/v1" : "https://frroco-crm-1.onrender.com/api/v1";
  let activeRequests = 0;
  const idleWaiters = new Set();
  const beginRequest = () => { activeRequests += 1; };
  const endRequest = () => {
    activeRequests -= 1;
    setTimeout(() => {
      if (activeRequests) return;
      idleWaiters.forEach((resolve) => resolve());
      idleWaiters.clear();
    }, 0);
  };
  const whenIdle = () => activeRequests ? new Promise((resolve) => idleWaiters.add(resolve)) : Promise.resolve();

  class ApiError extends Error {
    constructor(message, status = 0, details = null) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.details = details;
    }
  }

  function expireSession() {
    localStorage.removeItem("farock-token");
    localStorage.removeItem("farock-session");
    sessionStorage.removeItem("farock-welcome-pending");
    if (!location.pathname.endsWith("/index.html") && location.pathname !== "/") location.href = "index.html";
  }

  async function request(path, options = {}) {
    beginRequest();
    try {
      const baseUrl = String(window.FAROCK_API_BASE_URL || defaultBaseUrl).replace(/\/$/, "");
      const headers = new Headers(options.headers || {});
      headers.set("Accept", "application/json");
      const token = localStorage.getItem("farock-token");
      if (token) headers.set("Authorization", `Bearer ${token}`);

      let body = options.body;
      if (body && !(body instanceof FormData) && typeof body !== "string") {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(body);
      }

      let response;
      try {
        response = await fetch(`${baseUrl}/${String(path).replace(/^\//, "")}`, { ...options, headers, body });
      } catch (error) {
        throw new ApiError("无法连接后端服务，请确认服务已启动", 0, error);
      }
      const payload = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) expireSession();
        throw new ApiError(payload?.error?.message || `请求失败（HTTP ${response.status}）`, response.status, payload?.error?.details);
      }
      return payload;
    } finally {
      endRequest();
    }
  }

  async function download(path) {
    beginRequest();
    try {
      const baseUrl = String(window.FAROCK_API_BASE_URL || defaultBaseUrl).replace(/\/$/, "");
      const headers = new Headers({ Accept: "text/csv" });
      const token = localStorage.getItem("farock-token");
      if (token) headers.set("Authorization", `Bearer ${token}`);
      let response;
      try { response = await fetch(`${baseUrl}/${String(path).replace(/^\//, "")}`, { headers }); }
      catch (error) { throw new ApiError("无法连接后端服务，请确认服务已启动", 0, error); }
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        if (response.status === 401) expireSession();
        throw new ApiError(payload?.error?.message || `下载失败（HTTP ${response.status}）`, response.status, payload?.error?.details);
      }
      return { blob: await response.blob(), disposition: response.headers.get("content-disposition") || "" };
    } finally {
      endRequest();
    }
  }

  window.FarockAPI = {
    ApiError,
    request,
    get: (path) => request(path, { method: "GET" }),
    post: (path, body) => request(path, { method: "POST", body }),
    patch: (path, body) => request(path, { method: "PATCH", body }),
    delete: (path) => request(path, { method: "DELETE" }),
    download,
    setToken(token) { localStorage.setItem("farock-token", token); },
    clearToken() { localStorage.removeItem("farock-token"); },
    whenIdle,
  };
})();
