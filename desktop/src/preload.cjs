const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spitballDesktop", {
  storage: {
    getProfile(id) {
      return ipcRenderer.invoke("spitball:storage:getProfile", id);
    },
    saveProfile(profile) {
      return ipcRenderer.invoke("spitball:storage:saveProfile", profile);
    },
    listProjects() {
      return ipcRenderer.invoke("spitball:storage:listProjects");
    },
    saveProject(project) {
      return ipcRenderer.invoke("spitball:storage:saveProject", project);
    },
    listConversations() {
      return ipcRenderer.invoke("spitball:storage:listConversations");
    },
    saveConversation(conversation) {
      return ipcRenderer.invoke("spitball:storage:saveConversation", conversation);
    },
  },
});
