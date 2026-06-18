import test from "node:test";
import assert from "node:assert/strict";

import { buildStartAppCommand, isInternalNavigationUrl, resolveDesktopConfig } from "./config.mjs";

test("resolveDesktopConfig uses the default Spitball Vite URL", () => {
  const config = resolveDesktopConfig({});

  assert.equal(config.appUrl, "http://127.0.0.1:5174/");
  assert.equal(config.healthCheckTimeoutMs, 1500);
});

test("resolveDesktopConfig accepts an explicit app URL", () => {
  const config = resolveDesktopConfig({
    SPITBALL_DESKTOP_URL: "http://127.0.0.1:6000/",
  });

  assert.equal(config.appUrl, "http://127.0.0.1:6000/");
});

test("buildStartAppCommand returns the package-local Vite command", () => {
  const command = buildStartAppCommand();

  assert.equal(command, "cd packages/spitball && npm run dev");
});

test("isInternalNavigationUrl allows the configured app origin", () => {
  const allowed = isInternalNavigationUrl("http://127.0.0.1:6000/chat", "http://127.0.0.1:6000/");

  assert.equal(allowed, true);
});

test("isInternalNavigationUrl rejects external origins", () => {
  const allowed = isInternalNavigationUrl("https://example.com/", "http://127.0.0.1:6000/");

  assert.equal(allowed, false);
});
