(() => {
  "use strict";

  const api = window.FarockAPI;
  const file = document.querySelector("#avatar-file");
  const changeButton = document.querySelector("#avatar-change-button");
  const dialog = document.querySelector("#avatar-dialog");
  const form = document.querySelector("#avatar-form");
  const preview = document.querySelector("#avatar-preview");
  const currentAvatar = document.querySelector("[data-current-avatar]");
  if (!api || !file || !changeButton || !dialog || !form || !preview || !currentAvatar) return;

  let pendingDataUrl = "";

  function setError(message = "") {
    const error = form.querySelector("[data-form-error]");
    error.textContent = message;
    error.classList.toggle("hidden", !message);
  }

  function applyAvatar(dataUrl) {
    preview.src = dataUrl;
    preview.classList.remove("hidden");
  }

  function renderStoredAvatar() {
    let session = null;
    try { session = JSON.parse(localStorage.getItem("farock-session") || "null"); } catch { session = null; }
    const dataUrl = typeof session?.avatarData === "string" && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(session.avatarData)
      ? session.avatarData
      : "";
    if (dataUrl) currentAvatar.innerHTML = `<img class="h-full w-full object-cover" src="${dataUrl}" alt="当前用户头像">`;
    else currentAvatar.textContent = Array.from(String(session?.name || "我")).find((character) => /[\p{L}\p{N}]/u.test(character)) || "我";
  }

  window.addEventListener("farock:user-avatar-updated", (event) => {
    const dataUrl = event.detail?.avatarData;
    if (typeof dataUrl === "string") currentAvatar.innerHTML = `<img class="h-full w-full object-cover" src="${dataUrl}" alt="当前用户头像">`;
  });
  renderStoredAvatar();

  function readFile(selectedFile) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("头像读取失败，请重试"));
      reader.readAsDataURL(selectedFile);
    });
  }

  changeButton.addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const selectedFile = file.files?.[0];
    if (!selectedFile) return;
    setError();
    if (!/^image\/(?:png|jpeg|webp)$/.test(selectedFile.type)) {
      setError("仅支持 PNG、JPG 或 WEBP 图片");
      dialog.showModal();
      return;
    }
    if (selectedFile.size > 512 * 1024) {
      setError("头像文件不能超过 512KB");
      dialog.showModal();
      return;
    }
    try {
      pendingDataUrl = await readFile(selectedFile);
      applyAvatar(pendingDataUrl);
      dialog.showModal();
    } catch (error) {
      setError(error.message);
      dialog.showModal();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!pendingDataUrl) return setError("请先选择头像");
    setError();
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      const result = await api.patch("auth/me/avatar", { dataUrl: pendingDataUrl });
      window.dispatchEvent(new CustomEvent("farock:user-avatar-updated", { detail: result.data }));
      dialog.close();
      file.value = "";
    } catch (error) { setError(error.message); }
    finally { submit.disabled = false; }
  });

  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => {
    file.value = "";
    pendingDataUrl = "";
    preview.removeAttribute("src");
    preview.classList.add("hidden");
    setError();
  });
})();
