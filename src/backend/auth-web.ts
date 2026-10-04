export const authScript = `
const status = document.querySelector('[data-status]');
const code = new URL(location.href).searchParams.get('user_code') || '';
const api = async (path, body) => {
 const response = await fetch('/api/auth/' + path, { method: body ? 'POST' : 'GET', headers: body ? {'Content-Type':'application/json'} : {}, ...(body ? {body:JSON.stringify(body)} : {}) });
 const data = await response.json(); if (!response.ok) throw new Error(data.message || data.error_description || data.error || 'Request failed'); return data;
};
for (const button of document.querySelectorAll('[data-provider]')) button.addEventListener('click', async () => {
 try { const result = await api('sign-in/social', {provider:button.dataset.provider,callbackURL:location.origin+'/device'+(code?'?user_code='+encodeURIComponent(code):'')}); if(result.url) location.assign(result.url); } catch(e){status.textContent=e.message;}
});
const form = document.querySelector('[data-device-form]');
if (form) {
 const field = form.querySelector('input'); field.value = code;
 form.addEventListener('submit', async (e) => { e.preventDefault(); location.assign('/device?user_code='+encodeURIComponent(field.value.trim())); });
}
if (code && document.querySelector('[data-approval]')) (async () => {
 try { const result = await api('device?user_code='+encodeURIComponent(code)); const client = document.querySelector('[data-client]'); if (client) client.textContent = result.client_id || 'Preflight'; document.querySelector('[data-approval]').hidden=false; status.textContent='Compare the code below with the one shown on your device.'; }
 catch(e){status.textContent=e.message;}
})();
for(const button of document.querySelectorAll('[data-decision]')) button.addEventListener('click',async () => {
 try { await api('device/'+button.dataset.decision,{userCode:code}); document.querySelector('[data-approval]').hidden=true; status.textContent=button.dataset.decision==='approve'?'Device connected. You can return to Preflight.':'Request denied.'; }catch(e){status.textContent=e.message;}
});
`;
export function authPage(options: {
  providers: string[];
  code: string;
  signedIn: boolean;
  escape: (text: string) => string;
}) {
  const { escape, code } = options;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sign in to Preflight</title><script src="/auth.js" defer></script><style>body{font:16px system-ui;max-width:560px;margin:8vh auto;padding:24px;color:#202938;background:#f5f7fa}main{background:white;padding:32px;border:1px solid #dde3eb;border-radius:16px}p{line-height:1.6;color:#637083}button,input{font:inherit;padding:12px 16px;border:1px solid #cbd4e1;border-radius:7px;margin:6px 0}button{cursor:pointer;background:#2563eb;color:white}code{font-size:26px;letter-spacing:3px;display:block;padding:18px 0}[hidden]{display:none!important}</style></head><body><main><h1>Preflight</h1><h2>${options.signedIn ? "Connect your device" : "Sign in to your account"}</h2><p>Your account owns your shares and organization membership. Your local agent configuration stays on your machine.</p>${options.signedIn ? `<form data-device-form><label>Code shown on your device<input aria-label="Device code" required autocomplete="off" name="user_code"></label><button>Verify code</button></form><section data-approval hidden><h3>Authorize <span data-client>Preflight</span></h3><code>${escape(code)}</code><p>Only approve a device in your possession. Never approve unexpected requests or codes sent by another person. Confirm that this code matches the one on your CLI or desktop.</p><button data-decision="approve">Approve this device</button><button data-decision="deny">Deny</button></section>` : options.providers.length ? options.providers.map((p) => `<button data-provider="${escape(p)}">Continue with ${p === "github" ? "GitHub" : "Google"}</button>`).join(" ") : "<p>Authentication providers have not been configured for this deployment.</p>"}<p data-status role="status"></p></main></body></html>`;
}
