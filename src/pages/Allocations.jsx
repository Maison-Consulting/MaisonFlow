import React, { useState, useMemo } from 'react';
import { Search, AlertTriangle, CalendarDays } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { Card, CardContent, Input, Select, Skeleton, Badge, Button } from '../components/ui/primitives.jsx';
import { TimesheetCalendar } from '../components/TimesheetCalendar.jsx';
import { AllocationMatrix } from '../components/AllocationMatrix.jsx';
import { Table } from '../components/ui/Dialog.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { fmtDate, isActiveOn, isExpired } from '../components/pills.jsx';

function statusOf(a) {
  if (isExpired(a.endDate)) return 'Ended';
  return isActiveOn(a.startDate, a.endDate) ? 'Active' : 'Upcoming';
}
const STATUS_COLOR = { Active: 'var(--rag-green)', Upcoming: 'var(--accent)', Ended: undefined };

// Resource-centric allocation view: every resource with the projects they're on
// and their % allocation on each, plus their total allocation live today.
export function Allocations() {
  const { data, loading } = useData();
  const [query, setQuery] = useState('');
  const [fDept, setFDept] = useState('');
  const [fRegion, setFRegion] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [calRes, setCalRes] = useState(null); // resource whose timesheet calendar is open
  const [view, setView] = useState('List'); // List (cards per resource) | Matrix (resource × project)

  const projName = (id) => { const p = data.Project.find((x) => x.projectId === id); return p?.projectName || p?.name || id; };
  const departments = [...new Set(data.Resource.map((r) => r.department).filter(Boolean))].sort();
  const regions = [...new Set(data.Resource.map((r) => r.location).filter(Boolean))].sort();

  const groups = useMemo(() => {
    const byRes = {};
    data.ProjectAssignment.forEach((a) => { (byRes[a.resourceId] = byRes[a.resourceId] || []).push(a); });
    const q = query.trim().toLowerCase();
    return data.Resource
      .filter((r) => byRes[r.resourceId]?.length)
      .filter((r) => !fDept || r.department === fDept)
      .filter((r) => !fRegion || r.location === fRegion)
      .filter((r) => !q || (r.fullName || '').toLowerCase().includes(q))
      .map((r) => {
        const all = byRes[r.resourceId].slice().sort((a, b) => new Date(a.startDate || 0) - new Date(b.startDate || 0));
        const items = fStatus ? all.filter((a) => statusOf(a) === fStatus) : all;
        const currentTotal = all
          .filter((a) => isActiveOn(a.startDate, a.endDate))
          .reduce((s, a) => s + Number(a.allocationPercent || 0), 0);
        return { res: r, items, currentTotal };
      })
      .filter((g) => g.items.length) // drop resources with no assignments matching the status filter
      .sort((a, b) => b.currentTotal - a.currentTotal);
  }, [data.Resource, data.ProjectAssignment, query, fDept, fRegion, fStatus]);

  // Same resource filters as the list, for the matrix.
  const matrixResources = data.Resource
    .filter((r) => !fDept || r.department === fDept)
    .filter((r) => !fRegion || r.location === fRegion)
    .filter((r) => !query.trim() || (r.fullName || '').toLowerCase().includes(query.trim().toLowerCase()));

  const overCount = groups.filter((g) => g.currentTotal > 100).length;

  return (
    <div>
      <PageHeader title="Resource Allocation">
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--muted-foreground)' }} />
          <Input placeholder="Search resource…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ paddingLeft: 30, width: 200 }} />
        </div>
        <Select value={fRegion} onChange={(e) => setFRegion(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All regions</option>
          {regions.map((r) => <option key={r}>{r}</option>)}
        </Select>
        <Select value={fDept} onChange={(e) => setFDept(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d}>{d}</option>)}
        </Select>
        {/* The matrix covers live work only: Active + Upcoming (no Ended). */}
        <Select value={view === 'Matrix' && fStatus === 'Ended' ? '' : fStatus} onChange={(e) => setFStatus(e.target.value)} style={{ width: 'auto' }}>
          <option value="">{view === 'Matrix' ? 'Active + Upcoming' : 'Any status'}</option>
          <option value="Active">Active</option>
          <option value="Upcoming">Upcoming</option>
          {view === 'List' && <option value="Ended">Ended</option>}
        </Select>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {['List', 'Matrix'].map((v) => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '0.45rem 0.85rem', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
              background: view === v ? 'var(--primary)' : 'transparent', color: view === v ? 'var(--primary-foreground)' : 'var(--foreground)',
            }}>{v}</button>
          ))}
        </div>
      </PageHeader>
      <p style={{ color: 'var(--muted-foreground)', margin: '-0.75rem 0 1.25rem', fontSize: '0.9rem' }}>
        Each resource's projects and % allocation. "Total" is what's live today.
      </p>

      {overCount > 0 && (
        <div style={{ marginBottom: 12, padding: '0.7rem 1rem', borderRadius: 'var(--radius)', background: 'oklch(0.82 0.16 80 / 0.18)', border: '1px solid var(--secondary)', display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}>
          <AlertTriangle size={16} /> {overCount} resource(s) over 100% allocated today.
        </div>
      )}

      {loading.ProjectAssignment || loading.Resource ? (
        <Card><CardContent><Skeleton height={160} /></CardContent></Card>
      ) : view === 'Matrix' ? (
        <Card><CardContent style={{ paddingTop: '1rem' }}>
          <AllocationMatrix
            resources={matrixResources}
            assignments={data.ProjectAssignment}
            projects={data.Project}
            statuses={fStatus && fStatus !== 'Ended' ? [fStatus] : ['Active', 'Upcoming']}
          />
        </CardContent></Card>
      ) : groups.length === 0 ? (
        <Card><CardContent><div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>No allocated resources.</div></CardContent></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map(({ res, items, currentTotal }) => {
            const over = currentTotal > 100;
            return (
              <Card key={res._spId}>
                <CardContent>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                    <strong style={{ fontSize: '1.05rem' }}>{res.fullName}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                      {[res.role, res.department].filter(Boolean).join(' · ')}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setCalRes(res)} title="Timesheet calendar">
                      <CalendarDays size={14} /> Timesheet
                    </Button>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, minWidth: 180 }}>
                      <div style={{ flex: 1, height: 8, background: 'var(--muted)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, currentTotal)}%`, height: '100%', background: over ? 'var(--destructive)' : 'var(--rag-green)' }} />
                      </div>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: over ? 'var(--destructive)' : 'var(--foreground)' }}>{currentTotal}%</span>
                      {over && <Badge color="var(--rag-amber)">over</Badge>}
                    </div>
                  </div>
                  <Table
                    empty="No assignments."
                    columns={[
                      { key: 'projectId', label: 'Project', render: (a) => projName(a.projectId) },
                      { key: 'allocationPercent', label: 'Allocation', render: (a) => `${a.allocationPercent || 0}%` },
                      { key: 'startDate', label: 'From', render: (a) => fmtDate(a.startDate) },
                      { key: 'endDate', label: 'To', render: (a) => fmtDate(a.endDate) },
                      { key: 'status', label: 'Status', sortValue: (a) => statusOf(a), render: (a) => <Badge color={STATUS_COLOR[statusOf(a)]}>{statusOf(a)}</Badge> },
                    ]}
                    rows={items}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <TimesheetCalendar resource={calRes} open={!!calRes} onClose={() => setCalRes(null)} />
    </div>
  );
}
