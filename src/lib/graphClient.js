import { msalInstance } from '../main.jsx';
import { loginRequest, GRAPH_BASE } from './authConfig.js';

// Acquire a Graph token silently, falling back to interactive popup.
// A burst of parallel requests on page load would otherwise each trigger their
// own silent acquisition (and racing iframe renewals — the main cold-load
// stall). We share a single in-flight acquisition across the burst, then clear
// it so later calls re-check MSAL's cache (fast when the token is still valid).
let _tokenPromise = null;
async function getToken() {
  const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
  if (!account) throw new Error('Not signed in.');
  if (!_tokenPromise) {
    _tokenPromise = msalInstance
      .acquireTokenSilent({ ...loginRequest, account })
      .then((res) => res.accessToken)
      .catch(async () => {
        const res = await msalInstance.acquireTokenPopup({ ...loginRequest, account });
        return res.accessToken;
      });
    _tokenPromise.finally(() => { _tokenPromise = null; });
  }
  return _tokenPromise;
}

// Acquire a token for a specific scope set (e.g. Mail.Send), independent of the
// app's core scopes. Kept separate so email permission is requested only when
// actually sending mail — a missing/denied Mail.Send consent never blocks the
// data operations that run on the core loginRequest scopes.
async function getTokenFor(scopes) {
  const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
  if (!account) throw new Error('Not signed in.');
  try {
    const res = await msalInstance.acquireTokenSilent({ scopes, account });
    return res.accessToken;
  } catch {
    const res = await msalInstance.acquireTokenPopup({ scopes, account });
    return res.accessToken;
  }
}

// Send an email as the signed-in user via Microsoft Graph (Mail.Send).
// Best-effort: callers wrap this in try/catch so a consent/permission gap can't
// break the task action that triggered it.
export async function graphSendMail({ to, subject, html }) {
  const recipients = (Array.isArray(to) ? to : [to])
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
  if (!recipients.length) return;
  const token = await getTokenFor(['Mail.Send']);
  const res = await fetch(`${GRAPH_BASE}/me/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: { subject, body: { contentType: 'HTML', content: html }, toRecipients: recipients },
      saveToSentItems: true,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Graph sendMail failed: ${res.status} ${text}`);
  }
}

// Search the organization directory for people to @mention (User.ReadBasic.All).
// Requested incrementally like Mail.Send so a missing consent never blocks the
// app; callers treat a rejection as "no org results". Returns [{id, displayName,
// mail, userPrincipalName}].
export async function graphSearchUsers(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const token = await getTokenFor(['User.ReadBasic.All']);
  const search = encodeURIComponent(`"displayName:${q}" OR "mail:${q}"`);
  const res = await fetch(
    `${GRAPH_BASE}/users?$search=${search}&$select=id,displayName,mail,userPrincipalName&$top=8`,
    { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' } }
  );
  if (!res.ok) throw new Error(`Graph user search failed: ${res.status}`);
  const data = await res.json();
  return data.value || [];
}

// Core fetch wrapper around the Graph REST API. `path` may be a Graph-relative
// path (prefixed with GRAPH_BASE) or an absolute URL (e.g. an @odata.nextLink).
export async function graphFetch(path, options = {}) {
  const token = await getToken();
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Graph ${options.method || 'GET'} ${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const graphGet = (path) => graphFetch(path, { method: 'GET' });
// GET that follows @odata.nextLink and returns the concatenated `value` array.
// Use for collections that can paginate (e.g. a list's columns) so we don't
// mistake later-page items for missing ones.
export async function graphGetAll(path) {
  let url = path;
  const all = [];
  while (url) {
    const page = await graphFetch(url, { method: 'GET' });
    if (page?.value) all.push(...page.value);
    url = page?.['@odata.nextLink'] || null;
  }
  return all;
}
export const graphPost = (path, body) =>
  graphFetch(path, { method: 'POST', body: JSON.stringify(body) });
export const graphPatch = (path, body) =>
  graphFetch(path, { method: 'PATCH', body: JSON.stringify(body) });
export const graphDelete = (path) => graphFetch(path, { method: 'DELETE' });
