import { getDesktopStorageApi } from "./electronStorage";
import * as indexedDbStorage from "./indexedDbStorage";
import type { ConnectionProfile, Conversation, Project, TaxonomyItem } from "./types";

function storage() {
  return getDesktopStorageApi() || indexedDbStorage;
}

export function saveProfile(profile: ConnectionProfile): Promise<IDBValidKey> {
  return storage().saveProfile(profile);
}

export function getProfile(id: string): Promise<ConnectionProfile | undefined> {
  return storage().getProfile(id);
}

export function saveConversation(conversation: Conversation): Promise<IDBValidKey> {
  return storage().saveConversation(conversation);
}

export function listConversations(): Promise<Conversation[]> {
  return storage().listConversations();
}

export function deleteConversation(id: string): Promise<void> {
  return storage().deleteConversation(id);
}

export function saveTaxonomyItem(item: TaxonomyItem): Promise<IDBValidKey> {
  return storage().saveTaxonomyItem(item);
}

export function listTaxonomyItems(): Promise<TaxonomyItem[]> {
  return storage().listTaxonomyItems();
}

export function deleteTaxonomyItem(id: string): Promise<void> {
  return storage().deleteTaxonomyItem(id);
}

export function saveProject(project: Project): Promise<IDBValidKey> {
  return storage().saveProject(project);
}

export function listProjects(): Promise<Project[]> {
  return storage().listProjects();
}
