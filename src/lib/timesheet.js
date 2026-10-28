import { graphGet, graphGetAll, graphFetch } from './graphClient.js';
import { makeListService } from './listService.js';

// ─────────────────────────────────────────────────────────────────────────
// Timesheet integration.
//
// The timesheet lives in a SharePoint list on a DIFFERENT site (same tenant),
// with its own project/activity names. We read it with the user's Graph token
// (Sites.ReadWrite.All covers any site the user can open) and translate it via
// an admin-maintained config stored in the AppSetting list:
//   { siteUrl, siteId, listId, listName,
//     columns:  { person, date, project, activity, type, status, hoursOn, hoursOff, hoursTotal, customer, description },
//     meta:     { [column]: { kind, lookupListId, lookupColumn } },
//     dailyHours, workWeek,
//     projectMap:  { "<timesheet project>": "<Maison projectId>" | "__ignore" },
//     activityMap: { "<timesheet project>::<activity>": "<Maison taskId>" },
//     peopleMap:   { "<email or name>": "<Maison resourceId>" } }
// ─────────────────────────────────────────────────────────────────────────

export const settingService = makeListService('AppSetting', 'settingId');
const CONFIG_KEY = 'timesheet';
export const AUTHOR = '__author'; // pseudo-column: the item's "Created by"
export const IGNORE = '__ignore';

// Logical timesheet fields the admin maps onto the list's columns. `guess`
// auto-picks a column by display name on first setup.
export const TS_FIELDS = [
  { key: 'person', label: 'Employee', required: true, guess: /employee|resource|person|staff|consultant/i },
  { key: 'date', label: 'Date', required: true, guess: /^date$|work ?date|entry ?date|^date/i },
  { key: 'project', label: 'Project name', required: true, guess: /project ?name|^project$/i },
  { key: 'activity', label: 'Project activity', guess: /project ?activit|^activit/i },
  { key: 'slaActivity', label: 'SLA activity (used when project activity is empty)', guess: /sla ?activit/i },
  { key: 'type', label: 'Type (Project / SLA)', guess: /^type$|customer ?type|entry ?type|work ?type/i },
  { key: 'status', label: 'Approval status', guess: /status|approv/i },
  { key: 'hoursOn', label: 'On client site hours', guess: /\bon\b.*site|onsite/i },
  { key: 'hoursOff', label: 'Off client site hours', guess: /\boff\b.*site|offsite/i },
  { key: 'hoursTotal', label: 'Total hours (if no on/off split)', guess: /total|^hours$/i },
  { key: 'customer', label: 'Customer name', guess: /customer ?name|client ?name|^customer$/i },
  { key: 'description', label: 'Description', guess: /descr|comment|note/i },
];

export const WORK_WEEKS = {
  'Mon-Fri': [1, 2, 3, 4, 5],
  'Sun-Thu': [0, 1, 2, 3, 4],
  'Mon-Sat': [1, 2, 3, 4, 5, 6],
};

// ── Config persistence ───────────────────────────────────────────────────
export async function loadConfig() {
  const rows = await settingService.list();
  const row = rows.find((r) => r.settingKey === CONFIG_KEY) || null;
  let config = null;
  try { config = row?.value ? JSON.parse(row.value) : null; } catch { config = null; }
  return { row, config };
}

export async function saveConfig(row, config) {
  const value = JSON.stringify(config);
  if (row?._spId) {
    await settingService.update(row._spId, { value });
    return { ...row, value };
  }
  return settingService.create({ settingKey: CONFIG_KEY, value });
}

// ── Source discovery (setup wizard) ──────────────────────────────────────
// "https://tenant.sharepoint.com/sites/Timesheet/Lists/X/AllItems.aspx" →
// "tenant.sharepoint.com:/sites/Timesheet"
export function sitePathFromUrl(url) {
  let u;
  try { u = new URL(String(url).trim()); } catch { throw new Error('Enter a full site URL, e.g. https://tenant.sharepoint.com/sites/Timesheet'); }
  const m = u.pathname.match(/^\/(sites|teams)\/[^/]+/i);
  if (!m) throw new Error('URL must point to a site, e.g. https://tenant.sharepoint.com/sites/Timesheet');
  return `${u.hostname}:${m[0]}`;
}

