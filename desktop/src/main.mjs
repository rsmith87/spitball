import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildStartAppCommand, isInternalNavigationUrl, resolveDesktopConfig } from "./config.mjs";
import { deleteSecret, readSecret, saveSecret } from "./keychain.mjs";
import { buildOfflinePageLoadOptions } from "./offlinePage.mjs";
import { isAppReachable } from "./readiness.mjs";
import { SpitballDesktopStorage } from "./storage.mjs";
import { registerStorageIpc } from "./storageIpc.mjs";
import { configureWindowNavigation, loadShell } from "./windowLifecycle.mjs";
import { buildWindowOptions } from "./windowOptions.mjs";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const desktopConfig = resolveDesktopConfig(process.env);
const preloadPath = join(moduleDir, "preload.cjs");
let storage = null;

function createWindow() {
  return new BrowserWindow(buildWindowOptions(preloadPath));
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  storage = new SpitballDesktopStorage(
    join(app.getPath("userData"), "spitball.sqlite3"),
    { saveSecret, readSecret, deleteSecret },
    process.platform,
  );
  registerStorageIpc(ipcMain, storage);

  const window = createWindow();
  window.once("ready-to-show", () => window.show());

  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.warn(`[renderer:${level}] ${sourceId}:${line} ${message}`);
  });

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    console.error(`Renderer failed to load ${validatedUrl}: ${errorCode} ${errorDescription}`);
    if (isMainFrame && !validatedUrl.startsWith("file://")) {
      loadShell(window);
    }
  });

  configureWindowNavigation(
    window,
    {
      appUrl: desktopConfig.appUrl,
      shell,
    },
    {
      isInternalNavigationUrl,
    },
  );

  await loadShell(window, desktopConfig, {
    buildStartAppCommand,
    buildOfflinePageLoadOptions,
    isAppReachable,
    moduleDir,
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const nextWindow = createWindow();
      loadShell(nextWindow, desktopConfig, {
        buildStartAppCommand,
        buildOfflinePageLoadOptions,
        isAppReachable,
        moduleDir,
      });
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  storage?.close();
});
