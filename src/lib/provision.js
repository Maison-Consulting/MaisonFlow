import { graphGet, graphGetAll, graphPost } from './graphClient.js';
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

  const existing = await graphGetAll(`/sites/${siteId}/lists?$select=id,name,displayName`);
  const existingNames = new Set(existing.map((l) => l.name));

  const created = [];
  const columnsAdded = []; // "List.column" entries added to already-existing lists
  const errors = [];       // { target, message } for anything that couldn't be provisioned
  for (const def of SCHEMA) {
    if (existingNames.has(def.name)) {
      onProgress({ list: def.name, status: 'exists' });
      // The list predates one or more schema columns (e.g. invoiceDate added
      // later). Add any missing columns so writes to them aren't silently
      // dropped/rejected by SharePoint. Per-column failures (e.g. 403 on a
      // list the user can't alter) are collected, not fatal — other lists
      // still get provisioned.
      const { added, failed } = await ensureColumns(siteId, def, onProgress);
      columnsAdded.push(...added.map((c) => `${def.name}.${c}`));
      errors.push(...failed);
      continue;
    }
    onProgress({ list: def.name, status: 'creating' });
    try {
      const body = {
        displayName: def.name,
        list: { template: 'genericList' },
        columns: def.columns.map(graphColumnBody),
      };
      await graphPost(`/sites/${siteId}/lists`, body);
      created.push(def.name);
      onProgress({ list: def.name, status: 'created' });
    } catch (err) {
      errors.push({ target: def.name, message: err.message });
      onProgress({ list: def.name, status: 'error', message: err.message });
    }
  }
  return { created, columnsAdded, errors, total: SCHEMA.length };
}

// Add any schema-declared columns missing from an existing list. Idempotent:
// compares against the list's current columns by internal name and only
// creates the gaps. Column creation failures are collected (not thrown) so one
// locked-down list doesn't abort provisioning of the rest.
async function ensureColumns(siteId, def, onProgress) {
  const cols = await graphGetAll(`/sites/${siteId}/lists/${def.name}/columns?$select=name`);
  const have = new Set(cols.map((c) => c.name));
  const added = [];
  const failed = [];
  for (const col of def.columns) {
    if (have.has(col.name)) continue;
    onProgress({ list: def.name, status: 'add-column', column: col.name });
    try {
      await graphPost(`/sites/${siteId}/lists/${def.name}/columns`, graphColumnBody(col));
      added.push(col.name);
    } catch (err) {
      failed.push({ target: `${def.name}.${col.name}`, message: err.message });
      onProgress({ list: def.name, status: 'error', column: col.name, message: err.message });
    }
  }
  return { added, failed };
}
