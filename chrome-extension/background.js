import {
  loadSettings,
  recordSyncError,
  syncCurrentBilibiliAccount,
} from "./uploader.js";

const PERIODIC_ALARM = "bili-cookie-periodic-sync";
const COOKIE_CHANGE_ALARM = "bili-cookie-change-sync";
const PENDING_STORE_KEY = "pendingBilibiliCookieStoreId";
const REQUIRED_COOKIE_NAMES = new Set(["DedeUserID", "SESSDATA", "bili_jct", "buvid3"]);

function reportBackgroundError(error) {
  console.error(
    "Bili Cookie 自动同步失败",
    error instanceof Error ? error.message : String(error)
  );
}

async function ensurePeriodicAlarm() {
  const current = await chrome.alarms.get(PERIODIC_ALARM);
  if (!current) {
    await chrome.alarms.create(PERIODIC_ALARM, {
      delayInMinutes: 1,
      periodInMinutes: 360,
    });
  }
}

async function runSync(force = false, storeId = undefined) {
  const settings = await loadSettings();
  if (!force && settings.autoSyncEnabled === false) return { skipped: true };
  try {
    return await syncCurrentBilibiliAccount(settings, { storeId });
  } catch (error) {
    await recordSyncError(error);
    throw error;
  }
}

async function runCookieChangeSync() {
  const pending = await chrome.storage.local.get(PENDING_STORE_KEY);
  await chrome.storage.local.remove(PENDING_STORE_KEY);
  return runSync(false, pending[PENDING_STORE_KEY]);
}

chrome.runtime.onInstalled.addListener(() => ensurePeriodicAlarm().catch(reportBackgroundError));
chrome.runtime.onStartup.addListener(() => ensurePeriodicAlarm().catch(reportBackgroundError));

chrome.cookies.onChanged.addListener(({ cookie }) => {
  if (
    !cookie.domain.includes("bilibili.com") ||
    !REQUIRED_COOKIE_NAMES.has(cookie.name)
  ) {
    return;
  }
  chrome.storage.local
    .set({ [PENDING_STORE_KEY]: cookie.storeId })
    .then(() => chrome.alarms.create(COOKIE_CHANGE_ALARM, { delayInMinutes: 0.5 }))
    .catch(reportBackgroundError);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === PERIODIC_ALARM) {
    runSync().catch(reportBackgroundError);
  }
  if (alarm.name === COOKIE_CHANGE_ALARM) {
    runCookieChangeSync().catch(reportBackgroundError);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "sync-now") return false;
  runSync(true)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  return true;
});

ensurePeriodicAlarm().catch(reportBackgroundError);
