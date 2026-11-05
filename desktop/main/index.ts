import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  safeStorage,
  clipboard,
  nativeTheme,
} from "electron";
import { installMenu } from "./menu.js";
import { cloudRequest, CloudOperation } from "../../src/cloud-client.js";
import { randomUUID } from "node:crypto";
import {
  beginDeviceSignIn,
  pollDeviceSignIn,
  accountIdentity,
  signOut,
} from "../../src/auth-client.js";
import type { DeviceAuthorization } from "../../src/auth-client.js";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DesktopController } from "./controller.js";
import type { Engine } from "./controller.js";
import { serviceUrl } from "../../src/sharing.js";
const directory = dirname(fileURLToPath(import.meta.url));
let window: BrowserWindow;
const children = new Set<ReturnType<typeof spawn>>();
const engine: Engine = (args, context, auth) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(directory, "worker.mjs")], {
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) =>
              !["PREFLIGHT_SHARE_TOKEN", "PREFLIGHT_SHARE_URL", "PREFLIGHT_OWNER_ID"].includes(
                key,
              ),
          ),
        ),
        ELECTRON_RUN_AS_NODE: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    children.add(child);
    let output = "",
      error = "";
    let settled = false;
    let overflow = false;
    const finish = (failure?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      children.delete(child);
      if (failure) reject(failure);
      else resolve(value);
    };
    // Keep the supervisor alive: CLI subprocesses enforce their own timeouts.
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 16000000) {
        output = output.slice(0, 16000000);
        overflow = true;
      }
    });
    child.stderr.on("data", (chunk) => {
      if (error.length < 10000) error += chunk;
    });
    child.on("error", (e) => finish(e));
    child.on("close", () => {
      if (overflow) {
        finish(new Error("Operation output exceeds 16 MB"));
        return;
      }
      try {
        const reply = JSON.parse(output);
        if (reply.ok) finish(undefined, reply.value);
        else finish(new Error(reply.error));
      } catch {
        finish(new Error(`Engine exited unexpectedly. ${error.slice(0, 500)}`));
      }
    });
    child.stdin.on("error", (e) => finish(e));
    child.stdin.end(JSON.stringify({ args, context, auth }));
  });
