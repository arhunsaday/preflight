// HTML served by the Worker: the browser sign-in page and its script.
export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

export const pageStyle =
  "body{font:16px/1.6 system-ui,sans-serif;max-width:560px;margin:8vh auto;padding:0 16px;color:#172f3f;background:#f3f6f6}main{background:#fff;padding:32px;border:1px solid #ced9dc;border-radius:14px}h1{margin-top:0}p{color:#41576a}button,input{font:inherit;padding:10px 14px;border:1px solid #cbd4e1;border-radius:7px;margin:6px 0;width:100%;box-sizing:border-box}button{cursor:pointer;background:#176b68;color:#fff;border-color:#176b68}code{font-size:20px;word-break:break-all;display:block;padding:12px;background:#eef3f2;border-radius:7px}[hidden]{display:none!important}@media (prefers-color-scheme:dark){body{background:#101416;color:#e3eaee}main{background:#182024;border-color:#2c3a40}p{color:#a7b7c0}code{background:#0f1719}}";

export function signInPage(options: {
  mode: "clerk" | "dev";
  publishableKey?: string;
  frontendApi?: string;
  client?: string;
  nonce: string;
}) {
  const clerkScript =
    options.mode === "clerk"
      ? `<script async crossorigin="anonymous" data-clerk-publishable-key="${escapeHtml(options.publishableKey!)}" src="https://${escapeHtml(options.frontendApi!)}/npm/@clerk/clerk-js@5/dist/clerk.browser.js" nonce="${options.nonce}"></script>`
      : "";
  const who =
    options.client === "desktop"
      ? "the Preflight desktop app"
      : options.client === "cli"
        ? "the Preflight CLI"
        : "Preflight";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Sign in to Preflight</title><style>${pageStyle}</style>${clerkScript}<script src="/auth/sign-in.js" defer nonce="${options.nonce}"></script></head><body><main data-mode="${options.mode}"><h1>Preflight</h1><p data-intro>Sign in to connect ${escapeHtml(who)} on this computer. Your local agent configuration stays on your machine.</p><div data-sign-in></div>${options.mode === "dev" ? `<form data-dev-form><p><strong>Local development identity.</strong> This deployment runs with PREFLIGHT_DEV_AUTH=1 and no real accounts.</p><input name="name" aria-label="Name" placeholder="Name" required><input name="email" type="email" aria-label="Email" placeholder="Email" required><button>Continue as this person</button></form>` : ""}<section data-confirm hidden><p>Signed in as <strong data-who></strong>.</p><p>Only continue if you started this sign-in from ${escapeHtml(who)} yourself.</p><button data-continue>Connect ${escapeHtml(who)}</button></section><section data-code hidden><p>Paste this code into your terminal:</p><code data-code-value></code></section><p data-status role="status"></p></main></body></html>`;
}

export const signInScript = `
(() => {
const main = document.querySelector('main');
const status = document.querySelector('[data-status]');
const query = new URLSearchParams(location.search);
const say = (text) => { status.textContent = text; };
let token = null;
async function exchange() {
  say('Connecting…');
  const response = await fetch('/auth/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    session_token: await token(),
    redirect_uri: query.get('redirect_uri') || '',
    state: query.get('state') || '',
    code_challenge: query.get('code_challenge') || '',
    code_challenge_method: query.get('code_challenge_method') || '',
    client: query.get('client') || '',
  }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Sign-in failed');
  document.querySelector('[data-confirm]').hidden = true;
  if (data.redirect) { say('Connected. You can return to Preflight.'); location.assign(data.redirect); return; }
  document.querySelector('[data-code-value]').textContent = data.code;
  document.querySelector('[data-code]').hidden = false;
  say('');
}
function confirm(name) {
  if (!query.get('code_challenge')) { say('You are signed in. Return to Preflight and refresh your teams.'); return; }
  document.querySelector('[data-who]').textContent = name;
  document.querySelector('[data-confirm]').hidden = false;
}
document.querySelector('[data-continue]').addEventListener('click', (e) => {
  e.currentTarget.disabled = true;
  exchange().catch((error) => { say(error.message); e.currentTarget.disabled = false; });
});
if (main.dataset.mode === 'dev') {
  const form = document.querySelector('[data-dev-form]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    const response = await fetch('/auth/dev/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { say(data.error || 'Sign-in failed'); return; }
    token = async () => data.token;
    form.hidden = true;
    confirm(body.name);
  });
  return;
}
const start = async () => {
  if (!window.Clerk) { setTimeout(start, 50); return; }
  await window.Clerk.load();
  const ready = () => {
    if (!window.Clerk.user) return false;
    token = () => window.Clerk.session.getToken();
    document.querySelector('[data-sign-in]').hidden = true;
    confirm(window.Clerk.user.fullName || window.Clerk.user.primaryEmailAddress?.emailAddress || 'your account');
    return true;
  };
  if (!ready()) {
    window.Clerk.mountSignIn(document.querySelector('[data-sign-in]'), { forceRedirectUrl: location.href, signUpForceRedirectUrl: location.href });
    const stop = window.Clerk.addListener(() => { if (ready()) stop?.(); });
  }
};
start().catch((error) => say(error.message));
})();
`;
