import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { Button, Badge, Skeleton } from './ui/primitives.jsx';
import { Dialog } from './ui/Dialog.jsx';
import { fmtDate } from './pills.jsx';
import { loadConfig, fetchEntries, enrichEntries, dailyCapacity, toDay, WORK_WEEKS } from '../lib/timesheet.js';

// Reads are cached per setup + person + month, so paging back to a month or
// reopening a resource is instant. Keyed by the setup too, so a changed
// column mapping re-reads.
const _monthCache = new Map(); // key → Promise<entries>
function cached(key, load) {
  if (!_monthCache.has(key)) _monthCache.set(key, load().catch((err) => { _monthCache.delete(key); throw err; }));
  return _monthCache.get(key);
}
const monthRange = (ym) => { const [y, m] = ym.split('-').map(Number); return { from: `${ym}-01`, to: toDay(new Date(y, m, 0)) }; };
const setupKey = (config) => `${config.listId}|${JSON.stringify(config.columns)}`;

// Everyone's entries for a month (fallback / diagnostics).
function getMonth(config, ym) {
  return cached(`${setupKey(config)}|*|${ym}`, () => fetchEntries(config, monthRange(ym)));
}

// The timesheet values that identify this resource: their email plus any
// names/emails an admin linked to them in Setup → People.
function personValues(config, resource) {
  const vals = [resource?.email];
  Object.entries(config.peopleMap || {}).forEach(([key, rid]) => { if (rid === resource?.resourceId) vals.push(key); });
  return vals.filter(Boolean);
}

// One person's entries for a month — SharePoint filters by person, so only
// their rows travel. If that comes back empty (e.g. the timesheet spells
// them differently) fall back to the whole month and match locally.
async function getPersonMonth(config, resource, ym) {
  const people = personValues(config, resource);
  if (people.length) {
    const own = await cached(`${setupKey(config)}|${people.join(',')}|${ym}`, () => fetchEntries(config, monthRange(ym), undefined, { people }));
    if (own.personScoped && own.length > 0) return own;
  }
  return getMonth(config, ym);
}

const h = (n) => `${Math.round((n || 0) * 10) / 10}`;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STATUS_COLOR = { Approved: 'var(--rag-green)', Rejected: 'var(--destructive)', Submitted: 'var(--accent)' };

