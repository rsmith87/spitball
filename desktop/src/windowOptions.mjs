export function buildWindowOptions() {
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
      partition: "spitball-desktop-dev",
      sandbox: true,
    },
  };
}
