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

// Core fetch wrapper around the Graph REST API.
export async function graphFetch(path, options = {}) {
  const token = await getToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
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
export const graphPost = (path, body) =>
  graphFetch(path, { method: 'POST', body: JSON.stringify(body) });
export const graphPatch = (path, body) =>
  graphFetch(path, { method: 'PATCH', body: JSON.stringify(body) });
export const graphDelete = (path) => graphFetch(path, { method: 'DELETE' });
