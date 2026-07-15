import { graphGet, graphPost, graphPatch, graphDelete } from './graphClient.js';
import { getSiteId } from './provision.js';
import { SCHEMA } from './schema.js';

// Writable columns per list (schema columns + the built-in Title). Used to
// strip read-only/system fields (id, @odata.etag, Created, etc.) that come
// back inside item.fields but are rejected by SharePoint on write.
const WRITABLE = Object.fromEntries(
  SCHEMA.map((d) => [d.name, new Set([...d.columns.map((c) => c.name), 'Title'])])
);
// Column → kind lookup, so we can coerce values SharePoint would reject.
const KINDS = Object.fromEntries(
  SCHEMA.map((d) => [d.name, Object.fromEntries(d.columns.map((c) => [c.name, c.kind]))])
);
function pickWritable(listName, obj) {
  const allow = WRITABLE[listName];
  if (!allow) return obj;
  const kinds = KINDS[listName] || {};
  const out = {};
  for (const k of Object.keys(obj)) {
    if (!allow.has(k)) continue;
    let v = obj[k];
    // SharePoint Date/Number columns reject empty strings with a 400
    // badArgument — send null to leave them blank instead.
    if ((kinds[k] === 'date' || kinds[k] === 'number') && (v === '' || v === undefined)) v = null;
    out[k] = v;
  }
  return out;
}

export function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Build a CRUD service bound to one SharePoint list.
//   listName: internal list name (matches schema)
//   idField:  the entity's own id column (e.g. "resourceId")
// Returns { list, get, create, update, remove }.
//
// SharePoint items wrap data under `fields`; the SP item id is `item.id`,
// which we surface as `_spId` so update/delete can target the row.
export function makeListService(listName, idField) {
  async function listPath() {
    const siteId = await getSiteId();
    return `/sites/${siteId}/lists/${listName}`;
  }

  function fromItem(item) {
    return { ...item.fields, _spId: item.id };
  }

  return {
    listName,

    async list() {
      const base = await listPath();
      // $expand=fields pulls all column values for each item.
      const data = await graphGet(`${base}/items?$expand=fields&$top=999`);
      return (data.value || []).map(fromItem);
    },

    async create(entity) {
      const base = await listPath();
      const id = entity[idField] || uuid();
      // Default Title to the id (our convention: Title is unused, holds the id),
      // but keep a caller-provided Title — ProjectTask uses Title as the task name.
      const fields = pickWritable(listName, { ...entity, [idField]: id });
      if (fields.Title == null) fields.Title = id;
      const item = await graphPost(`${base}/items`, { fields });
      return fromItem(item);
    },

    async update(spId, patch) {
      const base = await listPath();
      // Send only writable columns — a spread row carries read-only system
      // fields (id, @odata.etag, …) that SharePoint rejects.
      const fields = pickWritable(listName, patch);
      await graphPatch(`${base}/items/${spId}/fields`, fields);
      return { _spId: spId, ...patch };
    },

    async remove(spId) {
      const base = await listPath();
      await graphDelete(`${base}/items/${spId}`);
      return spId;
    },
  };
}
