import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, Settings, AlertTriangle, Link2 } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, CardContent, CardHeader, Button, Input, Select, Field, Skeleton, Badge, useToast } from '../components/ui/primitives.jsx';
import { Table, Dialog } from '../components/ui/Dialog.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { fmtDate } from '../components/pills.jsx';
import {
  loadConfig, saveConfig, resolveSite, listSiteLists, listColumns, guessColumns, fetchEntries,
  enrichEntries, resourceEfficiency, diagnose, plannedHours, dailyCapacity, activityKey, toDay,
  TS_FIELDS, WORK_WEEKS, AUTHOR, IGNORE,
} from '../lib/timesheet.js';

const TABS = ['Efficiency', 'Projects', 'Tasks', 'Entries'];
const h = (n) => `${Math.round((n || 0) * 10) / 10}`;
const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);
const isConfigured = (c) => !!(c?.siteId && c?.listId && c?.columns?.date && c?.columns?.project && c?.columns?.person);

function monthStart() { const d = new Date(); return toDay(new Date(d.getFullYear(), d.getMonth(), 1)); }

function Meter({ value, warnBelow = 0.7, overAbove = 1.1 }) {
  if (value == null) return <span style={{ color: 'var(--muted-foreground)' }}>—</span>;
  const color = value > overAbove ? 'var(--destructive)' : value < warnBelow ? 'var(--rag-amber)' : 'var(--rag-green)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <div style={{ flex: 1, height: 7, background: 'var(--muted)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, value * 100)}%`, height: '100%', background: color }} />
      </div>
      <span style={{ fontWeight: 600, fontSize: '0.8rem', minWidth: 38, textAlign: 'right' }}>{pct(value)}</span>
    </div>
  );
}

function Tile({ label, value, color }) {
  return (
    <Card style={{ flex: '1 1 140px' }}>
      <CardContent style={{ padding: '0.9rem 1.1rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{value}</div>
      </CardContent>
    </Card>
  );
}

const Notice = ({ children }) => (
  <div style={{ marginBottom: 12, padding: '0.7rem 1rem', borderRadius: 'var(--radius)', background: 'oklch(0.82 0.16 80 / 0.18)', border: '1px solid var(--secondary)', display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}>
    <AlertTriangle size={16} style={{ flexShrink: 0 }} /> <div>{children}</div>
  </div>
);

// Timesheet analytics: reads the external SharePoint timesheet list and
// compares booked hours against capacity, project allocations and tasks.
export function Timesheets() {
  const { data } = useData();
  const { role, me } = useAuth();
  const toast = useToast();
  const isAdmin = role === 'Admin';

  const [cfg, setCfg] = useState({ loading: true, row: null, config: null, error: null });
  const [range, setRange] = useState({ from: monthStart(), to: toDay(new Date()) });
  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [entriesError, setEntriesError] = useState(null);
  const [loadRows, setLoadRows] = useState(0); // rows read so far (progress)
  const [tab, setTab] = useState('Efficiency');
  const [showSetup, setShowSetup] = useState(false);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [fRes, setFRes] = useState('');
  const [fProj, setFProj] = useState('');
  const [fCust, setFCust] = useState('');
  const [detail, setDetail] = useState(null); // resource efficiency row shown in the dialog
  const [rawEntry, setRawEntry] = useState(null); // timesheet entry traced back to its SharePoint item

  const config = cfg.config;

  useEffect(() => {
    loadConfig()
      .then(({ row, config: c }) => setCfg({ loading: false, row, config: c, error: null }))
      .catch((err) => setCfg({ loading: false, row: null, config: null, error: err.message }));
  }, []);

  const loadEntries = useCallback(async () => {
    if (!isConfigured(config)) return;
    setLoadingEntries(true);
    setEntriesError(null);
    try {
      setLoadRows(0);
      setEntries(await fetchEntries(config, range, setLoadRows));
    } catch (err) {
      setEntriesError(err.message);
    } finally {
      setLoadingEntries(false);
    }
  }, [config, range]);
  useEffect(() => { loadEntries(); }, [config?.siteId, config?.listId, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  async function persist(next) {
    const row = await saveConfig(cfg.row, next);
    setCfg({ loading: false, row, config: next, error: null });
    toast('Timesheet settings saved');
  }

  // Who the user may see: Admin/Viewer everyone; leads the people on the
  // projects they lead (assignments are already scoped that way); others self.
  const visibleRes = useMemo(() => {
    if (role === 'Admin' || role === 'Viewer') return null;
    return new Set([me?.resourceId, ...data.ProjectAssignment.map((a) => a.resourceId)].filter(Boolean));
  }, [role, me, data.ProjectAssignment]);

  const enriched = useMemo(() => {
    const all = enrichEntries(entries, config, data);
    return visibleRes ? all.filter((e) => e.resourceId && visibleRes.has(e.resourceId)) : all;
  }, [entries, config, data, visibleRes]);

  const filtered = enriched
    .filter((e) => !fRes || e.resourceId === fRes)
    .filter((e) => !fProj || e.projectId === fProj)
    .filter((e) => !fCust || e.customer === fCust);
  const customers = [...new Set(enriched.map((e) => e.customer).filter(Boolean))].sort();
  const counted = filtered.filter((e) => e.status !== 'Rejected' && e.status !== 'Draft' && (!approvedOnly || e.status === 'Approved'));

  const sum = (rows, pred = () => true) => rows.filter(pred).reduce((s, e) => s + e.hours, 0);
  const unmatchedHours = sum(counted, (e) => !e.ignored && (!e.resourceId || !e.projectId));

  const resName = (id) => data.Resource.find((r) => r.resourceId === id)?.fullName || '—';
  const projName = (id) => { const p = data.Project.find((x) => x.projectId === id); return p?.name || p?.projectName || '—'; };
  const taskName = (id) => data.ProjectTask.find((t) => t.taskId === id)?.Title || '—';

  const assignments = data.ProjectAssignment
    .filter((a) => !visibleRes || visibleRes.has(a.resourceId))
    .filter((a) => !fRes || a.resourceId === fRes)
    .filter((a) => !fProj || a.projectId === fProj);

  const efficiency = isConfigured(config)
    ? resourceEfficiency({ entries: counted, resources: data.Resource, assignments, from: range.from, to: range.to, config })
      .map((r) => ({ ...r, id: r.resourceId }))
      .sort((a, b) => b.logged - a.logged)
    : [];

  // ── Render ───────────────────────────────────────────────────────────────
  if (cfg.loading) return <div><PageHeader title="Timesheets" /><Card><CardContent><Skeleton height={160} /></CardContent></Card></div>;

  if (cfg.error) {
    return (
      <div>
        <PageHeader title="Timesheets" />
        <Notice>
          Couldn't read timesheet settings (the <strong>AppSetting</strong> list is probably missing).
          {isAdmin ? ' Click "Provision lists" in the top bar, or create a list named AppSetting with text columns settingId, settingKey and a multi-line column value.' : ' Ask an admin to finish the timesheet setup.'}
          <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: 4 }}>{cfg.error}</div>
        </Notice>
      </div>
    );
  }

  const setup = isAdmin && (
    <TimesheetSetup
      config={config} entries={entries} data={data} onSave={persist}
      open={showSetup || !isConfigured(config)} onClose={() => setShowSetup(false)}
    />
  );

  if (!isConfigured(config)) {
    return (
      <div>
        <PageHeader title="Timesheets" />
        {isAdmin ? setup : <Notice>The timesheet connection hasn't been set up yet. Ask an admin to configure it.</Notice>}
      </div>
    );
  }

  const ratio = (a, b) => (b ? a / b : null);

  return (
    <div>
      <PageHeader title="Timesheets">
        <Button variant="outline" size="sm" onClick={loadEntries} disabled={loadingEntries}>
          <RefreshCw size={14} /> {loadingEntries ? 'Loading…' : 'Reload'}
        </Button>
        {isAdmin && <Button variant="outline" size="sm" onClick={() => setShowSetup(true)}><Settings size={14} /> Setup</Button>}
      </PageHeader>

      {/* Filters on their own wrapping toolbar so they never push the page sideways. */}
      <Card style={{ marginBottom: 12 }}>
        <CardContent style={{ padding: '0.85rem 1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, alignItems: 'end' }}>
            <Field label="From">
              <Input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} />
            </Field>
            <Field label="To">
              <Input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} />
            </Field>
            <Field label="Resource">
              <Select value={fRes} onChange={(e) => setFRes(e.target.value)}>
                <option value="">All resources</option>
                {data.Resource.filter((r) => !visibleRes || visibleRes.has(r.resourceId))
                  .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''))
                  .map((r) => <option key={r.resourceId} value={r.resourceId}>{r.fullName}</option>)}
              </Select>
            </Field>
            {customers.length > 0 && (
              <Field label="Customer">
                <Select value={fCust} onChange={(e) => setFCust(e.target.value)}>
                  <option value="">All customers</option>
                  {customers.map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Project">
              <Select value={fProj} onChange={(e) => setFProj(e.target.value)}>
                <option value="">All projects</option>
                {data.Project.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                  .map((p) => <option key={p.projectId} value={p.projectId}>{p.name || p.projectName}</option>)}
              </Select>
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', marginBottom: '0.75rem', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={approvedOnly} onChange={(e) => setApprovedOnly(e.target.checked)} /> Approved only
            </label>
          </div>
          {!loadingEntries && !entriesError && (
            <div style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)' }}>
              {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} read from {config.listName || 'the timesheet list'} for this period
              {enriched.length !== entries.length && ` · ${enriched.length} linked to people you can see`}.
              {entries.mode === 'full read' ? (
                <span style={{ color: 'var(--rag-amber)', fontWeight: 600 }}>
                  {' '}SharePoint returned the whole list ({entries.read} rows) because it refused the date filter — index the Date column in the timesheet list to read only this period.
                </span>
              ) : entries.mode ? <span> Read by {entries.mode} ({entries.read} rows).</span> : null}
            </div>
          )}
        </CardContent>
      </Card>

      {entriesError && <Notice>Couldn't read the timesheet list: {entriesError}</Notice>}
      {isAdmin && unmatchedHours > 0 && (
        <Notice>
          {h(unmatchedHours)} h can't be linked to a Maison Flow resource or project, so they're left out of plan adherence.
          {' '}<button onClick={() => setShowSetup(true)} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', padding: 0 }}>Map them in Setup</button>.
        </Notice>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Tile label="Total hours" value={h(sum(filtered, (e) => e.status !== 'Draft'))} />
        <Tile label="Approved" value={h(sum(filtered, (e) => e.status === 'Approved'))} color="var(--rag-green)" />
        <Tile label="Submitted" value={h(sum(filtered, (e) => e.status === 'Submitted'))} color="var(--accent)" />
        <Tile label="Rejected" value={h(sum(filtered, (e) => e.status === 'Rejected'))} color="var(--destructive)" />
        <Tile label="Utilization" value={pct(ratio(efficiency.reduce((s, r) => s + r.logged, 0), efficiency.reduce((s, r) => s + r.capacity, 0)))} />
        <Tile label="Plan adherence" value={pct(ratio(efficiency.reduce((s, r) => s + r.onPlan, 0), efficiency.reduce((s, r) => s + r.planned, 0)))} />
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16, overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '0.6rem 0.9rem', background: 'transparent', border: 'none', borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
            color: tab === t ? 'var(--primary)' : 'var(--muted-foreground)', fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap', cursor: 'pointer',
          }}>{t}</button>
        ))}
      </div>

      {loadingEntries ? (
        <Card><CardContent>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', marginBottom: 8 }}>Reading timesheet… {loadRows} rows</div>
          <Skeleton height={200} />
        </CardContent></Card>
      ) : (
        <Card><CardContent style={{ paddingTop: '1rem' }}>
          {tab === 'Efficiency' && (
            <>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', margin: '0 0 0.75rem' }}>
                <strong>Utilization</strong> = logged ÷ capacity (working days × daily hours).
                {' '}<strong>Plan adherence</strong> = hours logged on assigned projects ÷ hours planned by allocation %. Click a row for the project/task breakdown.
              </p>
              <Table
                empty="No timesheet hours or allocations in this period."
                onRowClick={setDetail}
                rows={efficiency}
                columns={[
                  { key: 'res', label: 'Resource', sortValue: (r) => r.res?.fullName, render: (r) => r.res?.fullName || r.resourceId },
                  { key: 'capacity', label: 'Capacity', render: (r) => `${h(r.capacity)} h` },
                  { key: 'logged', label: 'Logged', render: (r) => `${h(r.logged)} h` },
                  { key: 'utilization', label: 'Utilization', render: (r) => <Meter value={r.utilization} /> },
                  { key: 'planned', label: 'Planned', render: (r) => `${h(r.planned)} h` },
                  { key: 'onPlan', label: 'On plan', render: (r) => `${h(r.onPlan)} h` },
                  { key: 'adherence', label: 'Adherence', sortValue: (r) => r.adherence ?? -1, render: (r) => <Meter value={r.adherence} warnBelow={0.8} overAbove={1.2} /> },
                  { key: 'slaHrs', label: 'SLA', render: (r) => `${h(r.slaHrs)} h` },
                ]}
              />
            </>
          )}

          {tab === 'Projects' && <ProjectsView counted={counted} assignments={assignments} range={range} config={config} resName={resName} projName={projName} data={data} />}
          {tab === 'Tasks' && <TasksView counted={counted} resName={resName} projName={projName} taskName={taskName} data={data} />}

          {tab === 'Entries' && (
            <Table
              empty="No timesheet entries in this period."
              rows={filtered}
              onRowClick={setRawEntry}
              columns={[
                { key: 'id', label: 'ID', sortValue: (e) => Number(e.id), render: (e) => <span style={{ color: 'var(--muted-foreground)' }}>#{e.id}</span> },
                { key: 'date', label: 'Date', render: (e) => fmtDate(e.date) },
                { key: 'personName', label: 'Employee', render: (e) => (e.resourceId ? resName(e.resourceId) : <span style={{ color: 'var(--rag-amber)' }}>{e.personName || e.personEmail} (unmapped)</span>) },
                { key: 'projectLabel', label: 'Customer · project', render: (e) => (
                  <span>{e.projectLabel}{e.projectId ? <span style={{ color: 'var(--muted-foreground)' }}> → {projName(e.projectId)}</span> : e.ignored ? <span style={{ color: 'var(--muted-foreground)' }}> (ignored)</span> : null}</span>
                ) },
                { key: 'activity', label: 'Activity', render: (e) => <span>{e.activity || '—'}{e.taskId && <span style={{ color: 'var(--muted-foreground)' }}> → {taskName(e.taskId)}</span>}</span> },
                { key: 'type', label: 'Type' },
                { key: 'hours', label: 'Hours', render: (e) => (e.onSite || e.offSite ? `${h(e.hours)} (${h(e.onSite)} on / ${h(e.offSite)} off)` : h(e.hours)) },
                { key: 'status', label: 'Status', render: (e) => <Badge color={{ Approved: 'var(--rag-green)', Rejected: 'var(--destructive)', Submitted: 'var(--accent)' }[e.status]}>{e.rawStatus || e.status}</Badge> },
              ]}
            />
          )}
        </CardContent></Card>
      )}

      {setup}

      <Dialog open={!!rawEntry} onClose={() => setRawEntry(null)} title={`SharePoint item #${rawEntry?.id || ''}`} width={680}>
        {rawEntry && <RawEntry entry={rawEntry} config={config} />}
      </Dialog>

      <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail?.res?.fullName || 'Breakdown'} width={720}>
        {detail && <ResourceBreakdown row={detail} counted={counted} range={range} config={config} projName={projName} taskName={taskName} />}
      </Dialog>
    </div>
  );
}

