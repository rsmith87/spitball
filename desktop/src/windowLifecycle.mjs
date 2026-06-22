import { join } from "node:path";

export async function loadShell(window, desktopConfig, dependencies) {
  const reachable = await dependencies.isAppReachable(desktopConfig.appUrl, desktopConfig.healthCheckTimeoutMs);
  if (reachable) {
    console.info(`Loading Spitball from ${desktopConfig.appUrl}`);
    await window.loadURL(desktopConfig.appUrl);
    return;
  }

  const startCommand = dependencies.buildStartAppCommand();
  console.warn(
    `Spitball Vite app is unavailable at ${desktopConfig.appUrl}. ` +
      `Start it with ${startCommand}.`,
  );
  await window.loadFile(
    join(dependencies.moduleDir, "offline.html"),
    dependencies.buildOfflinePageLoadOptions(desktopConfig.appUrl, startCommand),
  );
}

export function configureWindowNavigation(window, dependencies, helpers) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    dependencies.shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (helpers.isInternalNavigationUrl(url, dependencies.appUrl)) {
      return;
    }
    event.preventDefault();
    dependencies.shell.openExternal(url);
  });
}
