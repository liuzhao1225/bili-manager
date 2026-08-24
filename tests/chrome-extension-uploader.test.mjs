import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../chrome-extension/uploader.js", import.meta.url),
  "utf8"
);
const uploader = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

test("syncs required Bilibili cookies through the protected function", async () => {
  const saved = [];
  globalThis.chrome = {
    cookies: {
      getAll: async () => [
        { storeId: "0", domain: ".bilibili.com", path: "/", name: "DedeUserID", value: "123" },
        { storeId: "0", domain: ".bilibili.com", path: "/", name: "SESSDATA", value: "session" },
        { storeId: "0", domain: ".bilibili.com", path: "/", name: "bili_jct", value: "csrf" },
        { storeId: "0", domain: ".bilibili.com", path: "/", name: "buvid3", value: "device" },
      ],
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async (value) => saved.push(value),
        remove: async () => undefined,
      },
      sync: {
        get: async () => ({}),
        remove: async () => undefined,
      },
    },
  };

  globalThis.fetch = async (url, options = {}) => {
    if (url.includes("/x/web-interface/nav")) {
      return Response.json({ data: { isLogin: true, mid: 123, uname: "tester" } });
    }
    if (url.includes("/x/frontend/finger/spi")) {
      return Response.json({ data: { b_3: "device" } });
    }
    assert.equal(url, "https://project.supabase.co/functions/v1/bili-cookie-upload");
    assert.equal(options.headers["x-bili-upload-key"], "upload-secret");
    assert.deepEqual(JSON.parse(options.body), {
      dede_user_id: "123",
      username: "tester",
      buvid3: "device",
      sessdata: "session",
      bili_jct: "csrf",
    });
    return Response.json({ ok: true, account: "tester" });
  };

  const result = await uploader.syncCurrentBilibiliAccount({
    supabaseUrl: "https://project.supabase.co/",
    uploadToken: "upload-secret",
    username: "",
  });

  assert.equal(result.ok, true);
  assert.equal(saved.at(-1).lastSyncAccount, "tester");
});

test("rejects incomplete settings before transmitting cookies", async () => {
  let functionCalled = false;
  globalThis.chrome = {
    cookies: {
      getAll: async () => [
        { storeId: "0", domain: ".bilibili.com", path: "/", name: "DedeUserID", value: "123" },
        { storeId: "0", domain: ".bilibili.com", path: "/", name: "SESSDATA", value: "session" },
        { storeId: "0", domain: ".bilibili.com", path: "/", name: "bili_jct", value: "csrf" },
        { storeId: "0", domain: ".bilibili.com", path: "/", name: "buvid3", value: "device" },
      ],
    },
    storage: { local: { set: async () => undefined, remove: async () => undefined } },
  };
  globalThis.fetch = async (url) => {
    if (url.includes("supabase.co")) functionCalled = true;
    if (url.includes("/x/web-interface/nav")) {
      return Response.json({ data: { isLogin: true, mid: 123, uname: "tester" } });
    }
    return Response.json({ data: { b_3: "device" } });
  };

  await assert.rejects(
    uploader.syncCurrentBilibiliAccount({
      supabaseUrl: "https://project.supabase.co",
      uploadToken: "",
    }),
    /上传密钥/
  );
  assert.equal(functionCalled, false);
});

test("scopes cookie reads to the triggering Chrome store", async () => {
  const cookieQueries = [];
  globalThis.chrome = {
    cookies: {
      getAll: async (query) => {
        cookieQueries.push(query);
        return [
          { storeId: "1", domain: ".bilibili.com", path: "/", name: "DedeUserID", value: "123" },
          { storeId: "1", domain: ".bilibili.com", path: "/", name: "SESSDATA", value: "session" },
          { storeId: "1", domain: ".bilibili.com", path: "/", name: "bili_jct", value: "csrf" },
          { storeId: "1", domain: ".bilibili.com", path: "/", name: "buvid3", value: "device" },
        ];
      },
    },
    storage: { local: { set: async () => undefined, remove: async () => undefined } },
  };
  globalThis.fetch = async (url) => {
    if (url.includes("/x/web-interface/nav")) {
      return Response.json({ data: { isLogin: true, mid: 123, uname: "tester" } });
    }
    if (url.includes("/x/frontend/finger/spi")) {
      return Response.json({ data: { b_3: "device" } });
    }
    return Response.json({ ok: true, account: "tester" });
  };

  await uploader.syncCurrentBilibiliAccount(
    {
      supabaseUrl: "https://project.supabase.co",
      uploadToken: "upload-secret",
    },
    { storeId: "1" }
  );

  assert.equal(cookieQueries.length, 2);
  assert.ok(cookieQueries.every((query) => query.storeId === "1"));
});

test("rejects a Cookie session whose UID differs from the Bilibili nav account", async () => {
  let functionCalled = false;
  globalThis.chrome = {
    cookies: {
      getAll: async () => [
        { storeId: "0", domain: ".bilibili.com", path: "/", name: "DedeUserID", value: "123" },
        { storeId: "0", domain: ".bilibili.com", path: "/", name: "SESSDATA", value: "session" },
        { storeId: "0", domain: ".bilibili.com", path: "/", name: "bili_jct", value: "csrf" },
        { storeId: "0", domain: ".bilibili.com", path: "/", name: "buvid3", value: "device" },
      ],
    },
    storage: { local: { set: async () => undefined, remove: async () => undefined } },
  };
  globalThis.fetch = async (url) => {
    if (url.includes("/x/web-interface/nav")) {
      return Response.json({ data: { isLogin: true, mid: 456, uname: "other" } });
    }
    if (url.includes("/x/frontend/finger/spi")) {
      return Response.json({ data: { b_3: "device" } });
    }
    functionCalled = true;
    return Response.json({ ok: true });
  };

  await assert.rejects(
    uploader.syncCurrentBilibiliAccount({
      supabaseUrl: "https://project.supabase.co",
      uploadToken: "upload-secret",
    }),
    /UID.*不一致/
  );
  assert.equal(functionCalled, false);
});

test("migrates current settings to local storage and clears legacy sync values", async () => {
  const localWrites = [];
  const localRemovals = [];
  const syncRemovals = [];
  globalThis.chrome = {
    storage: {
      local: {
        get: async () => ({ supabaseUrl: "https://local.supabase.co" }),
        set: async (value) => localWrites.push(value),
        remove: async (key) => localRemovals.push(key),
      },
      sync: {
        get: async () => ({ supabaseAnonKey: "legacy-public", serverChanKey: "legacy-send-key" }),
        remove: async (keys) => syncRemovals.push(keys),
      },
    },
  };

  const settings = await uploader.loadSettings();

  assert.equal(settings.supabaseUrl, "https://local.supabase.co");
  assert.equal(settings.uploadToken, undefined);
  assert.equal(localWrites.length, 1);
  assert.deepEqual(localRemovals, [["supabaseAnonKey", "serverChanKey"]]);
  assert.equal(syncRemovals.length, 1);
  assert.ok(syncRemovals[0].includes("serverChanKey"));
});
