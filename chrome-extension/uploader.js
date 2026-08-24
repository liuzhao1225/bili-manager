const REQUIRED_COOKIE_NAMES = ["DedeUserID", "SESSDATA", "bili_jct", "buvid3"];
const NAV_API_URL = "https://api.bilibili.com/x/web-interface/nav";
const FINGER_API_URL = "https://api.bilibili.com/x/frontend/finger/spi";

export const SETTINGS_KEYS = [
  "supabaseUrl",
  "username",
  "uploadToken",
  "autoSyncEnabled",
];
const LEGACY_SETTINGS_KEYS = [
  ...SETTINGS_KEYS,
  "supabaseAnonKey",
  "serverChanKey",
];

export async function loadSettings() {
  const [local, legacy] = await Promise.all([
    chrome.storage.local.get(LEGACY_SETTINGS_KEYS),
    chrome.storage.sync.get(LEGACY_SETTINGS_KEYS),
  ]);
  const merged = {};
  for (const key of SETTINGS_KEYS) {
    merged[key] = local[key] === undefined ? legacy[key] : local[key];
  }

  if (SETTINGS_KEYS.some((key) => legacy[key] !== undefined)) {
    await chrome.storage.local.set(merged);
  }
  await chrome.storage.sync.remove(LEGACY_SETTINGS_KEYS);
  await chrome.storage.local.remove(["supabaseAnonKey", "serverChanKey"]);
  return merged;
}

export async function saveSettings(settings) {
  await chrome.storage.local.set(settings);
}

function uniqueCookies(cookies) {
  const cookieMap = new Map();
  for (const cookie of cookies) {
    const key = `${cookie.storeId}\t${cookie.domain}\t${cookie.path}\t${cookie.name}`;
    cookieMap.set(key, cookie);
  }
  return Array.from(cookieMap.values());
}

async function getBilibiliCookies(storeId = undefined) {
  const store = storeId ? { storeId } : {};
  const groups = await Promise.all([
    chrome.cookies.getAll({ ...store, domain: "bilibili.com" }),
    chrome.cookies.getAll({ ...store, domain: ".bilibili.com" }),
  ]);
  return uniqueCookies(groups.flat()).filter((cookie) =>
    cookie.domain.includes("bilibili.com")
  );
}

function selectCookieSession(cookies) {
  const sessions = new Map();
  for (const cookie of cookies) {
    const key = `${cookie.storeId}\t${cookie.domain}\t${cookie.path}`;
    const session = sessions.get(key) || [];
    session.push(cookie);
    sessions.set(key, session);
  }
  return Array.from(sessions.values()).sort((left, right) => {
    const score = (items) => {
      const names = new Set(items.map((cookie) => cookie.name));
      return (
        REQUIRED_COOKIE_NAMES.filter((name) => names.has(name)).length * 10 +
        Number(items[0]?.domain === ".bilibili.com") * 2 +
        Number(items[0]?.path === "/")
      );
    };
    return score(right) - score(left);
  })[0] || [];
}

function getCookieValue(cookies, name) {
  return cookies.find((cookie) => cookie.name === name)?.value || "";
}

async function fetchJson(url) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`${url} 返回 ${response.status}`);
  return response.json();
}

async function getFallbackAccountData() {
  const [navResult, fingerResult] = await Promise.all([
    fetchJson(NAV_API_URL).catch((error) => ({ error: error.message })),
    fetchJson(FINGER_API_URL).catch((error) => ({ error: error.message })),
  ]);
  const nav = navResult?.data || {};
  const finger = fingerResult?.data || {};
  return {
    dedeUserId: nav.isLogin && nav.mid ? String(nav.mid) : "",
    username: nav.isLogin && nav.uname ? String(nav.uname) : "",
    buvid3: finger.b_3 ? String(finger.b_3) : "",
    diagnostics: {
      nav: navResult.error || (nav.isLogin ? "ok" : "not_logged_in"),
      finger: fingerResult.error || (finger.b_3 ? "ok" : "missing_b_3"),
    },
  };
}

function toAccountPayload(cookies, fallback, settings) {
  const sessionCookies = selectCookieSession(cookies);
  const values = {
    DedeUserID: getCookieValue(sessionCookies, "DedeUserID") || fallback.dedeUserId,
    SESSDATA: getCookieValue(sessionCookies, "SESSDATA"),
    bili_jct: getCookieValue(sessionCookies, "bili_jct"),
    buvid3: getCookieValue(sessionCookies, "buvid3") || fallback.buvid3,
  };
  const missing = REQUIRED_COOKIE_NAMES.filter((name) => !values[name]);
  if (missing.length > 0) {
    throw new Error(
      `缺少必要 Cookie：${missing.join(", ")}。nav=${fallback.diagnostics.nav}，finger=${fallback.diagnostics.finger}`
    );
  }
  if (!fallback.dedeUserId) {
    throw new Error(`B站登录校验失败：nav=${fallback.diagnostics.nav}`);
  }
  if (fallback.dedeUserId !== values.DedeUserID) {
    throw new Error("B站 nav UID 与 Cookie UID 不一致，已拒绝同步。");
  }

  return {
    dede_user_id: values.DedeUserID,
    username: String(settings.username || fallback.username || values.DedeUserID),
    buvid3: values.buvid3,
    sessdata: values.SESSDATA,
    bili_jct: values.bili_jct,
  };
}

function validateSettings(settings) {
  const supabaseUrl = String(settings.supabaseUrl || "").trim().replace(/\/+$/, "");
  const uploadKey = String(settings.uploadToken || "").trim();
  if (!supabaseUrl || !uploadKey) {
    throw new Error("请填写 Supabase URL 和 Cookie 上传令牌。");
  }
  return { supabaseUrl, uploadKey };
}

async function uploadAccount(account, settings) {
  const { supabaseUrl, uploadKey } = validateSettings(settings);
  const response = await fetch(`${supabaseUrl}/functions/v1/bili-cookie-upload`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bili-upload-key": uploadKey,
    },
    body: JSON.stringify(account),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Cookie 上传失败：${response.status}`);
  }
  return body;
}

export async function syncCurrentBilibiliAccount(
  settings = undefined,
  { storeId } = {}
) {
  const activeSettings = settings || (await loadSettings());
  const cookies = await getBilibiliCookies(storeId);
  if (cookies.length === 0) {
    throw new Error("没有读取到 B 站 Cookie，请先在 Chrome 登录 B 站。");
  }
  const fallback = await getFallbackAccountData();
  const account = toAccountPayload(cookies, fallback, activeSettings);
  const result = await uploadAccount(account, activeSettings);
  await chrome.storage.local.set({
    lastSyncAt: new Date().toISOString(),
    lastSyncAccount: result.account || account.username || account.dede_user_id,
    lastSyncError: "",
  });
  return result;
}

export async function recordSyncError(error) {
  const message = error instanceof Error ? error.message : String(error);
  await chrome.storage.local.set({
    lastSyncError: message,
    lastSyncErrorAt: new Date().toISOString(),
  });
  return message;
}
