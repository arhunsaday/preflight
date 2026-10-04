import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "../protocol.js";
const api: DesktopApi = {
  state: () => ipcRenderer.invoke("adk:state"),
  snapshot: () => ipcRenderer.invoke("adk:snapshot"),
  chooseProject: () => ipcRenderer.invoke("adk:chooseProject"),
  selectGlobal: () => ipcRenderer.invoke("adk:selectGlobal"),
  selectProject: (id) => ipcRenderer.invoke("adk:selectProject", id),
  forgetProject: (id) => ipcRenderer.invoke("adk:forgetProject", id),
  prepare: (args) => ipcRenderer.invoke("adk:prepare", args),
  confirm: (receipt) => ipcRenderer.invoke("adk:confirm", receipt),
  team: (value) => ipcRenderer.invoke("adk:team", value),
  connect: (value) => ipcRenderer.invoke("adk:connect", value),
  disconnect: () => ipcRenderer.invoke("adk:disconnect"),
  openExternal: (url) => ipcRenderer.invoke("adk:openExternal", url),
  chooseFile: () => ipcRenderer.invoke("adk:chooseFile"),
  exportFile: () => ipcRenderer.invoke("adk:exportFile"),
};
contextBridge.exposeInMainWorld("adk", api);
