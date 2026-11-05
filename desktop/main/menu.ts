import { Menu, app, shell } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import type { DesktopCommand } from "../protocol.js";

/**
 * The default Electron menu binds Cmd/Ctrl+R to a full page reload and ships
 * developer tools in production. Replace it with commands the renderer owns.
 */
export function installMenu(
  send: (command: DesktopCommand) => void,
  checkForUpdates: () => void,
) {
  const mac = process.platform === "darwin";
  const development = !app.isPackaged;
  const command = (
    label: string,
    accelerator: string,
    value: DesktopCommand,
  ): MenuItemConstructorOptions => ({
    label,
    accelerator,
    click: () => send(value),
  });
  const updates: MenuItemConstructorOptions = {
    label: "Check for Updates…",
    click: () => checkForUpdates(),
  };
  const template: MenuItemConstructorOptions[] = [
    ...(mac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              updates,
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ] satisfies MenuItemConstructorOptions[],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        command("Open Project…", "CmdOrCtrl+O", "open-project"),
        command("Global Configuration", "CmdOrCtrl+Shift+G", "global"),
        { type: "separator" },
        mac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        command("Go to…", "CmdOrCtrl+K", "palette"),
        command("Refresh Workspace", "CmdOrCtrl+R", "refresh"),
        { type: "separator" },
        command("Overview", "CmdOrCtrl+1", "navigate:overview"),
        command("Skills", "CmdOrCtrl+2", "navigate:skills"),
        command("MCP Servers", "CmdOrCtrl+3", "navigate:mcp"),
        command("All Resources", "CmdOrCtrl+4", "navigate:resources"),
        command("Discover", "CmdOrCtrl+5", "navigate:catalogue"),
        command("Doctor", "CmdOrCtrl+6", "navigate:doctor"),
        command("Context Map", "CmdOrCtrl+7", "navigate:context"),
        command("Command Console", "CmdOrCtrl+8", "navigate:console"),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(development
          ? ([
              { type: "separator" },
              { role: "reload", accelerator: "CmdOrCtrl+Shift+R" },
              { role: "toggleDevTools" },
            ] satisfies MenuItemConstructorOptions[])
          : []),
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        command("Keyboard Shortcuts", "CmdOrCtrl+/", "shortcuts"),
        ...(mac ? [] : [updates]),
        {
          label: "Documentation",
          click: () => void shell.openExternal("https://ai.arhun.fr"),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