export async function resolveSite(url) {
  return graphGet(`/sites/${sitePathFromUrl(url)}`);
}

export async function listSiteLists(siteId) {
  const lists = await graphGetAll(`/sites/${siteId}/lists?$select=id,name,displayName,list`);
  return lists
    .filter((l) => !l.list?.hidden && l.list?.template !== 'documentLibrary')
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

const SYSTEM_COLS = new Set([
  'ContentType', 'Attachments', 'Edit', 'LinkTitleNoMenu', 'LinkTitle', 'DocIcon', 'ItemChildCount',
  'FolderChildCount', 'AppAuthor', 'AppEditor', 'ComplianceAssetId', 'Author', 'Editor', 'Modified', 'Created',
]);
function kindOf(c) {
  if (c.personOrGroup) return 'person';
  if (c.lookup) return 'lookup';
  if (c.dateTime) return 'date';
  if (c.number || c.currency) return 'number';
  return 'text';
}
export async function listColumns(siteId, listId) {
  const cols = await graphGetAll(`/sites/${siteId}/lists/${listId}/columns`);
  return cols
    .filter((c) => !c.hidden && !SYSTEM_COLS.has(c.name) && !c.name.startsWith('_'))
    .map((c) => ({
      name: c.name,
      displayName: c.displayName,
      kind: kindOf(c),
      lookupListId: c.lookup?.listId || null,
      lookupColumn: c.lookup?.columnName || null,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// First-time column guess from display names.
export function guessColumns(cols) {
  const out = {};
  const used = new Set();
  for (const f of TS_FIELDS) {
    const hit = cols.find((c) => !used.has(c.name) && (f.guess.test(c.displayName) || f.guess.test(c.name)));
    if (hit) { out[f.key] = hit.name; used.add(hit.name); }
  }
  if (!out.person) out.person = AUTHOR;
  return out;
}

// ── Reading entries ──────────────────────────────────────────────────────
// Page through a Graph collection. Each page gets its own timeout so a hung
// request surfaces as an error instead of an endless spinner; `onProgress`
// reports rows read so far and `maxRows` stops early (diagnostics).
const PAGE_TIMEOUT_MS = 60000;
async function fetchAllPages(path, headers, { onProgress, maxRows } = {}) {
  const all = [];
  let url = path;
  while (url) {
    // Race the whole call (token + request) so a stalled sign-in popup or a
    // hung request both end in a clear error.
    const ctrl = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        ctrl.abort();
        reject(new Error(`SharePoint didn't answer within ${PAGE_TIMEOUT_MS / 1000}s (after ${all.length} rows). If a sign-in popup was blocked, allow popups and retry.`));
      }, PAGE_TIMEOUT_MS);
    });
    let page;
    try {
      page = await Promise.race([graphFetch(url, { method: 'GET', headers, signal: ctrl.signal }), timeout]);
    } finally {
      clearTimeout(timer);
    }
    if (page?.value) all.push(...page.value);
    onProgress?.(all.length);
    if (maxRows && all.length >= maxRows) break;
    url = page?.['@odata.nextLink'] || null;
  }
  return all;
}

const NON_INDEXED = { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' };
function dateClause(config, from, to) {
  const col = config.columns?.date;
  if (!col || config.meta?.[col]?.kind !== 'date') return null;
  return `fields/${col} ge '${shiftDay(from, -1)}T00:00:00Z' and fields/${col} le '${shiftDay(to, 1)}T23:59:59Z'`;
}
function dateFilterPath(config, from, to) {
  const { siteId, listId } = config;
  return `/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=999&$filter=${encodeURIComponent(dateClause(config, from, to))}`;
}

// Restrict the read to given people (emails / names as stored in the
// timesheet) so SharePoint returns one person's rows, not everyone's.
// Text columns compare directly; person columns go through their user ids.
// Returns null when the column type can't be filtered this way.
async function personClause(config, people) {
  const col = config.columns?.person;
  const kind = config.meta?.[col]?.kind;
  const vals = [...new Set((people || []).map((v) => String(v || '').trim().toLowerCase()).filter(Boolean))];
  if (!col || col === AUTHOR || !vals.length) return null;
  if (kind === 'text') {
    return `(${vals.map((v) => `fields/${col} eq '${v.replace(/'/g, "''")}'`).join(' or ')})`;
  }
  if (kind === 'person') {
    const users = await usersFor(config.siteId);
    const ids = [...users].filter(([, u]) => vals.includes(u.email) || vals.includes(String(u.name).toLowerCase())).map(([id]) => id);
    return ids.length ? `(${ids.map((id) => `fields/${col}LookupId eq ${id}`).join(' or ')})` : null;
  }
  return null;
}

