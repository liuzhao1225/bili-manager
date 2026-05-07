const COOKIE_URLS = [
  "https://www.bilibili.com/",
  "https://bilibili.com/",
  "https://api.bilibili.com/",
  "https://passport.bilibili.com/",
  "https://live.bilibili.com/",
];
const COOKIE_DOMAINS = ["bilibili.com", ".bilibili.com"];
const REQUIRED_COOKIE_NAMES = ["DedeUserID", "SESSDATA", "bili_jct", "buvid3"];
const NAV_API_URL = "https://api.bilibili.com/x/web-interface/nav";
const FINGER_API_URL = "https://api.bilibili.com/x/frontend/finger/spi";

const fields = {
  supabaseUrl: document.getElementById("supabaseUrl"),
  supabaseAnonKey: document.getElementById("supabaseAnonKey"),
  username: document.getElementById("username"),
  serverChanKey: document.getElementById("serverChanKey"),
  upload: document.getElementById("upload"),
  status: document.getElementById("status"),
};

async function getActiveTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    throw new Error("无法读取当前标签页地址，请先打开 B 站页面。");
  }

  const url = new URL(tab.url);
  if (!url.hostname.endsWith("bilibili.com")) {
    throw new Error("请先切换到 bilibili.com 页面再点击上传。");
  }

  return { tab, url };
}

function setStatus(message, type = "") {
  fields.status.textContent = message;
  fields.status.className = type;
}

function uniqueCookies(cookies) {
  const cookieMap = new Map();

  for (const cookie of cookies) {
    const key = `${cookie.domain}\t${cookie.path}\t${cookie.name}`;
    cookieMap.set(key, cookie);
  }

  return Array.from(cookieMap.values()).sort((left, right) => {
    return left.name.localeCompare(right.name);
  });
}

async function getCurrentCookieStoreId(tab) {
  if (chrome.runtime.getManifest().incognito === "split") return undefined;

  const stores = await chrome.cookies.getAllCookieStores();
  return stores.find((store) => store.tabIds.includes(tab.id))?.id;
}

async function getCookiesWithPartitionFallback(details) {
  const { partitionKey, ...detailsWithoutPartitionKey } = details;
  const cookiesWithPartitionKey = partitionKey
    ? await Promise.resolve()
        .then(() => chrome.cookies.getAll(details))
        .catch(() => [])
    : [];
  const cookies = await chrome.cookies.getAll(detailsWithoutPartitionKey);
  return cookies.concat(cookiesWithPartitionKey);
}

async function getBilibiliCookies() {
  const { tab, url } = await getActiveTabUrl();
  const storeId = await getCurrentCookieStoreId(tab);
  const partitionKey = { topLevelSite: url.origin };
  const baseDetails = storeId ? { storeId } : {};
  const cookieGroups = await Promise.all([
    getCookiesWithPartitionFallback({
      ...baseDetails,
      url: url.href,
      partitionKey,
    }),
    ...COOKIE_URLS.map((cookieUrl) =>
      getCookiesWithPartitionFallback({
        ...baseDetails,
        url: cookieUrl,
        partitionKey,
      })
    ),
    ...COOKIE_DOMAINS.map((domain) =>
      getCookiesWithPartitionFallback({
        ...baseDetails,
        domain,
        partitionKey,
      })
    ),
  ]);

  const cookies = uniqueCookies(cookieGroups.flat());
  return cookies.filter((cookie) => cookie.domain.includes("bilibili.com"));
}

function getDefaultUsername(cookies) {
  const dedeUserId = cookies.find((cookie) => cookie.name === "DedeUserID");
  return dedeUserId?.value || "";
}

function getCookieValue(cookies, name) {
  const cookie = cookies.find((item) => item.name === name);
  return cookie?.value || "";
}

async function fetchJson(url) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`${url} 返回 ${response.status}`);
  }

  return response.json();
}

async function getBilibiliAccountInfo() {
  const result = await fetchJson(NAV_API_URL);
  const data = result?.data || {};

  if (!data.isLogin || !data.mid) {
    return {};
  }

  return {
    dedeUserId: String(data.mid),
    username: data.uname ? String(data.uname) : "",
  };
}

