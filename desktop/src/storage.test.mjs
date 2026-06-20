import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { SpitballDesktopStorage } from "./storage.mjs";

function createSecrets() {
  const values = new Map();
  return {
    values,
    async saveSecret(account, secret) {
      values.set(account, secret);
    },
    async readSecret(account) {
      return values.get(account);
    },
    async deleteSecret(account) {
      values.delete(account);
    },
  };
}

function createStorage() {
  const dir = mkdtempSync(join(tmpdir(), "spitball-storage-"));
  const secrets = createSecrets();
  const storage = new SpitballDesktopStorage(join(dir, "spitball.sqlite3"), secrets, "test");
  return { dir, secrets, storage };
}

test("profiles store API keys in the secret adapter", async () => {
  const { dir, secrets, storage } = createStorage();
  try {
    await storage.saveProfile({
      id: "default",
      name: "Controller",
      backendUrl: "https://pi-controller.local",
      backendMode: "controller",
      authMode: "external_api_key",
      apiKey: "secret",
      defaultModel: "gemma",
      requestType: "chat",
    });

    const profile = await storage.getProfile("default");

    assert.equal(profile.apiKey, "secret");
    assert.equal(secrets.values.get("profile:default:apiKey"), "secret");
    assert.equal(storage.db.prepare("SELECT data FROM profiles WHERE id = ?").get("default").data.includes("secret"), false);
  } finally {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("projects and conversations are listed by updated time", async () => {
  const { dir, storage } = createStorage();
  try {
    await storage.saveProject({
      id: "old",
      name: "Old",
      root: "/old",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await storage.saveProject({
      id: "new",
      name: "New",
      root: "/new",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    await storage.saveConversation({
      id: "chat-old",
      title: "Old chat",
      model: "gemma",
      requestType: "chat",
      messages: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await storage.saveConversation({
      id: "chat-new",
      title: "New chat",
      model: "gemma",
      requestType: "chat",
      messages: [],
      updatedAt: "2026-02-01T00:00:00.000Z",
    });

    assert.deepEqual((await storage.listProjects()).map((project) => project.id), ["new", "old"]);
    assert.deepEqual((await storage.listConversations()).map((conversation) => conversation.id), ["chat-new", "chat-old"]);
  } finally {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("taxonomy items can be saved, listed, and deleted", async () => {
  const { dir, storage } = createStorage();
  try {
    await storage.saveTaxonomyItem({
      id: "bucket-old",
      name: "Old",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await storage.saveTaxonomyItem({
      id: "bucket-new",
      name: "New",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });

    assert.deepEqual((await storage.listTaxonomyItems()).map((item) => item.id), ["bucket-new", "bucket-old"]);

    await storage.deleteTaxonomyItem("bucket-new");

    assert.deepEqual((await storage.listTaxonomyItems()).map((item) => item.id), ["bucket-old"]);
  } finally {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
