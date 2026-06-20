import type { ConnectionProfile, Conversation, Project, TaxonomyItem } from "./types";

const DB_NAME = "spitball";
const DB_VERSION = 3;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("profiles")) db.createObjectStore("profiles", { keyPath: "id" });
      if (!db.objectStoreNames.contains("conversations")) db.createObjectStore("conversations", { keyPath: "id" });
      if (!db.objectStoreNames.contains("taxonomyItems")) db.createObjectStore("taxonomyItems", { keyPath: "id" });
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function tx<T>(storeName: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = work(transaction.objectStore(storeName));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    transaction.oncomplete = () => db.close();
  });
}

export function saveProfile(profile: ConnectionProfile): Promise<IDBValidKey> {
  return tx("profiles", "readwrite", (store) => store.put(profile));
}

export function getProfile(id: string): Promise<ConnectionProfile | undefined> {
  return tx("profiles", "readonly", (store) => store.get(id));
}

export function saveConversation(conversation: Conversation): Promise<IDBValidKey> {
  return tx("conversations", "readwrite", (store) => store.put(conversation));
}

export function listConversations(): Promise<Conversation[]> {
  return tx("conversations", "readonly", (store) => store.getAll()).then((items) =>
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );
}

export function deleteConversation(id: string): Promise<void> {
  return tx("conversations", "readwrite", (store) => store.delete(id));
}

export function saveTaxonomyItem(item: TaxonomyItem): Promise<IDBValidKey> {
  return tx("taxonomyItems", "readwrite", (store) => store.put(item));
}

export function listTaxonomyItems(): Promise<TaxonomyItem[]> {
  return tx("taxonomyItems", "readonly", (store) => store.getAll()).then((items) =>
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );
}

export function deleteTaxonomyItem(id: string): Promise<void> {
  return tx("taxonomyItems", "readwrite", (store) => store.delete(id));
}

export function saveProject(project: Project): Promise<IDBValidKey> {
  return tx("projects", "readwrite", (store) => store.put(project));
}

export function listProjects(): Promise<Project[]> {
  return tx("projects", "readonly", (store) => store.getAll()).then((items) =>
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );
}
