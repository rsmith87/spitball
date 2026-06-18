export function buildWindowOptions(preloadPath) {
  return {
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 680,
    title: "Spitball",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      partition: "spitball-desktop-dev",
      sandbox: true,
    },
  };
}
