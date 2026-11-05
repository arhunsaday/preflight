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
import { hostname } from "node:os";
import {
  AccountIdentity,
  accountIdentity,
  loopback,
  pkce,
  redeemCode,
  signInUrl,
  signOut,
} from "../../src/auth-client.js";
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
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#111113" : "#f6f6f7",
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
    if (session) await signOut(session.service, session.token).catch(() => {});
    return controller.disconnect();
  });
  const secureStorage = () =>
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== "linux" ||
      safeStorage.getSelectedStorageBackend() !== "basic_text");
  // Browser sign-in: loopback redirect on 127.0.0.1 with PKCE, then the code
  // is redeemed here for a Preflight API token that never reaches the renderer.
  const pendingSignIns = new Map<
    string,
    {
      service: string;
      verifier: string;
      server: Awaited<ReturnType<typeof loopback>>;
      expiresAt: number;
      code?: string;
      token?: string;
    }
  >();
  handle("beginSignIn", async (input) => {
    const service = serviceUrl(z.string().max(2000).parse(input));
    for (const [key, pending] of pendingSignIns)
      if (pending.expiresAt <= Date.now()) {
        pending.server.close();
        pendingSignIns.delete(key);
      }
    const { verifier, challenge, state } = pkce();
    const expiresAt = Date.now() + 5 * 60_000;
    const server = await loopback(state, 5 * 60_000);
    const id = randomUUID();
    const pending: {
      service: string;
      verifier: string;
      server: typeof server;
      expiresAt: number;
      code?: string;
    } = { service, verifier, server, expiresAt };
    server.code.then(
      (code) => {
        pending.code = code;
      },
      () => {},
    );
    pendingSignIns.set(id, pending);
    const verificationUri = signInUrl(service, {
      redirectUri: server.redirectUri,
      state,
      challenge,
      client: "desktop",
    });
    await shell.openExternal(verificationUri);
    return { id, verificationUri, interval: 1, expiresAt };
  });
  handle("pollSignIn", async (input) => {
    const id = z.string().uuid().parse(input),
      pending = pendingSignIns.get(id);
    if (!pending || pending.expiresAt <= Date.now()) {
      pending?.server.close();
      pendingSignIns.delete(id);
      throw new Error("Sign-in request expired; start again.");
    }
    if (!pending.code) return { status: "pending" as const, interval: 1 };
    if (!pending.token) {
      const grant = await redeemCode(pending.service, {
        code: pending.code,
        verifier: pending.verifier,
        redirectUri: pending.server.redirectUri,
        label: `Preflight desktop on ${hostname()}`,
      });
      pending.token = grant.token;
    }
    const token = pending.token;
    const identity = await accountIdentity(pending.service, token);
    if (pendingSignIns.get(id) !== pending) {
      await signOut(pending.service, token).catch(() => {});
      throw new Error("Sign-in was cancelled.");
    }
    await controller.setAccount(
      {
        service: pending.service,
        token,
        ownerId: identity.ownerId,
        authentication: "token",
        ...(identity.user ? { user: identity.user } : {}),
        ...(identity.expiresAt ? { expiresAt: identity.expiresAt } : {}),
      },
      secureStorage()
        ? safeStorage.encryptString(token).toString("base64")
        : undefined,
    );
    if (pendingSignIns.get(id) !== pending) {
      if (controller.session()?.token === token) await controller.disconnect();
      await signOut(pending.service, token).catch(() => {});
      throw new Error("Sign-in was cancelled.");
    }
    pendingSignIns.delete(id);
    return { status: "connected" as const };
  });
  handle("cancelSignIn", async (input) => {
    const id = z.string().uuid().parse(input);
    const pending = pendingSignIns.get(id);
    pendingSignIns.delete(id);
    pending?.server.close();
    if (pending?.token)
      await signOut(pending.service, pending.token).catch(() => {});
  });
  handle("copyText", (input) => {
    clipboard.writeText(z.string().max(1000000).parse(input));
  });
  handle("cloud", async (input) => {
    const operation = CloudOperation.parse(input);
    const session = controller.session();
    if (!session)
      throw new Error("Sign in with your browser to manage cloud organizations.");
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
        `Connection refused (HTTP ${response.status}). Check the service URL and API token.`,
      );
    const identity = AccountIdentity.parse(await response.json());
    return controller.setAccount(
      {
        service,
        ownerId: identity.ownerId,
        token: value.token,
        authentication: "token",
        ...(identity.user ? { user: identity.user } : {}),
        ...(identity.expiresAt ? { expiresAt: identity.expiresAt } : {}),
      },
      secureStorage()
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
