import test from "node:test";
import assert from "node:assert/strict";

import { buildOfflinePageLoadOptions } from "./offlinePage.mjs";

test("buildOfflinePageLoadOptions passes target URL and start command as query values", () => {
  const options = buildOfflinePageLoadOptions("http://127.0.0.1:5174/", "cd packages/spitball && npm run dev");

  assert.deepEqual(options, {
    query: {
      appUrl: "http://127.0.0.1:5174/",
      startCommand: "cd packages/spitball && npm run dev",
    },
  });
});
