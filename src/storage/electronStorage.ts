import type { ConnectionProfile, Conversation, Project } from "./types";

export type DesktopStorageApi = {
  getProfile(id: string): Promise<ConnectionProfile | undefined>;
  saveProfile(profile: ConnectionProfile): Promise<IDBValidKey>;
  listProjects(): Promise<Project[]>;
  saveProject(project: Project): Promise<IDBValidKey>;
  listConversations(): Promise<Conversation[]>;
  saveConversation(conversation: Conversation): Promise<IDBValidKey>;
};

export function getDesktopStorageApi(): DesktopStorageApi | undefined {
  return window.spitballDesktop?.storage;
}
