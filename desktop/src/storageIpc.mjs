export function registerStorageIpc(ipcMain, storage) {
  ipcMain.handle("spitball:storage:getProfile", (_event, id) => storage.getProfile(id));
  ipcMain.handle("spitball:storage:saveProfile", (_event, profile) => storage.saveProfile(profile));
  ipcMain.handle("spitball:storage:listProjects", () => storage.listProjects());
  ipcMain.handle("spitball:storage:saveProject", (_event, project) => storage.saveProject(project));
  ipcMain.handle("spitball:storage:listTaxonomyItems", () => storage.listTaxonomyItems());
  ipcMain.handle("spitball:storage:saveTaxonomyItem", (_event, item) => storage.saveTaxonomyItem(item));
  ipcMain.handle("spitball:storage:deleteTaxonomyItem", (_event, id) => storage.deleteTaxonomyItem(id));
  ipcMain.handle("spitball:storage:listConversations", () => storage.listConversations());
  ipcMain.handle("spitball:storage:saveConversation", (_event, conversation) => storage.saveConversation(conversation));
}