async function getBilibiliBuvid3() {
  const result = await fetchJson(FINGER_API_URL);
  return result?.data?.b_3 ? String(result.data.b_3) : "";
}

async function getFallbackAccountData() {
  const [accountInfo, buvid3] = await Promise.all([
    getBilibiliAccountInfo().catch((error) => ({ error: error.message })),
    getBilibiliBuvid3().catch((error) => ({ error: error.message })),
  ]);

  return {
    dedeUserId: accountInfo.dedeUserId || "",
    username: accountInfo.username || "",
    buvid3: typeof buvid3 === "string" ? buvid3 : "",
    diagnostics: {
      nav: accountInfo.error || "ok",
      finger: buvid3.error || "ok",
    },
  };
}

function toAccountPayload(cookies, fallbackData) {
  const values = {
    DedeUserID: getCookieValue(cookies, "DedeUserID") || fallbackData.dedeUserId,
    SESSDATA: getCookieValue(cookies, "SESSDATA"),
    bili_jct: getCookieValue(cookies, "bili_jct"),
    buvid3: getCookieValue(cookies, "buvid3") || fallbackData.buvid3,
  };
  const missing = REQUIRED_COOKIE_NAMES.filter((name) => {
    return !values[name];
  });

  if (missing.length) {
    const names = cookies.map((cookie) => cookie.name).join(", ") || "无";
    throw new Error(
      `缺少必要 Cookie：${missing.join(", ")}。已读取：${names}。nav=${fallbackData.diagnostics.nav}，finger=${fallbackData.diagnostics.finger}`
    );
  }

  const username =
    fields.username.value.trim() ||
    fallbackData.username ||
    getDefaultUsername(cookies);
  const serverChanKey = fields.serverChanKey.value.trim();
  const account = {
    dede_user_id: values.DedeUserID,
    username,
    buvid3: values.buvid3,
    sessdata: values.SESSDATA,
    bili_jct: values.bili_jct,
  };

  if (serverChanKey) {
    account.server_chan_key = serverChanKey;
  }

  return account;
}

async function upsertAccount(account) {
  const supabaseUrl = fields.supabaseUrl.value.trim().replace(/\/+$/, "");
  const supabaseAnonKey = fields.supabaseAnonKey.value.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("请先填写 Supabase URL 和 anon key。");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/bili_account?on_conflict=dede_user_id`,
    {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        authorization: `Bearer ${supabaseAnonKey}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(account),
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Supabase 写入失败：${response.status}`);
  }
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get([
    "supabaseUrl",
    "supabaseAnonKey",
    "username",
    "serverChanKey",
  ]);

  fields.supabaseUrl.value = settings.supabaseUrl || "";
  fields.supabaseAnonKey.value = settings.supabaseAnonKey || "";
  fields.username.value = settings.username || "";
  fields.serverChanKey.value = settings.serverChanKey || "";
}

async function saveSettings() {
  await chrome.storage.sync.set({
    supabaseUrl: fields.supabaseUrl.value.trim(),
    supabaseAnonKey: fields.supabaseAnonKey.value.trim(),
    username: fields.username.value.trim(),
    serverChanKey: fields.serverChanKey.value.trim(),
  });
}

async function uploadCookies() {
  fields.upload.disabled = true;
  setStatus("正在读取 B 站 Cookie...");

  try {
    await saveSettings();
    const cookies = await getBilibiliCookies();

    if (!cookies.length) {
      setStatus("没有读取到 B 站 Cookie，请先在 Chrome 登录 B 站。", "error");
      return;
    }

    setStatus("正在补全账号信息...");
    const fallbackData = await getFallbackAccountData();
    const account = toAccountPayload(cookies, fallbackData);
    setStatus("正在写入 Supabase...");
    await upsertAccount(account);

    setStatus(`上传成功：${account.username || account.dede_user_id}`, "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    fields.upload.disabled = false;
  }
}

fields.upload.addEventListener("click", uploadCookies);
for (const field of [
  fields.supabaseUrl,
  fields.supabaseAnonKey,
  fields.username,
  fields.serverChanKey,
]) {
  field.addEventListener("change", saveSettings);
}

loadSettings();
