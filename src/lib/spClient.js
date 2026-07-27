// SharePoint REST client for list-item attachments — Microsoft Graph does not
// support list attachments, so these calls go straight to the SharePoint REST
// API using a SharePoint-audience token (separate from the Graph token).
//
// Requires the app registration to have a SharePoint delegated permission
// (e.g. AllSites.Write) with admin consent; otherwise the token request fails
// and callers surface the error.
import { msalInstance } from '../main.jsx';
import { SHAREPOINT_SITE_PATH } from './authConfig.js';

// SHAREPOINT_SITE_PATH looks like "host.sharepoint.com:/sites/foo".
const [SP_HOST, SP_SITE_PATH = ''] = SHAREPOINT_SITE_PATH.split(':');
const SP_RESOURCE = `https://${SP_HOST}`;
const SP_WEB = `${SP_RESOURCE}${SP_SITE_PATH}`;

async function getSpToken() {
  const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
  if (!account) throw new Error('Not signed in.');
  const req = { scopes: [`${SP_RESOURCE}/.default`], account };
  try {
    return (await msalInstance.acquireTokenSilent(req)).accessToken;
  } catch {
    return (await msalInstance.acquireTokenPopup(req)).accessToken;
  }
}

async function spFetch(path, options = {}) {
  const token = await getSpToken();
  const res = await fetch(`${SP_WEB}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;odata=nometadata',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SharePoint ${options.method || 'GET'} ${path} failed: ${res.status} ${text}`);
  }
  return res;
}

// Write operations want a form digest. With bearer auth it's often optional,
// but we send it to be safe.
async function getDigest() {
  const res = await spFetch('/_api/contextinfo', { method: 'POST' });
  const data = await res.json();
  return data.FormDigestValue || data?.d?.GetContextWebInformation?.FormDigestValue;
}

const attachBase = (listName, itemId) =>
  `/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${itemId})/AttachmentFiles`;

// List a list item's attachments → [{ name, url }].
export async function listAttachments(listName, itemId) {
  const res = await spFetch(attachBase(listName, itemId));
  const data = await res.json();
  return (data.value || []).map((r) => ({ name: r.FileName, url: `${SP_RESOURCE}${r.ServerRelativeUrl}` }));
}

// Upload a File to a list item's attachments.
export async function addAttachment(listName, itemId, file) {
  const digest = await getDigest();
  const body = await file.arrayBuffer();
  await spFetch(`${attachBase(listName, itemId)}/add(FileName='${encodeURIComponent(file.name)}')`, {
    method: 'POST',
    headers: { 'X-RequestDigest': digest, 'Content-Type': 'application/octet-stream' },
    body,
  });
}

// Remove an attachment by file name.
export async function deleteAttachment(listName, itemId, fileName) {
  const digest = await getDigest();
  await spFetch(`${attachBase(listName, itemId)}/getByFileName('${encodeURIComponent(fileName)}')`, {
    method: 'POST',
    headers: { 'X-RequestDigest': digest, 'X-HTTP-Method': 'DELETE' },
  });
}