// Person columns come back from Graph as "<Name>LookupId" pointing into the
// site's hidden User Information List — read it once to get name + email.
async function userInfoMap(siteId) {
  try {
    const lists = await graphGetAll(`/sites/${siteId}/lists?$select=id,name,displayName,system`);
    const uil = lists.find((l) => l.displayName === 'User Information List' || l.name === 'users');
    if (!uil) return new Map();
    const items = await fetchAllPages(`/sites/${siteId}/lists/${uil.id}/items?$expand=fields($select=Title,EMail,UserName)&$top=999`);
    return new Map(items.map((i) => [String(i.id), {
      name: i.fields?.Title || '',
      email: String(i.fields?.EMail || i.fields?.UserName || '').toLowerCase(),
    }]));
  } catch {
    return new Map();
  }
}

// Lookup columns (e.g. Project Name → a Projects list) likewise only carry an
// id; resolve to the target list's display column.
async function lookupMap(siteId, listId, column) {
  try {
    const items = await fetchAllPages(`/sites/${siteId}/lists/${listId}/items?$expand=fields($select=${column})&$top=999`);
    return new Map(items.map((i) => [String(i.id), i.fields?.[column] ?? '']));
  } catch {
    return new Map();
  }
}

// Helper lists change rarely; cache them so paging months in the calendar
// doesn't re-read the whole user/customer/project lists every time.
const RESOLVER_TTL_MS = 10 * 60 * 1000;
const _resolverCache = new Map(); // key → { at, promise }
function cachedResolver(key, load) {
  const hit = _resolverCache.get(key);
  if (hit && Date.now() - hit.at < RESOLVER_TTL_MS) return hit.promise;
  const promise = load();
  _resolverCache.set(key, { at: Date.now(), promise });
  return promise;
}
const usersFor = (siteId) => cachedResolver(`users|${siteId}`, () => userInfoMap(siteId));

async function buildResolvers(config) {
  const { siteId, columns = {}, meta = {} } = config;
  const resolvers = {};
  let users = null;
  if (columns.person === AUTHOR) {
    users = await usersFor(siteId);
    resolvers[AUTHOR] = users;
  }
  for (const col of new Set(Object.values(columns).filter(Boolean))) {
    const m = meta[col];
    if (m?.kind === 'person') {
      users = users || await usersFor(siteId);
      resolvers[col] = users;
    } else if (m?.kind === 'lookup' && m.lookupListId && m.lookupColumn) {
      resolvers[col] = await cachedResolver(`lookup|${siteId}|${m.lookupListId}|${m.lookupColumn}`, () => lookupMap(siteId, m.lookupListId, m.lookupColumn));
    }
  }
  return resolvers;
}

function rawValue(fields, col, meta, resolvers) {
  if (!col) return '';
  const kind = meta[col]?.kind;
  if (kind === 'person' || kind === 'lookup') {
    const multi = Array.isArray(fields[col]) ? fields[col] : null;
    const id = fields[`${col}LookupId`] ?? multi?.[0]?.LookupId;
    const hit = id != null ? resolvers[col]?.get(String(id)) : undefined;
    if (hit != null) return hit;
    if (multi) return kind === 'person'
      ? { name: multi[0]?.LookupValue || '', email: String(multi[0]?.Email || '').toLowerCase() }
      : multi.map((x) => x.LookupValue).filter(Boolean).join(', ');
    return fields[col] ?? '';
  }
  return fields[col] ?? '';
}

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// Local calendar date (YYYY-MM-DD). SharePoint stores date-only values as UTC
// midnight of the user's zone, so "2026-09-30T19:00:00Z" is Oct 1 in PKT.
export function localDay(v) {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return toDay(d);
}
export function toDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shiftDay(day, n) {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toDay(d);
}

