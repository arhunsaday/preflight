import { app, ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import electronUpdater from "electron-updater";
import {
  initialUpdateState,
  reduceUpdate,
  updateUnsupportedReason,
} from "../updates.js";
import type { UpdateEvent, UpdateState } from "../updates.js";

const { autoUpdater } = electronUpdater;

/** macOS only updates apps signed with a Developer ID (Squirrel.Mac). */
function developerIdSigned(): Promise<boolean> {
  return new Promise((done) => {
    // …/Preflight.app/Contents/MacOS/Preflight -> …/Preflight.app
    const bundle = resolve(dirname(process.execPath), "../..");
    execFile(
      "/usr/bin/codesign",
      ["-dvv", bundle],
      { timeout: 10000 },
      (error, _stdout, stderr) =>
        done(!error && /Authority=Developer ID Application/.test(stderr)),
    );
  });
}

export function installUpdater(
  getWindow: () => BrowserWindow | undefined,
  trusted: (event: Electron.IpcMainInvokeEvent) => void,
) {
  let state: UpdateState = initialUpdateState;
  let reason: string | null | undefined;
  const dispatch = (event: UpdateEvent) => {
    state = reduceUpdate(state, event);
    const window = getWindow();
    if (window && !window.isDestroyed())
      window.webContents.send("preflight:update", state);
  };
  const supported = async () => {
    if (reason !== undefined) return reason;
    reason = updateUnsupportedReason({
      packaged: app.isPackaged,
      platform: process.platform,
      signed: process.platform === "darwin" ? await developerIdSigned() : true,
      appImage: Boolean(process.env.APPIMAGE),
      testMode: Boolean(process.env.PREFLIGHT_DESKTOP_TEST_DATA),
    });
    if (!reason) {
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.on("checking-for-update", () => undefined);
      autoUpdater.on("update-available", (info) =>
        dispatch({ type: "available", version: info.version }),
      );
      autoUpdater.on("update-not-available", () =>
        dispatch({ type: "not-available" }),
      );
      autoUpdater.on("download-progress", (progress) =>
        dispatch({ type: "progress", percent: progress.percent }),
      );
      autoUpdater.on("update-downloaded", (info) =>
        dispatch({ type: "downloaded", version: info.version }),
      );
      autoUpdater.on("error", (error) =>
        dispatch({ type: "error", message: error?.message ?? String(error) }),
      );
    }
    return reason;
  };
  const check = async (manual: boolean) => {
    const why = await supported();
    if (why) {
      dispatch({ type: "disable", reason: why, manual });
      return;
    }
    dispatch({ type: "checking", manual });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      dispatch({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
  ipcMain.handle("preflight:updateState", (event) => {
    trusted(event);
    return state;
  });
  ipcMain.handle("preflight:updateCheck", async (event) => {
    trusted(event);
    await check(true);
  });
  ipcMain.handle("preflight:updateInstall", (event) => {
    trusted(event);
    if (state.status === "ready") autoUpdater.quitAndInstall();
  });
  ipcMain.handle("preflight:updateDismiss", (event) => {
    trusted(event);
    dispatch({ type: "dismiss" });
  });
  return {
    /** Menu item: always visible feedback. */
    checkNow: () => void check(true),
    /** Quiet check shortly after start, then every six hours. */
    start: () => {
      setTimeout(() => void check(false), 10000).unref();
      setInterval(() => void check(false), 6 * 3600 * 1000).unref();
    },
  };
}
