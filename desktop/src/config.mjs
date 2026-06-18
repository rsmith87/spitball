const DEFAULT_APP_URL = "http://127.0.0.1:5174/";
const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 1500;
const START_APP_COMMAND = "cd packages/spitball && npm run dev";

export function resolveDesktopConfig(env) {
  const appUrl = env.SPITBALL_DESKTOP_URL || DEFAULT_APP_URL;
  return {
    appUrl,
    healthCheckTimeoutMs: DEFAULT_HEALTH_CHECK_TIMEOUT_MS,
  };
}

export function buildStartAppCommand() {
  return START_APP_COMMAND;
}

export function isInternalNavigationUrl(candidateUrl, appUrl) {
  const candidate = new URL(candidateUrl);
  const app = new URL(appUrl);
  return candidate.protocol === "file:" || candidate.origin === app.origin;
}