export function statusClass(s) {
  const v = String(s || '').toLowerCase();
  if (!v) return 'Submitted';
  if (v.includes('approv')) return 'Approved';
  if (v.includes('reject')) return 'Rejected';
  if (v.includes('draft') || v.includes('save')) return 'Draft';
  return 'Submitted';
}

function normalize(item, config, resolvers) {
  const { columns: c = {}, meta = {} } = config;
  const f = item.fields || {};
  const get = (col) => rawValue(f, col, meta, resolvers);

  let person;
  if (c.person === AUTHOR) {
    const u = item.createdBy?.user || {};
    const hit = resolvers[AUTHOR]?.get(String(f.AuthorLookupId ?? ''));
    person = { name: hit?.name || u.displayName || '', email: hit?.email || String(u.email || '').toLowerCase() };
  } else {
    const p = get(c.person);
    person = typeof p === 'object' && p ? p : { name: String(p || ''), email: /@/.test(String(p)) ? String(p).toLowerCase() : '' };
  }

  const onSite = num(get(c.hoursOn));
  const offSite = num(get(c.hoursOff));
  const split = !!(c.hoursOn || c.hoursOff);
  const hours = split ? onSite + offSite : num(get(c.hoursTotal));
  const project = String(get(c.project) || '').trim();
  const customer = String(get(c.customer) || '').trim();

  return {
    id: item.id,
    webUrl: item.webUrl || '',
    fields: f,                          // raw SharePoint values, for tracing a row
    rawDate: String(get(c.date) || ''),
    date: localDay(get(c.date)),
    personName: person.name,
    personEmail: person.email,
    personKey: person.email || person.name,
    project,
    customer,
    // Customers can share project names ("Phase 1"), so mappings key on both.
    projectKey: customer ? `${customer}::${project}` : project,
    projectLabel: customer && project ? `${customer} · ${project}` : (project || customer),
    activity: String(get(c.activity) || get(c.slaActivity) || '').trim(),
    type: String(get(c.type) || '').trim(),
    status: statusClass(get(c.status)),
    rawStatus: String(get(c.status) || ''),
    description: String(get(c.description) || ''),
    hours,
    onSite: split ? onSite : 0,
    offSite: split ? offSite : 0,
  };
}

// Read every timesheet entry dated within [from, to] (inclusive, YYYY-MM-DD).
// Tries a server-side date filter first; a non-indexed column on a big list
// can refuse it, so we fall back to reading everything and filtering here.
export async function fetchEntries(config, { from, to }, onProgress, { people } = {}) {
  const { siteId, listId, columns = {} } = config;
  const base = `/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=999`;
  const byDate = dateClause(config, from, to);
  const byPerson = await personClause(config, people);
  const clauses = [byDate, byPerson].filter(Boolean);
  let items = null;
  let mode = 'full read';
  if (clauses.length) {
    try {
      items = await fetchAllPages(`${base}&$filter=${encodeURIComponent(clauses.join(' and '))}`, NON_INDEXED, { onProgress });
      mode = byPerson ? (byDate ? 'person + date filter' : 'person filter') : 'date filter';
    } catch {
      // Refused (big list, column not indexed). A person-scoped read retries
      // as a plain period read; otherwise read everything.
      if (byPerson) return fetchEntries(config, { from, to }, onProgress);
      items = null;
    }
  }
  // An accepted date filter that matches nothing may be one SharePoint
  // evaluates differently (time zones, formats). Spot-check one unfiltered
  // page: if it holds rows in the period, the filter can't be trusted.
  // (Person-scoped reads skip this — the caller falls back on its own.)
  if (items && items.length === 0 && byDate && !byPerson) {
    const page = await fetchAllPages(base, undefined, { maxRows: 1 });
    const inRange = page.some((it) => { const d = localDay(it.fields?.[columns.date]); return d && d >= from && d <= to; });
    if (inRange) { items = null; mode = 'full read'; }
  }
  if (!items) items = await fetchAllPages(base, undefined, { onProgress });
  const resolvers = await buildResolvers(config);
  const out = items
    .map((it) => normalize(it, config, resolvers))
    .filter((e) => e.date && e.date >= from && e.date <= to);
  out.read = items.length; // rows SharePoint returned, before the local date check
  out.mode = mode;
  out.personScoped = !!byPerson && mode.startsWith('person');
  return out;
}

