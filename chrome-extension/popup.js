import { loadSettings, saveSettings } from "./uploader.js";

const fields = {
  supabaseUrl: document.getElementById("supabaseUrl"),
  username: document.getElementById("username"),
  uploadToken: document.getElementById("uploadToken"),
  autoSyncEnabled: document.getElementById("autoSyncEnabled"),
  upload: document.getElementById("upload"),
  status: document.getElementById("status"),
};

function setStatus(message, type = "") {
  fields.status.textContent = message;
  fields.status.className = type;
}

function currentSettings() {
  return {
    supabaseUrl: fields.supabaseUrl.value.trim(),
    username: fields.username.value.trim(),
    uploadToken: fields.uploadToken.value.trim(),
    autoSyncEnabled: fields.autoSyncEnabled.checked,
  };
}

async function loadForm() {
  const settings = await loadSettings();
  fields.supabaseUrl.value = settings.supabaseUrl || "";
  fields.username.value = settings.username || "";
  fields.uploadToken.value = settings.uploadToken || "";
  fields.autoSyncEnabled.checked = settings.autoSyncEnabled !== false;

  const status = await chrome.storage.local.get([
    "lastSyncAt",
    "lastSyncAccount",
    "lastSyncError",
  ]);
  if (status.lastSyncError) {
    setStatus(`上次同步失败：${status.lastSyncError}`, "error");
  } else if (status.lastSyncAt) {
    setStatus(`已自动同步：${status.lastSyncAccount || "B站账号"}`, "success");
  }
}

async function persistForm() {
  await saveSettings(currentSettings());
}

async function uploadCookies() {
  fields.upload.disabled = true;
  setStatus("正在读取并上传 B 站 Cookie...");
  try {
    await persistForm();
    const response = await chrome.runtime.sendMessage({ type: "sync-now" });
    if (!response?.ok) throw new Error(response?.error || "后台同步失败");
    setStatus(`上传成功：${response.result.account || "B站账号"}`, "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    fields.upload.disabled = false;
  }
}

fields.upload.addEventListener("click", uploadCookies);
for (const field of [
  fields.supabaseUrl,
  fields.username,
  fields.uploadToken,
  fields.autoSyncEnabled,
]) {
  field.addEventListener("change", persistForm);
}

loadForm();