// Every raw column of one timesheet item, with the columns Maison Flow reads
// labelled — makes a wrong column mapping or a date shift obvious.
function RawEntry({ entry, config }) {
  const roles = {};
  Object.entries(config?.columns || {}).forEach(([k, col]) => {
    if (!col) return;
    const label = TS_FIELDS.find((f) => f.key === k)?.label || k;
    roles[col] = roles[col] ? `${roles[col]}, ${label}` : label;
  });
  const skip = /^(@odata|_|ContentType|Attachments|Edit|LinkTitle|DocIcon|ItemChildCount|FolderChildCount|AppAuthor|AppEditor|_UIVersion|ComplianceAssetId)/;
  const rows = Object.entries(entry.fields || {}).filter(([k]) => !skip.test(k))
    .sort(([a], [b]) => (roles[b] ? 1 : 0) - (roles[a] ? 1 : 0) || a.localeCompare(b));
  return (
    <div style={{ fontSize: '0.85rem' }}>
      <div style={{ marginBottom: 10 }}>
        Date stored as <code>{entry.rawDate || '(empty)'}</code> → read as <strong>{fmtDate(entry.date)}</strong>.
        {entry.webUrl && <> {' '}<a href={entry.webUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>Open in SharePoint ↗</a></>}
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} style={{ borderBottom: '1px solid var(--border)', background: roles[k] ? 'oklch(0.72 0.15 150 / 0.08)' : undefined }}>
              <td style={{ padding: '0.35rem 0.5rem', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{k}</td>
              <td style={{ padding: '0.35rem 0.5rem', wordBreak: 'break-word' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--primary)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{roles[k] ? `used as ${roles[k]}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Per resource: planned vs actual per project, and hours per task/activity.
function ResourceBreakdown({ row, counted, range, config, projName, taskName }) {
  const mine = counted.filter((e) => e.resourceId === row.resourceId);
  const daily = dailyCapacity(row.res, config);
  const week = WORK_WEEKS[config?.workWeek] || WORK_WEEKS['Mon-Fri'];
  const projects = new Map();
  const key = (e) => e.projectId || `ts:${e.projectKey}`;
  row.assignments.forEach((a) => {
    const p = projects.get(a.projectId) || { label: projName(a.projectId), planned: 0, actual: 0, alloc: 0, items: new Map() };
    p.planned += plannedHours(a, range.from, range.to, daily, week);
    p.alloc = Math.max(p.alloc, Number(a.allocationPercent || 0));
    p.windows = [...(p.windows || []), a];
    projects.set(a.projectId, p);
  });
  mine.forEach((e) => {
    const k = key(e);
    const p = projects.get(k) || { label: e.projectId ? projName(e.projectId) : `${e.projectLabel} (not in Maison Flow)`, planned: 0, actual: 0, alloc: 0, items: new Map() };
    p.actual += e.hours;
    const label = e.taskId ? taskName(e.taskId) : (e.activity || '(no activity)');
    p.items.set(label, (p.items.get(label) || 0) + e.hours);
    projects.set(k, p);
  });
  const rows = [...projects.values()].sort((a, b) => b.actual - a.actual);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
        {fmtDate(range.from)} – {fmtDate(range.to)} · logged {h(row.logged)} h of {h(row.capacity)} h capacity · {h(row.onSite)} h on-site / {h(row.offSite)} h off-site
      </div>
      {rows.map((p, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong>{p.label}</strong>
            {(p.windows || []).map((a, j) => (
              <Badge key={j}>{a.allocationPercent || 0}% · {a.startDate ? fmtDate(a.startDate) : 'open'} – {a.endDate ? fmtDate(a.endDate) : 'open'}</Badge>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: '0.85rem' }}>
              {h(p.actual)} h actual / {h(p.planned)} h planned
            </span>
          </div>
          {p.windows?.length > 0 && p.planned === 0 && (
            <div style={{ fontSize: '0.78rem', color: 'var(--rag-amber)', marginTop: 4 }}>
              The assignment dates don't overlap {fmtDate(range.from)} – {fmtDate(range.to)}, so nothing is planned for this period and these hours count as off plan.
            </div>
          )}
          {!p.windows?.length && p.actual > 0 && (
            <div style={{ fontSize: '0.78rem', color: 'var(--rag-amber)', marginTop: 4 }}>No assignment on this project — hours count as off plan.</div>
          )}
          {p.items.size > 0 && (
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
              {[...p.items.entries()].sort((a, b) => b[1] - a[1]).map(([label, hrs]) => (
                <li key={label}>{label} — {h(hrs)} h</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

// Planned (allocation) vs actual (timesheet) per project × resource.
function ProjectsView({ counted, assignments, range, config, resName, projName, data }) {
  const week = WORK_WEEKS[config?.workWeek] || WORK_WEEKS['Mon-Fri'];
  const rows = new Map();
  const get = (pid, rid) => {
    const k = `${pid}|${rid}`;
    if (!rows.has(k)) rows.set(k, { id: k, projectId: pid, resourceId: rid, alloc: 0, planned: 0, actual: 0 });
    return rows.get(k);
  };
  assignments.forEach((a) => {
    const res = data.Resource.find((r) => r.resourceId === a.resourceId);
    const p = plannedHours(a, range.from, range.to, dailyCapacity(res, config), week);
    if (p <= 0) return;
    const r = get(a.projectId, a.resourceId);
    r.planned += p;
    r.alloc += Number(a.allocationPercent || 0);
  });
  counted.filter((e) => e.projectId && e.resourceId).forEach((e) => { get(e.projectId, e.resourceId).actual += e.hours; });
  const list = [...rows.values()].map((r) => ({ ...r, variance: r.actual - r.planned }));
  return (
    <Table
      empty="No project allocations or mapped timesheet hours in this period."
      rows={list}
      columns={[
        { key: 'projectId', label: 'Project', sortValue: (r) => projName(r.projectId), render: (r) => projName(r.projectId) },
        { key: 'resourceId', label: 'Resource', sortValue: (r) => resName(r.resourceId), render: (r) => resName(r.resourceId) },
        { key: 'alloc', label: 'Allocation', render: (r) => (r.alloc ? `${r.alloc}%` : <Badge color="var(--rag-amber)">not assigned</Badge>) },
        { key: 'planned', label: 'Planned', render: (r) => `${h(r.planned)} h` },
        { key: 'actual', label: 'Actual', render: (r) => `${h(r.actual)} h` },
        { key: 'variance', label: 'Variance', render: (r) => (
          <span style={{ fontWeight: 600, color: r.variance > 0.5 ? 'var(--destructive)' : r.variance < -0.5 ? 'var(--rag-amber)' : 'var(--rag-green)' }}>
            {r.variance > 0 ? '+' : ''}{h(r.variance)} h
          </span>
        ) },
      ]}
    />
  );
}

// Hours per task (mapped activities) and per unmapped activity, vs estimate.
function TasksView({ counted, resName, projName, taskName, data }) {
  const groups = new Map();
  counted.filter((e) => e.projectId).forEach((e) => {
    const k = e.taskId ? `t:${e.taskId}` : `a:${e.projectId}:${e.activity}`;
    if (!groups.has(k)) groups.set(k, { id: k, projectId: e.projectId, taskId: e.taskId, activity: e.activity, hours: 0, people: new Map() });
    const g = groups.get(k);
    g.hours += e.hours;
    if (e.resourceId) g.people.set(e.resourceId, (g.people.get(e.resourceId) || 0) + e.hours);
  });
  const rows = [...groups.values()].map((g) => {
    const t = g.taskId ? data.ProjectTask.find((x) => x.taskId === g.taskId) : null;
    return { ...g, estimate: t ? Number(t.estimatedHours || 0) : null };
  });
  return (
    <Table
      empty="No hours on Maison Flow projects in this period."
      rows={rows}
      columns={[
        { key: 'projectId', label: 'Project', sortValue: (r) => projName(r.projectId), render: (r) => projName(r.projectId) },
        { key: 'task', label: 'Task / activity', sortValue: (r) => (r.taskId ? taskName(r.taskId) : r.activity), render: (r) => (r.taskId
          ? <span><Link2 size={12} /> {taskName(r.taskId)}</span>
          : <span style={{ color: 'var(--muted-foreground)' }}>{r.activity || '(no activity)'} <Badge>unmapped</Badge></span>) },
        { key: 'people', label: 'Who', sortable: false, render: (r) => [...r.people.entries()].sort((a, b) => b[1] - a[1]).map(([id, hrs]) => `${resName(id)} ${h(hrs)}h`).join(', ') || '—' },
        { key: 'hours', label: 'Logged', render: (r) => `${h(r.hours)} h` },
        { key: 'estimate', label: 'Estimate', sortValue: (r) => r.estimate ?? -1, render: (r) => (r.estimate ? `${h(r.estimate)} h` : '—') },
        { key: 'burn', label: 'Used', sortValue: (r) => (r.estimate ? r.hours / r.estimate : -1), render: (r) => (r.estimate ? <Meter value={r.hours / r.estimate} warnBelow={0} overAbove={1} /> : '—') },
      ]}
    />
  );
}

// ── Admin setup ──────────────────────────────────────────────────────────
// 1) connect a site + list, 2) map columns, 3) map timesheet projects,
// activities and people onto Maison Flow projects, tasks and resources.
function TimesheetSetup({ config, entries, data, onSave, open, onClose }) {
  const toast = useToast();
  const [siteUrl, setSiteUrl] = useState(config?.siteUrl || '');
  const [site, setSite] = useState(config?.siteId ? { id: config.siteId } : null);
  const [lists, setLists] = useState([]);
  const [listId, setListId] = useState(config?.listId || '');
  const [cols, setCols] = useState([]);
  const [columns, setColumns] = useState(config?.columns || {});
  const [dailyHours, setDailyHours] = useState(config?.dailyHours || 8);
  const [workWeek, setWorkWeek] = useState(config?.workWeek || 'Mon-Fri');
  const [projectMap, setProjectMap] = useState(config?.projectMap || {});
  const [activityMap, setActivityMap] = useState(config?.activityMap || {});
  const [peopleMap, setPeopleMap] = useState(config?.peopleMap || {});
  const [busy, setBusy] = useState(false);
  const [diag, setDiag] = useState(null);
  const [setupTab, setSetupTab] = useState(config?.listId ? 'Projects' : 'Connection');

  // Read the list unfiltered with the mapping as currently chosen on screen
  // (saved or not) and show what comes back — the first stop when data is missing.
  async function test() {
    const used = new Set(Object.values(columns).filter(Boolean));
    const meta = cols.length
      ? Object.fromEntries(cols.filter((c) => used.has(c.name)).map((c) => [c.name, { kind: c.kind, lookupListId: c.lookupListId, lookupColumn: c.lookupColumn }]))
      : config?.meta || {};
    setDiag({ loading: true });
    try {
      const d = await diagnose({ siteId: site.id, listId, columns, meta }, (rows) => setDiag({ loading: true, rows }));
      const enriched = enrichEntries(d.entries, { projectMap, activityMap, peopleMap }, data);
      setDiag({
        ...d,
        matchedPeople: enriched.filter((e) => e.resourceId).length,
        matchedProjects: enriched.filter((e) => e.projectId).length,
        latest: d.latest.map((r) => ({ ...r, match: enriched.find((e) => e.id === r.e.id) })),
      });
    } catch (err) {
      setDiag({ error: err.message });
    }
  }

  // Re-open with an existing connection → reload its lists/columns for editing.
  useEffect(() => {
    if (!open || !config?.siteId) return;
    listSiteLists(config.siteId).then(setLists).catch(() => {});
    if (config.listId) listColumns(config.siteId, config.listId).then(setCols).catch(() => {});
  }, [open, config?.siteId, config?.listId]);

  async function connect() {
    setBusy(true);
    try {
      const s = await resolveSite(siteUrl);
      setSite(s);
      setLists(await listSiteLists(s.id));
      toast(`Connected to ${s.displayName || s.name}`);
    } catch (err) {
      toast(`Couldn't open site: ${err.message}`, 'error');
    } finally { setBusy(false); }
  }

  async function pickList(id) {
    setListId(id);
    setCols([]);
    if (!id) return;
    try {
      const c = await listColumns(site.id, id);
      setCols(c);
      if (id !== config?.listId) setColumns(guessColumns(c));
      setSetupTab('Columns');
    } catch (err) {
      toast(`Couldn't read columns: ${err.message}`, 'error');
    }
  }

  async function save() {
    const missing = TS_FIELDS.filter((f) => f.required && !columns[f.key]);
    if (missing.length) { toast(`Map the required columns: ${missing.map((f) => f.label).join(', ')}`, 'error'); return; }
    const used = new Set(Object.values(columns).filter(Boolean));
    const meta = Object.fromEntries(cols.filter((c) => used.has(c.name)).map((c) => [c.name, { kind: c.kind, lookupListId: c.lookupListId, lookupColumn: c.lookupColumn }]));
    const list = lists.find((l) => l.id === listId);
    setBusy(true);
    try {
      await onSave({
        ...config,
        siteUrl, siteId: site.id, listId, listName: list?.displayName || config?.listName,
        columns, meta: cols.length ? meta : config?.meta || {},
        dailyHours: Number(dailyHours) || 8, workWeek, projectMap, activityMap, peopleMap,
      });
      onClose();
    } catch (err) {
      toast(`Couldn't save: ${err.message}`, 'error');
    } finally { setBusy(false); }
  }

  // Auto-matches (no explicit mapping) so the admin only fixes the gaps.
  const auto = useMemo(() => enrichEntries(entries, { projectMap: {}, activityMap: {}, peopleMap: {} }, data), [entries, data]);
  // Timesheet projects keyed by customer + project; label shows both.
  const projLabels = new Map(entries.filter((e) => e.projectKey).map((e) => [e.projectKey, e.projectLabel]));
  Object.keys(projectMap).forEach((k) => { if (!projLabels.has(k)) projLabels.set(k, k.replace('::', ' · ')); });
  const tsProjects = [...projLabels.keys()].sort((a, b) => projLabels.get(a).localeCompare(projLabels.get(b)));
  const autoProject = (key) => auto.find((e) => e.projectKey === key)?.projectId;
  const effectiveProject = (key) => (projectMap[key] === IGNORE ? null : projectMap[key] || autoProject(key));
  const tsActivities = [...new Map(entries.filter((e) => e.activity && effectiveProject(e.projectKey))
    .map((e) => [activityKey(e.projectKey, e.activity), e])).values()]
    .sort((a, b) => a.projectLabel.localeCompare(b.projectLabel) || a.activity.localeCompare(b.activity));
  const people = [...new Map(entries.map((e) => [e.personKey, e])).values()].filter((e) => e.personKey)
    .sort((a, b) => (a.personName || a.personKey).localeCompare(b.personName || b.personKey));
  const autoPerson = (key) => auto.find((e) => e.personKey === key)?.resourceId;

  const sectionTitle = (t, sub) => (
    <div style={{ margin: '0.6rem 0 0.5rem' }}>
      <strong>{t}</strong>
      {sub && <div style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)' }}>{sub}</div>}
    </div>
  );
  const mapRow = (label, value, onChange, options, autoLabel) => (
    <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: '0.85rem' }}>{label}</div>
      <Select value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{autoLabel ? `Auto: ${autoLabel}` : '— not mapped —'}</option>
        {options}
      </Select>
    </div>
  );

  // Setup tabs, unlocked step by step: a list must be picked before columns,
  // and saved before the project/activity/people mappings make sense.
  const unmappedProjects = tsProjects.filter((k) => !projectMap[k] && !autoProject(k)).length;
  const unmappedPeople = people.filter((e) => !peopleMap[e.personKey] && !autoPerson(e.personKey)).length;
  const SETUP_TABS = [
    { key: 'Connection', label: 'Connection' },
    { key: 'Columns', label: 'Columns' },
    { key: 'Test', label: 'Test' },
    { key: 'Projects', label: 'Projects', count: unmappedProjects },
    { key: 'Activities', label: 'Activities' },
    { key: 'People', label: 'People', count: unmappedPeople },
  ];

  const body = (
    <div>
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 12, overflowX: 'auto' }}>
        {SETUP_TABS.map((t) => (
          <button key={t.key} onClick={() => setSetupTab(t.key)} style={{
            padding: '0.5rem 0.8rem', background: 'transparent', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
            borderBottom: setupTab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
            color: setupTab === t.key ? 'var(--primary)' : 'var(--muted-foreground)', fontWeight: 600, fontSize: '0.85rem',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            {t.label}
            {t.count > 0 && <span style={{ background: 'var(--rag-amber)', color: '#fff', borderRadius: 999, fontSize: '0.68rem', padding: '0 0.4rem' }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {setupTab === 'Connection' && (
        <>
      <div style={{ display: 'flex', gap: 8 }}>
        <Input placeholder="https://maisonglobal.sharepoint.com/sites/Timesheet" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
        <Button variant="outline" onClick={connect} disabled={busy || !siteUrl}>Connect</Button>
      </div>
      {lists.length > 0 && (
        <Field label="Timesheet list" required>
          <Select value={listId} onChange={(e) => pickList(e.target.value)}>
            <option value="">— choose list —</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.displayName}</option>)}
          </Select>
        </Field>
      )}

        </>
      )}

      {setupTab === 'Columns' && (cols.length > 0 ? (
        <>
          {sectionTitle('Columns', 'Which column holds each piece of the timesheet. Guessed from the column names — check them.')}
          <Button variant="ghost" size="sm" style={{ marginBottom: 6 }} onClick={() => setColumns(guessColumns(cols))}>Auto-detect columns</Button>
          {TS_FIELDS.map((f) => (
            <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center', padding: '0.25rem 0' }}>
              <div style={{ fontSize: '0.85rem' }}>{f.label}{f.required && <span style={{ color: 'var(--destructive)' }}> *</span>}</div>
              <Select value={columns[f.key] || ''} onChange={(e) => setColumns((c) => ({ ...c, [f.key]: e.target.value }))}>
                <option value="">— none —</option>
                {f.key === 'person' && <option value={AUTHOR}>Created by (who submitted the entry)</option>}
                {cols.map((c) => <option key={c.name} value={c.name}>{c.displayName}{c.displayName !== c.name ? ` (${c.name})` : ''} · {c.kind}</option>)}
              </Select>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            <Field label="Default hours per working day">
              <Input type="number" min="1" max="24" step="0.5" value={dailyHours} onChange={(e) => setDailyHours(e.target.value)} />
            </Field>
            <Field label="Work week">
              <Select value={workWeek} onChange={(e) => setWorkWeek(e.target.value)}>
                {Object.keys(WORK_WEEKS).map((k) => <option key={k}>{k}</option>)}
              </Select>
            </Field>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: -6 }}>
            A resource's Weekly capacity (Resources screen) overrides the default when set.
          </div>
        </>
      ) : <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', padding: '1rem 0' }}>Connect to the site and pick the timesheet list first (Connection tab).</div>)}

      {setupTab === 'Test' && (site && listId ? (
        <>
          {sectionTitle('Test connection', 'Reads the whole list with the columns chosen above (no date filter) and shows what Maison Flow sees.')}
          <Button variant="outline" size="sm" onClick={test} disabled={diag?.loading}>{diag?.loading ? `Reading list… ${diag.rows || 0} rows` : 'Test connection'}</Button>
          {diag?.error && <div style={{ color: 'var(--destructive)', fontSize: '0.82rem', marginTop: 8, wordBreak: 'break-word' }}>{diag.error}</div>}
          {diag && !diag.loading && !diag.error && (
            <div style={{ fontSize: '0.82rem', marginTop: 8 }}>
              <div style={{ marginBottom: 6 }}>
                Date filter (last 30 days):{' '}
                {diag.dateFilter.skipped ? <span style={{ color: 'var(--rag-amber)' }}>not used — the Date column isn't a SharePoint date column</span>
                  : diag.dateFilter.ok ? <span style={{ color: 'var(--rag-green)' }}>works · {diag.dateFilter.count} row(s)</span>
                  : <span style={{ color: 'var(--destructive)' }}>refused — {diag.dateFilter.error}</span>}
              </div>
              {(diag.dateFilter.error || diag.dateFilter.skipped) && (
                <div style={{ marginBottom: 6, color: 'var(--rag-amber)' }}>
                  Without the date filter every screen reads the whole list, which is slow on a big list. In the timesheet list go to
                  List settings → Indexed columns → Create a new index on the Date column.
                </div>
              )}
              <div>
                {diag.sampled ? 'Sampled ' : 'Last 30 days: '}<strong>{diag.total}</strong> row(s){diag.capped ? ' (stopped at the cap)' : ''} · dates {diag.from ? `${fmtDate(diag.from)} – ${fmtDate(diag.to)}` : 'none parsed'}
                {diag.noDate > 0 && <span style={{ color: 'var(--rag-amber)' }}> · {diag.noDate} row(s) with no readable date</span>}
                {' '}· people matched {diag.matchedPeople}/{diag.total} · projects linked {diag.matchedProjects}/{diag.total}
              </div>
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead><tr>{['Raw employee', '→ Employee', '→ Resource', 'Raw date', '→ Date', 'Project', 'Hours'].map((t) => (
                    <th key={t} style={{ textAlign: 'left', padding: '0.3rem 0.5rem', borderBottom: '1px solid var(--border)', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{t}</th>
                  ))}</tr></thead>
                  <tbody>{diag.latest.map(({ raw, e, match }) => (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.3rem 0.5rem' }}>{columns.person === AUTHOR ? '(created by)' : raw.person}</td>
                      <td style={{ padding: '0.3rem 0.5rem' }}>{e.personName || '—'}<div style={{ color: 'var(--muted-foreground)' }}>{e.personEmail || 'no email'}</div></td>
                      <td style={{ padding: '0.3rem 0.5rem', color: match?.resourceId ? undefined : 'var(--destructive)' }}>
                        {match?.resourceId ? data.Resource.find((r) => r.resourceId === match.resourceId)?.fullName : 'no match'}
                      </td>
                      <td style={{ padding: '0.3rem 0.5rem' }}>{raw.date}</td>
                      <td style={{ padding: '0.3rem 0.5rem', color: e.date ? undefined : 'var(--destructive)' }}>{e.date || 'unreadable'}</td>
                      <td style={{ padding: '0.3rem 0.5rem' }}>{e.projectLabel || '—'}</td>
                      <td style={{ padding: '0.3rem 0.5rem' }}>{h(e.hours)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', padding: '1rem 0' }}>Connect to the site and pick the timesheet list first (Connection tab).</div>)}

      {['Projects', 'Activities', 'People'].includes(setupTab) && !config?.listId && <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', padding: '1rem 0' }}>Save the connection and columns first — mappings use the loaded timesheet entries.</div>}
      {config?.listId && setupTab === 'Projects' && (
        <>
          {sectionTitle('Projects', `Link each timesheet project to a Maison Flow project. Shows names found in the loaded period (${entries.length} entries) — widen the date range to see more.`)}
          {tsProjects.length === 0 && <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>No entries loaded yet.</div>}
          {tsProjects.map((name) => mapRow(projLabels.get(name), projectMap[name], (v) => setProjectMap((m) => ({ ...m, [name]: v })), (
            <>
              <option value={IGNORE}>Ignore (internal / not a Maison Flow project)</option>
              {data.Project.map((p) => <option key={p.projectId} value={p.projectId}>{p.name || p.projectName}</option>)}
            </>
          ), autoProject(name) && (data.Project.find((p) => p.projectId === autoProject(name))?.name || 'matched')))}

        </>
      )}
      {config?.listId && setupTab === 'Activities' && (
        <>
          {sectionTitle('Activities → tasks', 'Optional. Link timesheet activities to Maison Flow tasks to see hours per task. Activities with the same name as a task match automatically.')}
          {tsActivities.length === 0 && <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>Map projects first.</div>}
          {tsActivities.map((e) => {
            const k = activityKey(e.projectKey, e.activity);
            const pid = effectiveProject(e.projectKey);
            const tasks = data.ProjectTask.filter((t) => t.projectId === pid);
            const autoTask = auto.find((x) => x.projectKey === e.projectKey && x.activity === e.activity)?.taskId;
            return mapRow(`${e.projectLabel} · ${e.activity}`, activityMap[k], (v) => setActivityMap((m) => ({ ...m, [k]: v })),
              tasks.map((t) => <option key={t.taskId} value={t.taskId}>{t.parentId ? '↳ ' : ''}{t.Title}</option>),
              autoTask && (tasks.find((t) => t.taskId === autoTask)?.Title || 'matched'));
          })}

        </>
      )}
      {config?.listId && setupTab === 'People' && (
        <>
          {sectionTitle('People', 'Matched by email, then by full name. Fix anyone who didn\'t match.')}
          {people.map((e) => mapRow(e.personName ? `${e.personName}${e.personEmail ? ` (${e.personEmail})` : ''}` : e.personKey, peopleMap[e.personKey],
            (v) => setPeopleMap((m) => ({ ...m, [e.personKey]: v })),
            data.Resource.slice().sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''))
              .map((r) => <option key={r.resourceId} value={r.resourceId}>{r.fullName}</option>),
            autoPerson(e.personKey) && (data.Resource.find((r) => r.resourceId === autoPerson(e.personKey))?.fullName || 'matched')))}
        </>
      )}
    </div>
  );

  const footer = (
    <>
      {config && <Button variant="outline" onClick={onClose}>Cancel</Button>}
      <Button onClick={save} disabled={busy || !site || !listId}>{busy ? 'Saving…' : 'Save'}</Button>
    </>
  );

  // First-time setup renders inline; later edits open in a dialog.
  if (!config?.listId) {
    return (
      <Card>
        <CardHeader><strong>Connect the timesheet</strong></CardHeader>
        <CardContent>
          {body}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>{footer}</div>
        </CardContent>
      </Card>
    );
  }
  return <Dialog open={open} onClose={onClose} title="Timesheet setup" width={760} footer={footer}>{body}</Dialog>;
}