// Month calendar of one resource's timesheet: each day shows booked hours
// (green ≥ 6 h, yellow 3–6 h, red < 3 h); clicking a day lists its entries.
export function TimesheetCalendar({ resource, open, onClose }) {
  const { data } = useData();
  const [month, setMonth] = useState(() => toDay(new Date()).slice(0, 7));
  const [selected, setSelected] = useState(toDay(new Date()));
  const [state, setState] = useState({ loading: true, error: null, config: null, entries: [] });
  const [reloadKey, setReloadKey] = useState(0);
  const [configP, setConfigP] = useState(null); // setup, read once per opening
  const reload = () => { _monthCache.clear(); setConfigP(loadConfig()); setReloadKey((k) => k + 1); };

  // Read the setup fresh each time the dialog opens (an admin may have just
  // changed it), but not again on every month change.
  useEffect(() => { if (open) setConfigP(loadConfig()); }, [open, resource?.resourceId]);

  useEffect(() => {
    if (!open || !configP) return;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    configP
      .then(async ({ config }) => {
        if (!config?.siteId || !config?.listId) throw new Error('The timesheet connection is not set up yet (Timesheets → Setup).');
        const entries = await getPersonMonth(config, resource, month);
        if (!live) return;
        setState({ loading: false, error: null, config, entries });
        // Warm the previous month — the usual next click.
        const [y, m] = month.split('-').map(Number);
        getPersonMonth(config, resource, toDay(new Date(y, m - 2, 1)).slice(0, 7)).catch(() => {});
      })
      .catch((err) => live && setState({ loading: false, error: err.message, config: null, entries: [] }));
    return () => { live = false; };
  }, [open, configP, month, reloadKey, resource]);

  // This resource's entries: linked by email (or the admin's people mapping),
  // falling back to a raw email match.
  const mine = useMemo(() => {
    if (!state.config) return [];
    const email = String(resource?.email || '').trim().toLowerCase();
    return enrichEntries(state.entries, state.config, data)
      .filter((e) => e.resourceId === resource?.resourceId
        || (email && (e.personEmail === email || e.personEmail.split('@')[0] === email.split('@')[0])));
  }, [state, data, resource]);

  const byDay = useMemo(() => {
    const m = new Map();
    mine.forEach((e) => { if (!m.has(e.date)) m.set(e.date, []); m.get(e.date).push(e); });
    return m;
  }, [mine]);

  const counts = (e) => e.status !== 'Rejected' && e.status !== 'Draft';
  const daily = dailyCapacity(resource, state.config);
  const week = WORK_WEEKS[state.config?.workWeek] || WORK_WEEKS['Mon-Fri'];

  // Calendar grid, Monday-first, padded to whole weeks.
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(y, m - 1, i + 1))];
  while (cells.length % 7) cells.push(null);

  const today = toDay(new Date());
  const monthLogged = mine.filter(counts).reduce((s, e) => s + e.hours, 0);
  const workDays = cells.filter((d) => d && week.includes(d.getDay()) && toDay(d) <= today).length;
  const missing = cells.filter((d) => d && week.includes(d.getDay()) && toDay(d) < today && !(byDay.get(toDay(d)) || []).some(counts)).length;
  const shift = (n) => { const d = new Date(y, m - 1 + n, 1); setMonth(toDay(d).slice(0, 7)); setSelected(''); };
  const dayEntries = byDay.get(selected) || [];

  return (
    <Dialog open={open} onClose={onClose} title={`Timesheet · ${resource?.fullName || ''}`} width={760}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={16} /></Button>
        <strong style={{ minWidth: 140, textAlign: 'center' }}>{first.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={16} /></Button>
        <Button variant="ghost" size="sm" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }}>Today</Button>
        <Button variant="ghost" size="sm" onClick={reload} disabled={state.loading}>Reload</Button>
        {!state.loading && !state.error && (
          <span style={{ marginLeft: 'auto', fontSize: '0.82rem', color: 'var(--muted-foreground)' }}>
            {h(monthLogged)} h logged of {h(workDays * daily)} h to date
            {missing > 0 && <span style={{ color: 'var(--rag-amber)', fontWeight: 600 }}> · {missing} day(s) not filled</span>}
          </span>
        )}
      </div>

      {state.error ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem', padding: '0.7rem 1rem', borderRadius: 'var(--radius)', background: 'oklch(0.82 0.16 80 / 0.18)', border: '1px solid var(--secondary)' }}>
          <AlertTriangle size={16} /> {state.error}
        </div>
      ) : state.loading ? (
        <Skeleton height={280} />
      ) : (
        <>
          {mine.length === 0 && (() => {
            const emails = [...new Set(state.entries.map((e) => e.personEmail || e.personName).filter(Boolean))].slice(0, 8);
            return (
              <div style={{ fontSize: '0.8rem', marginBottom: 10, padding: '0.6rem 0.8rem', borderRadius: 'var(--radius)', background: 'var(--muted)' }}>
                <div>
                  No entries for <strong>{resource?.email || 'this resource (no email on their Resource record)'}</strong> in this month.
                  {' '}SharePoint returned {state.entries.read ?? 0} row(s) ({state.entries.mode}); {state.entries.length} dated in this month.
                </div>
                {emails.length > 0 && <div style={{ marginTop: 4 }}>Employees found this month: {emails.join(', ')}</div>}
                {state.entries.read > 0 && state.entries.length === 0 && (
                  <div style={{ marginTop: 4, color: 'var(--rag-amber)' }}>Rows came back but none had a readable date in this month — check the Date column in Timesheets → Setup.</div>
                )}
                {(state.entries.read ?? 0) === 0 && (
                  <div style={{ marginTop: 4, color: 'var(--rag-amber)' }}>Nothing came back for this month — try another month, or check Timesheets → Setup → Test connection.</div>
                )}
              </div>
            );
          })()}
          <div style={{ display: 'flex', gap: 14, fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: 6 }}>
            {[['var(--rag-green)', '6 h or more'], ['var(--rag-amber)', '3 – 6 h'], ['var(--destructive)', 'under 3 h']].map(([c, t]) => (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: c }} /> {t}
              </span>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {WEEKDAYS.map((d) => <div key={d} style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted-foreground)', textAlign: 'center', padding: '0.2rem 0' }}>{d}</div>)}
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const day = toDay(d);
              const list = byDay.get(day) || [];
              const hrs = list.filter(counts).reduce((s, e) => s + e.hours, 0);
              const workday = week.includes(d.getDay());
              const past = day < today;
              // Day colour by hours booked: ≥ 6 green, 3–6 yellow, < 3 red
              // (an unbooked future day or weekend stays uncoloured).
              const color = hrs >= 6 ? 'var(--rag-green)' : hrs >= 3 ? 'var(--rag-amber)' : (hrs > 0 || (workday && past)) ? 'var(--destructive)' : null;
              const isSel = day === selected;
              return (
                <button
                  key={i} onClick={() => setSelected(day)}
                  title={`${fmtDate(day)} — ${h(hrs)} h`}
                  style={{
                    minHeight: 58, padding: '0.3rem 0.4rem', textAlign: 'left', cursor: 'pointer',
                    borderRadius: 'calc(var(--radius) - 0.3rem)', font: 'inherit', color: 'var(--foreground)',
                    border: isSel ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: workday ? 'var(--card)' : 'var(--muted)',
                    outline: day === today ? '1px dashed var(--primary)' : 'none',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>{d.getDate()}</div>
                  {(hrs > 0 || (workday && past)) && (
                    <div style={{ marginTop: 4, fontWeight: 700, fontSize: '0.85rem', color }}>{h(hrs)} h</div>
                  )}
                  {list.some((e) => e.status === 'Rejected') && <div style={{ fontSize: '0.65rem', color: 'var(--destructive)' }}>rejected</div>}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 16 }}>
            <strong style={{ fontSize: '0.9rem' }}>{selected ? fmtDate(selected) : 'Pick a date'}</strong>
            {selected && (dayEntries.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', marginTop: 6 }}>No timesheet entries.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {dayEntries.map((e) => {
                  const proj = data.Project.find((p) => p.projectId === e.projectId);
                  const task = data.ProjectTask.find((t) => t.taskId === e.taskId);
                  return (
                    <div key={e.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.55rem 0.8rem', fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {e.customer && <span style={{ color: 'var(--muted-foreground)' }}>{e.customer} ·</span>}
                        <strong>{e.project || '(no project)'}</strong>
                        {proj && <span style={{ color: 'var(--muted-foreground)' }}>→ {proj.name || proj.projectName}</span>}
                        {e.type && <Badge>{e.type}</Badge>}
                        <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{h(e.hours)} h</span>
                        <Badge color={STATUS_COLOR[e.status]}>{e.rawStatus || e.status}</Badge>
                      </div>
                      <div style={{ color: 'var(--muted-foreground)', marginTop: 2 }}>
                        {e.activity || '(no activity)'}{task && ` → ${task.Title}`}
                        {(e.onSite || e.offSite) ? ` · ${h(e.onSite)} h on-site / ${h(e.offSite)} h off-site` : ''}
                      </div>
                      {e.description && <div style={{ marginTop: 4 }}>{e.description}</div>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </Dialog>
  );
}
