import React from 'react';
import { Download } from 'lucide-react';
import { Button } from './ui/primitives.jsx';
import { fmtDate, isActiveOn, isExpired } from './pills.jsx';

export function allocationStatus(a) {
  if (isExpired(a.endDate)) return 'Ended';
  return isActiveOn(a.startDate, a.endDate) ? 'Active' : 'Upcoming';
}

const ACTIVE_BG = 'oklch(0.72 0.15 150 / 0.16)';
const UPCOMING_BG = 'oklch(0.7 0.12 250 / 0.14)';

// Resource × project allocation matrix. Rows are resources, columns are the
// projects they're on (A→Z), cells the allocation % from Active/Upcoming
// assignments. "Active today" is each resource's live total.
export function AllocationMatrix({ resources, assignments, projects, statuses }) {
  const included = assignments.filter((a) => statuses.includes(allocationStatus(a)));
  const resIds = new Set(resources.map((r) => r.resourceId));
  const rowsAssign = included.filter((a) => resIds.has(a.resourceId));

  const projName = (id) => { const p = projects.find((x) => x.projectId === id); return p?.name || p?.projectName || id; };
  const cols = [...new Set(rowsAssign.map((a) => a.projectId))]
    .sort((a, b) => projName(a).localeCompare(projName(b), undefined, { sensitivity: 'base' }));

  const cell = new Map(); // `${resourceId}|${projectId}` → assignments
  rowsAssign.forEach((a) => {
    const k = `${a.resourceId}|${a.projectId}`;
    if (!cell.has(k)) cell.set(k, []);
    cell.get(k).push(a);
  });

  const rows = resources
    .filter((r) => rowsAssign.some((a) => a.resourceId === r.resourceId))
    .map((r) => ({
      res: r,
      active: rowsAssign.filter((a) => a.resourceId === r.resourceId && allocationStatus(a) === 'Active')
        .reduce((s, a) => s + Number(a.allocationPercent || 0), 0),
    }))
    .sort((a, b) => (a.res.department || '').localeCompare(b.res.department || '') || (a.res.fullName || '').localeCompare(b.res.fullName || ''));

  const pctOf = (list) => list.reduce((s, a) => s + Number(a.allocationPercent || 0), 0);
  const colTotal = (pid) => pctOf(rowsAssign.filter((a) => a.projectId === pid && rows.some((r) => r.res.resourceId === a.resourceId)));

  function exportCsv() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Resource', 'Department', ...cols.map(projName), 'Active today %'];
    const lines = rows.map(({ res, active }) => [
      res.fullName, res.department,
      ...cols.map((pid) => { const l = cell.get(`${res.resourceId}|${pid}`); return l ? pctOf(l) : ''; }),
      active,
    ]);
    lines.push(['Total', '', ...cols.map(colTotal), rows.reduce((s, r) => s + r.active, 0)]);
    const csv = [header, ...lines].map((l) => l.map(esc).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `resource-allocation-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!rows.length) {
    return <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>No active or upcoming allocations for these filters.</div>;
  }

  const th = { padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', textAlign: 'center' };
  const td = { padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border)', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.85rem' };
  const sticky = { position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1, textAlign: 'left', borderRight: '1px solid var(--border)' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 10, fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
        <span>{rows.length} resource(s) × {cols.length} project(s)</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: ACTIVE_BG, border: '1px solid var(--border)' }} /> Active</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: UPCOMING_BG, border: '1px solid var(--border)' }} /> Upcoming</span>
        <Button variant="outline" size="sm" style={{ marginLeft: 'auto' }} onClick={exportCsv}><Download size={14} /> Export CSV</Button>
      </div>
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...th, ...sticky, minWidth: 180 }}>Resource</th>
              <th style={{ ...th, textAlign: 'left' }}>Department</th>
              {cols.map((pid) => <th key={pid} style={{ ...th, minWidth: 90 }} title={projName(pid)}>{projName(pid)}</th>)}
              <th style={{ ...th, borderLeft: '1px solid var(--border)' }}>Active today</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ res, active }) => (
              <tr key={res.resourceId}>
                <td style={{ ...td, ...sticky, fontWeight: 600 }}>{res.fullName}</td>
                <td style={{ ...td, textAlign: 'left', color: 'var(--muted-foreground)' }}>{res.department || '—'}</td>
                {cols.map((pid) => {
                  const list = cell.get(`${res.resourceId}|${pid}`);
                  if (!list) return <td key={pid} style={{ ...td, color: 'var(--muted-foreground)' }}>·</td>;
                  const isActive = list.some((a) => allocationStatus(a) === 'Active');
                  const tip = list.map((a) => `${a.allocationPercent || 0}% · ${allocationStatus(a)} · ${fmtDate(a.startDate)} – ${fmtDate(a.endDate)}`).join('\n');
                  return (
                    <td key={pid} title={tip} style={{ ...td, fontWeight: 600, background: isActive ? ACTIVE_BG : UPCOMING_BG }}>
                      {pctOf(list)}%
                    </td>
                  );
                })}
                <td style={{ ...td, borderLeft: '1px solid var(--border)', fontWeight: 700, color: active > 100 ? 'var(--destructive)' : undefined }}>{active}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...td, ...sticky, fontWeight: 700, borderBottom: 'none' }}>Total</td>
              <td style={{ ...td, borderBottom: 'none' }} />
              {cols.map((pid) => <td key={pid} style={{ ...td, fontWeight: 700, borderBottom: 'none' }}>{colTotal(pid)}%</td>)}
              <td style={{ ...td, borderLeft: '1px solid var(--border)', fontWeight: 700, borderBottom: 'none' }}>{rows.reduce((s, r) => s + r.active, 0)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