function handle(channel: string, fn: (...args: unknown[]) => unknown) {
  ipcMain.handle(`preflight:${channel}`, (event, ...args) => {
    if (
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw new Error("Untrusted desktop frame");
    const expected = process.env.ELECTRON_RENDERER_URL;
    const url = event.senderFrame.url;
    if (
      expected
        ? new URL(url).origin !== new URL(expected).origin
        : url !== new URL("../renderer/index.html", import.meta.url).href
    )
      throw new Error("Untrusted desktop page");
    return fn(...args);
  });
}
async function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 840,
    minHeight: 620,
    title: "Preflight",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0c1217" : "#f3f1ea",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: join(directory, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.on("close", (event) => {
    if (children.size) {
      event.preventDefault();
      void dialog.showMessageBox(window, {
        type: "info",
        message: "An operation is still running",
        detail:
          "Let the operation finish before closing Preflight. This keeps installers and benchmark agents under timeout supervision.",
      });
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  if (process.env.ELECTRON_RENDERER_URL)
    await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await window.loadFile(join(directory, "../renderer/index.html"));
}
app.setName("Preflight");
if (process.env.PREFLIGHT_DESKTOP_TEST_DATA)
  app.setPath("userData", process.env.PREFLIGHT_DESKTOP_TEST_DATA);
async function boot() {
  const controller = new DesktopController(
    join(app.getPath("userData"), "workspace.json"),
    process.env.PREFLIGHT_DESKTOP_TEST_HOME ?? app.getPath("home"),
    engine,
  );
  await controller.load();
  controller.restoreAuth((value) =>
    safeStorage.decryptString(Buffer.from(value, "base64")),
  );
  if (process.env.PREFLIGHT_DESKTOP_TEST_ROOT)
    await controller.addProject(process.env.PREFLIGHT_DESKTOP_TEST_ROOT);
  handle("state", () => controller.publicState());
  handle("snapshot", () => controller.snapshot());
  handle("prepare", (args) => controller.prepare(args));
  handle("confirm", (receipt) => controller.confirm(z.uuid().parse(receipt)));
  handle("selectGlobal", () => controller.selectGlobal());
  handle("selectProject", (id) => controller.selectProject(z.uuid().parse(id)));
  handle("forgetProject", (id) => controller.forgetProject(z.uuid().parse(id)));
  handle("chooseProject", async () => {
    const selected = await dialog.showOpenDialog(window, {
      title: "Open an AI development project",
      properties: ["openDirectory"],
    });
    return !selected.canceled && selected.filePaths[0]
      ? controller.addProject(selected.filePaths[0])
      : controller.publicState();
  });
  handle("team", (value) =>
    controller.updateTeam(value as Parameters<typeof controller.updateTeam>[0]),
  );
  handle("disconnect", async () => {
    const session = controller.session();
    if (session?.authentication === "session")
      await signOut(session.service, session.token);
    return controller.disconnect();
  });
  const pendingSignIns = new Map<
    string,
    {
      service: string;
      device: DeviceAuthorization;
      expiresAt: number;
      token?: string;
      sessionExpiresAt?: string;
    }
  >();
  handle("beginSignIn", async (input) => {
    const service = serviceUrl(z.string().max(2000).parse(input));
    const device = await beginDeviceSignIn(service, "preflight-desktop");
    const id = randomUUID(),
      expiresAt = Date.now() + device.expires_in * 1000;
    for (const [key, pending] of pendingSignIns)
      if (pending.expiresAt <= Date.now()) pendingSignIns.delete(key);
    pendingSignIns.set(id, { service, device, expiresAt });
    await shell.openExternal(device.verification_uri_complete);
    return {
      id,
      userCode: device.user_code,
      verificationUri: device.verification_uri_complete,
      interval: device.interval,
      expiresAt,
    };
  });
  handle("pollSignIn", async (input) => {
    const id = z.string().uuid().parse(input),
      pending = pendingSignIns.get(id);
    if (!pending || pending.expiresAt <= Date.now()) {
      pendingSignIns.delete(id);
      throw new Error("Sign-in request expired; start again.");
    }
    if (!pending.token) {
      const reply = await pollDeviceSignIn(
        pending.service,
        "preflight-desktop",
        pending.device,
      );
      if (reply.status === "pending") return reply;
      pending.token = reply.token;
      pending.sessionExpiresAt = reply.expiresAt;
    }
    const identity = await accountIdentity(pending.service, pending.token);
    if (pendingSignIns.get(id) !== pending) {
      await signOut(pending.service, pending.token).catch(() => {});
      throw new Error("Sign-in was cancelled.");
    }
    const secure =
      safeStorage.isEncryptionAvailable() &&
      (process.platform !== "linux" ||
        safeStorage.getSelectedStorageBackend() !== "basic_text");
    await controller.setAccount(
      {
        service: pending.service,
        token: pending.token,
        ownerId: identity.ownerId,
        authentication: identity.authentication,
        ...(identity.user ? { user: identity.user } : {}),
        expiresAt: identity.expiresAt ?? pending.sessionExpiresAt!,
      },
      secure
        ? safeStorage.encryptString(pending.token).toString("base64")
        : undefined,
    );
    if (pendingSignIns.get(id) !== pending) {
      if (controller.session()?.token === pending.token)
        await controller.disconnect();
      await signOut(pending.service, pending.token).catch(() => {});
      throw new Error("Sign-in was cancelled.");
    }
    pendingSignIns.delete(id);
    return { status: "connected" };
  });
  handle("cancelSignIn", async (input) => {
    const id = z.string().uuid().parse(input);
    const pending = pendingSignIns.get(id);
    pendingSignIns.delete(id);
    if (pending?.token)
      await signOut(pending.service, pending.token).catch(() => {});
  });
  handle("copyText", (input) => {
    clipboard.writeText(z.string().max(1000000).parse(input));
  });
  handle("cloud", async (input) => {
    const operation = CloudOperation.parse(input);
    const session = controller.session();
    if (!session || session.authentication !== "session")
      throw new Error(
        "Sign in with your browser to manage cloud organizations.",
      );
    const value = await cloudRequest(session.service, session.token, operation);
    if (controller.session()?.token !== session.token)
      throw new Error(
        "Account changed; refresh the organization before continuing.",
      );
    return value;
  });
  handle("connect", async (input) => {
    const value = z
      .object({
        service: z.string().max(2000),
        token: z.string().min(1).max(16000),
      })
      .parse(input);
    const service = serviceUrl(value.service);
    const response = await fetch(`${service}/api/account`, {
      headers: { Authorization: `Bearer ${value.token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        `Connection refused (HTTP ${response.status}). Check the service URL and owner token.`,
      );
    const { ownerId } = z
      .object({ ownerId: z.string().min(1) })
      .parse(await response.json());
    const secure =
      safeStorage.isEncryptionAvailable() &&
      (process.platform !== "linux" ||
        safeStorage.getSelectedStorageBackend() !== "basic_text");
    return controller.setAccount(
      { service, ownerId, token: value.token },
      secure
        ? safeStorage.encryptString(value.token).toString("base64")
        : undefined,
    );
  });
  handle("openExternal", async (input) => {
    const url = new URL(z.string().max(2000).parse(input));
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Only web links can be opened");
    await shell.openExternal(url.href);
  });
  handle("chooseFile", async () => {
    const selected = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [{ name: "JSON configuration", extensions: ["json"] }],
    });
    return selected.filePaths[0] ?? null;
  });
  handle("exportFile", async () => {
    const selected = await dialog.showSaveDialog(window, {
      defaultPath: "preflight-share.json",
      filters: [{ name: "JSON configuration", extensions: ["json"] }],
    });
    return selected.filePath ?? null;
  });
  installMenu((command) => {
    if (window && !window.isDestroyed())
      window.webContents.send("preflight:command", command);
  });
  await createWindow();
}
void app
  .whenReady()
  .then(boot)
  .catch((error: unknown) => {
    console.error(error);
    app.exit(1);
  });
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", (event) => {
  if (children.size) {
    event.preventDefault();
    void dialog.showMessageBox(window, {
      type: "info",
      message: "An operation is still running",
      detail: "Let the operation finish before quitting Preflight.",
    });
  }
});
