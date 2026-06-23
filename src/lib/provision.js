import { graphGet, graphPost } from './graphClient.js';
import { SCHEMA, graphColumnBody } from './schema.js';
import { SHAREPOINT_SITE_PATH } from './authConfig.js';

// Resolve the SharePoint site id once and cache it. We cache the in-flight
// promise (not just the resolved value) so a burst of parallel list loads on
// startup shares ONE /sites lookup instead of each firing its own.
let _siteIdPromise = null;
export async function getSiteId() {
  if (!_siteIdPromise) {
    _siteIdPromise = graphGet(`/sites/${SHAREPOINT_SITE_PATH}`)
      .then((site) => site.id)
      .catch((err) => { _siteIdPromise = null; throw err; }); // let it retry next time
  }
  return _siteIdPromise;
}

// ─────────────────────────────────────────────────────────────────────────
// "Provision all 10 lists on first publish."
//
// A plain SPA has no platform provisioning step, so we emulate it: on first
// run we read existing lists, then create any of the 10 that are missing,
// adding each column the schema declares. Idempotent — safe to run repeatedly.
//
// Requires the signed-in user to have permission to create lists on the site
// (Sites.ReadWrite.All delegated, or Sites.Selected with write on this site).
// ─────────────────────────────────────────────────────────────────────────
export async function ensureProvisioned(onProgress = () => {}) {
  const siteId = await getSiteId();

  const existing = await graphGet(`/sites/${siteId}/lists?$select=id,name,displayName`);
  const existingNames = new Set((existing.value || []).map((l) => l.name));

  const created = [];
  for (const def of SCHEMA) {
    if (existingNames.has(def.name)) {
      onProgress({ list: def.name, status: 'exists' });
      continue;
    }
    onProgress({ list: def.name, status: 'creating' });
    const body = {
      displayName: def.name,
      list: { template: 'genericList' },
      columns: def.columns.map(graphColumnBody),
    };
    await graphPost(`/sites/${siteId}/lists`, body);
    created.push(def.name);
    onProgress({ list: def.name, status: 'created' });
  }
  return { created, total: SCHEMA.length };
}
