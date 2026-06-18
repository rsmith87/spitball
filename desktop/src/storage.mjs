import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

function secretAccount(profileId) {
  return `profile:${profileId}:apiKey`;
}

function profileRecord(profile) {
  const { apiKey: _apiKey, ...storedProfile } = profile;
  return storedProfile;
}

function parseRecord(row) {
  return JSON.parse(row.data);
}

export class SpitballDesktopStorage {
  constructor(dbPath, secrets, platform) {
    this.dbPath = dbPath;
    this.secrets = secrets;
    this.platform = platform;
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  close() {
    this.db.close();
  }

  async saveProfile(profile) {
    const storedProfile = profileRecord(profile);
    const updatedAt = new Date().toISOString();
    this.db.prepare("INSERT OR REPLACE INTO profiles (id, data, updated_at) VALUES (?, ?, ?)").run(
      profile.id,
      JSON.stringify(storedProfile),
      updatedAt,
    );
    if (profile.apiKey) {
      await this.secrets.saveSecret(secretAccount(profile.id), profile.apiKey, this.platform);
    } else {
      await this.secrets.deleteSecret(secretAccount(profile.id), this.platform);
    }
    return profile.id;
  }

  async getProfile(id) {
    const row = this.db.prepare("SELECT data FROM profiles WHERE id = ?").get(id);
    if (!row) return undefined;
    const profile = parseRecord(row);
    const apiKey = await this.secrets.readSecret(secretAccount(id), this.platform);
    return apiKey ? { ...profile, apiKey } : profile;
  }

  async saveProject(project) {
    this.db.prepare("INSERT OR REPLACE INTO projects (id, data, updated_at) VALUES (?, ?, ?)").run(
      project.id,
      JSON.stringify(project),
      project.updatedAt,
    );
    return project.id;
  }

  async listProjects() {
    return this.db
      .prepare("SELECT data FROM projects ORDER BY updated_at DESC")
      .all()
      .map(parseRecord);
  }

  async saveConversation(conversation) {
    this.db.prepare("INSERT OR REPLACE INTO conversations (id, data, updated_at) VALUES (?, ?, ?)").run(
      conversation.id,
      JSON.stringify(conversation),
      conversation.updatedAt,
    );
    return conversation.id;
  }

  async listConversations() {
    return this.db
      .prepare("SELECT data FROM conversations ORDER BY updated_at DESC")
      .all()
      .map(parseRecord);
  }
}
