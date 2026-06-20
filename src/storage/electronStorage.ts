import type { ConnectionProfile, Conversation, Project, TaxonomyItem } from "./types";

export type DesktopStorageApi = {
  getProfile(id: string): Promise<ConnectionProfile | undefined>;
  saveProfile(profile: ConnectionProfile): Promise<IDBValidKey>;
  listProjects(): Promise<Project[]>;
  saveProject(project: Project): Promise<IDBValidKey>;
  listTaxonomyItems(): Promise<TaxonomyItem[]>;
  saveTaxonomyItem(item: TaxonomyItem): Promise<IDBValidKey>;
  deleteTaxonomyItem(id: string): Promise<void>;
  listConversations(): Promise<Conversation[]>;
  saveConversation(conversation: Conversation): Promise<IDBValidKey>;
  deleteConversation(id: string): Promise<void>;
};

export function getDesktopStorageApi(): DesktopStorageApi | undefined {
  return window.spitballDesktop?.storage;
}
