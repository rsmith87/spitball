import test from "node:test";
import assert from "node:assert/strict";

import { configureWindowNavigation, loadShell } from "./windowLifecycle.mjs";

test("loadShell opens the app URL when the renderer is reachable", async () => {
  const calls = [];
  const window = {
    async loadURL(url) {
      calls.push(["loadURL", url]);
    },
    async loadFile() {
      calls.push(["loadFile"]);
    },
  };

  await loadShell(
    window,
    { appUrl: "http://127.0.0.1:5174/", healthCheckTimeoutMs: 1500 },
    {
      buildStartAppCommand() {
        return "npm run dev";
      },
      buildOfflinePageLoadOptions() {
        return { query: {} };
      },
      isAppReachable: async () => true,
      moduleDir: "/tmp",
    },
  );

  assert.deepEqual(calls, [["loadURL", "http://127.0.0.1:5174/"]]);
});

test("loadShell falls back to the offline page when the renderer is unavailable", async () => {
  const calls = [];
  const window = {
    async loadURL() {
      calls.push(["loadURL"]);
    },
    async loadFile(path, options) {
      calls.push(["loadFile", path, options]);
    },
  };

  await loadShell(
    window,
    { appUrl: "http://127.0.0.1:5174/", healthCheckTimeoutMs: 1500 },
    {
      buildStartAppCommand() {
        return "npm run dev";
      },
      buildOfflinePageLoadOptions(appUrl, startCommand) {
        return { query: { appUrl, startCommand } };
      },
      isAppReachable: async () => false,
      moduleDir: "/tmp/spitball",
    },
  );

  assert.deepEqual(calls, [[
    "loadFile",
    "/tmp/spitball/offline.html",
    { query: { appUrl: "http://127.0.0.1:5174/", startCommand: "npm run dev" } },
  ]]);
});

test("configureWindowNavigation blocks external navigation and opens it in the shell", async () => {
  const opened = [];
  const prevented = [];
  const handlers = {};
  const window = {
    webContents: {
      setWindowOpenHandler(handler) {
        handlers.windowOpen = handler;
      },
      on(event, handler) {
        handlers[event] = handler;
      },
    },
  };

  configureWindowNavigation(
    window,
    {
      appUrl: "http://127.0.0.1:5174/",
      shell: {
        openExternal(url) {
          opened.push(url);
        },
      },
    },
    {
      isInternalNavigationUrl(url, appUrl) {
        return url.startsWith(appUrl);
      },
    },
  );

  assert.deepEqual(handlers.windowOpen({ url: "https://example.com/" }), { action: "deny" });
  assert.deepEqual(opened, ["https://example.com/"]);

  handlers["will-navigate"]({ preventDefault() { prevented.push("prevented"); } }, "https://example.com/");
  handlers["will-navigate"]({ preventDefault() { prevented.push("internal"); } }, "http://127.0.0.1:5174/chat");

  assert.deepEqual(prevented, ["prevented"]);
  assert.deepEqual(opened, ["https://example.com/", "https://example.com/"]);
});