// Setup "Test connection": read the whole list unfiltered and report what the
// app sees — row count, date span, and the latest rows as raw → parsed values.
// Reads at most DIAG_ROWS rows so it stays quick on big lists, and checks the
// server-side date filter the real screens rely on (last 30 days).
const DIAG_ROWS = 2000;
export async function diagnose(config, onProgress) {
  const { siteId, listId, columns = {} } = config;
  const to = toDay(new Date());
  const from = shiftDay(to, -30);
  const dateFilter = { from, to, ok: false, count: 0, error: null, skipped: false };
  let items = null;
  if (columns.date && config.meta?.[columns.date]?.kind === 'date') {
    try {
      items = await fetchAllPages(dateFilterPath(config, from, to), NON_INDEXED, { onProgress, maxRows: DIAG_ROWS });
      dateFilter.ok = true;
      dateFilter.count = items.length;
    } catch (err) {
      dateFilter.error = err.message;
      items = null;
    }
  } else {
    dateFilter.skipped = true;
  }
  // No recent rows via the filter → sample the list unfiltered instead.
  const sampled = !items || items.length === 0;
  if (sampled) items = await fetchAllPages(`/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=999`, undefined, { onProgress, maxRows: DIAG_ROWS });
  const resolvers = await buildResolvers(config);
  const parsed = items.map((it) => ({ it, e: normalize(it, config, resolvers) }));
  const dates = parsed.map((p) => p.e.date).filter(Boolean).sort();
  const latest = parsed
    .sort((a, b) => String(b.it.createdDateTime).localeCompare(String(a.it.createdDateTime)))
    .slice(0, 8)
    .map(({ it, e }) => ({
      e,
      raw: Object.fromEntries(Object.entries(columns).filter(([, col]) => col && col !== AUTHOR).map(([k, col]) => {
        const f = it.fields || {};
        const v = f[col] ?? f[`${col}LookupId`];
        return [k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')];
      })),
    }));
  return {
    total: items.length,
    sampled,
    capped: items.length >= DIAG_ROWS,
    dateFilter,
    noDate: parsed.filter((p) => !p.e.date).length,
    from: dates[0] || null,
    to: dates[dates.length - 1] || null,
    latest,
    entries: parsed.map((p) => p.e),
  };
}

// ── Matching to Maison Flow ──────────────────────────────────────────────
const norm = (s) => String(s || '').trim().toLowerCase();
export const activityKey = (project, activity) => `${project}::${activity}`;

// Attach resourceId / projectId / taskId to each entry using the admin's
// explicit mappings first, then exact (case-insensitive) name matches.
export function enrichEntries(entries, config, data) {
  const { projectMap = {}, activityMap = {}, peopleMap = {} } = config || {};
  const resByEmail = new Map(data.Resource.filter((r) => r.email).map((r) => [norm(r.email), r.resourceId]));
  const local = (s) => norm(s).split('@')[0];
  const localCount = new Map();
  data.Resource.forEach((r) => { if (r.email) localCount.set(local(r.email), (localCount.get(local(r.email)) || 0) + 1); });
  const resByLocal = new Map(data.Resource.filter((r) => r.email && localCount.get(local(r.email)) === 1).map((r) => [local(r.email), r.resourceId]));
  const resByName = new Map(data.Resource.filter((r) => r.fullName).map((r) => [norm(r.fullName), r.resourceId]));
  const projByName = new Map(data.Project.map((p) => [norm(p.name || p.projectName), p.projectId]));
  const taskByTitle = new Map(data.ProjectTask.map((t) => [`${t.projectId}::${norm(t.Title)}`, t.taskId]));

  return entries.map((e) => {
    const resourceId = peopleMap[e.personKey] || resByEmail.get(norm(e.personEmail)) || resByName.get(norm(e.personName))
      || (e.personEmail ? resByLocal.get(local(e.personEmail)) : null) || null;
    // Customer-qualified key first; plain project name for mappings saved
    // before customers were taken into account.
    const mapped = projectMap[e.projectKey] ?? projectMap[e.project];
    const ignored = mapped === IGNORE;
    const projectId = ignored ? null : (mapped || projByName.get(norm(e.project)) || null);
    const taskId = projectId
      ? (activityMap[activityKey(e.projectKey, e.activity)] || activityMap[activityKey(e.project, e.activity)] || taskByTitle.get(`${projectId}::${norm(e.activity)}`) || null)
      : null;
    return { ...e, resourceId, projectId, taskId, ignored };
  });
}

// ── Efficiency math ──────────────────────────────────────────────────────
export function workingDays(from, to, workWeek = WORK_WEEKS['Mon-Fri']) {
  if (!from || !to || from > to) return 0;
  let n = 0;
  const d = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (d <= end) {
    if (workWeek.includes(d.getDay())) n += 1;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

// Hours a resource is planned to spend on an assignment within [from, to].
export function plannedHours(a, from, to, dailyHours, workWeek) {
  const s = a.startDate ? String(a.startDate).slice(0, 10) : from;
  const e = a.endDate ? String(a.endDate).slice(0, 10) : to;
  const lo = s > from ? s : from;
  const hi = e < to ? e : to;
  return workingDays(lo, hi, workWeek) * dailyHours * (Number(a.allocationPercent || 0) / 100);
}

// Daily capacity for a resource: weeklyCapacityHours spread over the work
// week, else the configured default.
export function dailyCapacity(resource, config) {
  const week = WORK_WEEKS[config?.workWeek] || WORK_WEEKS['Mon-Fri'];
  const weekly = Number(resource?.weeklyCapacityHours || 0);
  return weekly > 0 ? weekly / week.length : Number(config?.dailyHours || 8);
}

// Per-resource efficiency over [from, to] from enriched (counted) entries.
//   logged      – all hours booked
//   capacity    – working days × daily capacity
//   utilization – logged ÷ capacity
//   planned     – hours implied by their project allocations
//   onPlan      – hours booked on projects they're assigned to (on that date)
//   adherence   – onPlan ÷ planned
export function resourceEfficiency({ entries, resources, assignments, from, to, config }) {
  const week = WORK_WEEKS[config?.workWeek] || WORK_WEEKS['Mon-Fri'];
  const days = workingDays(from, to, week);
  const byRes = new Map();
  const row = (rid) => {
    if (!byRes.has(rid)) {
      const res = resources.find((r) => r.resourceId === rid);
      const daily = dailyCapacity(res, config);
      const mine = assignments.filter((a) => a.resourceId === rid);
      byRes.set(rid, {
        resourceId: rid, res, logged: 0, onPlan: 0, offPlan: 0, projectHrs: 0, slaHrs: 0, onSite: 0, offSite: 0,
        capacity: days * daily,
        planned: mine.reduce((s, a) => s + plannedHours(a, from, to, daily, week), 0),
        assignments: mine,
      });
    }
    return byRes.get(rid);
  };
  for (const e of entries) {
    if (!e.resourceId) continue;
    const r = row(e.resourceId);
    r.logged += e.hours;
    r.onSite += e.onSite;
    r.offSite += e.offSite;
    if (/sla/i.test(e.type)) r.slaHrs += e.hours; else r.projectHrs += e.hours;
    const assigned = e.projectId && r.assignments.some((a) => a.projectId === e.projectId
      && (!a.startDate || String(a.startDate).slice(0, 10) <= e.date)
      && (!a.endDate || String(a.endDate).slice(0, 10) >= e.date));
    if (assigned) r.onPlan += e.hours; else r.offPlan += e.hours;
  }
  // Allocated resources who logged nothing still belong in the report.
  assignments.forEach((a) => { if (plannedHours(a, from, to, 1, week) > 0) row(a.resourceId); });
  return [...byRes.values()].map((r) => ({
    ...r,
    utilization: r.capacity ? r.logged / r.capacity : 0,
    adherence: r.planned ? r.onPlan / r.planned : null,
  }));
}
