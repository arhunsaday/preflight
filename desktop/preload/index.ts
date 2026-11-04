import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "../protocol.js";
import type { UpdateState } from "../updates.js";
const api: DesktopApi = {
  state: () => ipcRenderer.invoke("preflight:state"),
  snapshot: () => ipcRenderer.invoke("preflight:snapshot"),
  chooseProject: () => ipcRenderer.invoke("preflight:chooseProject"),
  selectGlobal: () => ipcRenderer.invoke("preflight:selectGlobal"),
  selectProject: (id) => ipcRenderer.invoke("preflight:selectProject", id),
  forgetProject: (id) => ipcRenderer.invoke("preflight:forgetProject", id),
  prepare: (args) => ipcRenderer.invoke("preflight:prepare", args),
  confirm: (receipt) => ipcRenderer.invoke("preflight:confirm", receipt),
  team: (value) => ipcRenderer.invoke("preflight:team", value),
  beginSignIn: (service) =>
    ipcRenderer.invoke("preflight:beginSignIn", service),
  pollSignIn: (id) => ipcRenderer.invoke("preflight:pollSignIn", id),
  cancelSignIn: (id) => ipcRenderer.invoke("preflight:cancelSignIn", id),
  cloud: (input) => ipcRenderer.invoke("preflight:cloud", input),
  copyText: (text) => ipcRenderer.invoke("preflight:copyText", text),
  connect: (value) => ipcRenderer.invoke("preflight:connect", value),
  disconnect: () => ipcRenderer.invoke("preflight:disconnect"),
  openExternal: (url) => ipcRenderer.invoke("preflight:openExternal", url),
  chooseFile: () => ipcRenderer.invoke("preflight:chooseFile"),
  exportFile: () => ipcRenderer.invoke("preflight:exportFile"),
  updateState: () => ipcRenderer.invoke("preflight:updateState"),
  checkForUpdates: () => ipcRenderer.invoke("preflight:updateCheck"),
  installUpdate: () => ipcRenderer.invoke("preflight:updateInstall"),
  dismissUpdate: () => ipcRenderer.invoke("preflight:updateDismiss"),
  onUpdate: (listener) => {
    const handler = (_event: unknown, state: unknown) => {
      if (state && typeof state === "object") listener(state as UpdateState);
    };
    ipcRenderer.on("preflight:update", handler);
    return () => {
      ipcRenderer.removeListener("preflight:update", handler);
    };
  },
  onCommand: (listener) => {
    const handler = (_event: unknown, command: unknown) => {
      if (typeof command === "string")
        listener(command as Parameters<typeof listener>[0]);
    };
    ipcRenderer.on("preflight:command", handler);
    return () => {
      ipcRenderer.removeListener("preflight:command", handler);
    };
  },
};
contextBridge.exposeInMainWorld("preflight", api);
