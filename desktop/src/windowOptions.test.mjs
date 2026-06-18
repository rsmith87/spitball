import test from "node:test";
import assert from "node:assert/strict";

import { buildWindowOptions } from "./windowOptions.mjs";

test("buildWindowOptions uses an in-memory session partition", () => {
  const options = buildWindowOptions();

  assert.equal(options.webPreferences.partition, "spitball-desktop-dev");
});

test("buildWindowOptions keeps renderer integration disabled", () => {
  const options = buildWindowOptions();

  assert.equal(options.webPreferences.contextIsolation, true);
  assert.equal(options.webPreferences.nodeIntegration, false);
  assert.equal(options.webPreferences.sandbox, true);
});
