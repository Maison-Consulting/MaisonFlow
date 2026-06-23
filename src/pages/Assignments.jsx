import React, { useState, useMemo } from 'react';
import { Plus, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { Card, Button, Input, Select, Field, Skeleton, Badge } from '../components/ui/primitives.jsx';
import { Dialog, Table } from '../components/ui/Dialog.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { fmtDate, isExpired, isActiveOn } from '../components/pills.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { PROJECT_ROLES } from '../lib/permissions.js';

// Overlap check for two date ranges.
function overlaps(aStart, aEnd, bStart, bEnd) {
  const as = new Date(aStart || '1900-01-01'), ae = new Date(aEnd || '2999-01-01');
  const bs = new Date(bStart || '1900-01-01'), be = new Date(bEnd || '2999-01-01');
  return as <= be && bs <= ae;
}

const iconBtnStyle = { display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4, borderRadius: 6 };

export function Assignments() {
  const { data, loading, create, update, remove } = useData();
  const { canWrite } = useAuth();
  const canEdit = canWrite('ProjectAssignment');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [fProject, setFProject] = useState('');
  const [fResource, setFResource] = useState('');
  const [fStatus, setFStatus] = useState(''); // '', 'Active', 'Upcoming', 'Ended'

  const projName = (id) => { const p = data.Project.find((x) => x.projectId === id); return p?.projectName || p?.name || id; };
  const resName = (id) => data.Resource.find((r) => r.resourceId === id)?.fullName || id;

  // Resources whose overlapping allocations exceed 100% (spec §6.7).
  // Expired assignments (end date passed) no longer consume capacity, so we
  // drop them before checking overlaps.
  const overAllocated = useMemo(() => {
    const flag = new Set();
    const live = data.ProjectAssignment.filter((x) => !isExpired(x.endDate));
    data.Resource.forEach((res) => {
      const a = live.filter((x) => x.resourceId === res.resourceId);
      a.forEach((x) => {
        const sum = a.filter((y) => overlaps(x.startDate, x.endDate, y.startDate, y.endDate))
          .reduce((s, y) => s + Number(y.allocationPercent || 0), 0);
        if (sum > 100) flag.add(res.resourceId);
      });
    });
    return flag;
  }, [data.ProjectAssignment, data.Resource]);

  function openNew() { setForm({ projectId: data.Project[0]?.projectId || '', resourceId: data.Resource[0]?.resourceId || '', allocationPercent: 50, startDate: '', endDate: '', role: 'Consultant' }); setOpen(true); }
  function openEdit(r) {
    setForm({
      _spId: r._spId,
      projectId: r.projectId || '',
      resourceId: r.resourceId || '',
      allocationPercent: r.allocationPercent ?? 50,
      startDate: (r.startDate || '').slice(0, 10),
      endDate: (r.endDate || '').slice(0, 10),
      role: r.role || '',
    });
    setOpen(true);
  }
  async function save() {
    setSaving(true);
    try {
      const { _spId, ...rest } = form;
      const payload = { ...rest, allocationPercent: Number(form.allocationPercent) || 0 };
      if (_spId) await update('ProjectAssignment', _spId, payload);
      else await create('ProjectAssignment', payload);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }
  function del(r) {
    if (window.confirm('Delete this assignment?')) remove('ProjectAssignment', r._spId);
  }

  function statusOf(r) {
    if (isExpired(r.endDate)) return 'Ended';
    return isActiveOn(r.startDate, r.endDate) ? 'Active' : 'Upcoming';
  }

  const rows = useMemo(() => data.ProjectAssignment.filter((r) =>
    (!fProject || r.projectId === fProject) &&
    (!fResource || r.resourceId === fResource) &&
    (!fStatus || statusOf(r) === fStatus)
  ), [data.ProjectAssignment, fProject, fResource, fStatus]);

  return (
    <div>
      <PageHeader title="Assignments">{canEdit && <Button onClick={openNew}><Plus size={16} /> Add</Button>}</PageHeader>

      {overAllocated.size > 0 && (
        <div style={{ marginBottom: 12, padding: '0.7rem 1rem', borderRadius: 'var(--radius)', background: 'oklch(0.82 0.16 80 / 0.18)', border: '1px solid var(--secondary)', display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}>
          <AlertTriangle size={16} /> {overAllocated.size} resource(s) are over 100% allocated across overlapping dates.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Select value={fProject} onChange={(e) => setFProject(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All projects</option>
          {data.Project.map((p) => <option key={p._spId} value={p.projectId}>{p.projectName || p.name}</option>)}
        </Select>
        <Select value={fResource} onChange={(e) => setFResource(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All resources</option>
          {data.Resource.map((r) => <option key={r._spId} value={r.resourceId}>{r.fullName}</option>)}
        </Select>
        <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Any status</option>
          <option value="Active">Active</option>
          <option value="Upcoming">Upcoming</option>
          <option value="Ended">Ended</option>
        </Select>
        {(fProject || fResource || fStatus) && (
          <Button variant="ghost" size="sm" onClick={() => { setFProject(''); setFResource(''); setFStatus(''); }}>Clear</Button>
        )}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>
          {rows.length} of {data.ProjectAssignment.length}
        </span>
      </div>

      <Card>
        {loading.ProjectAssignment ? <div style={{ padding: '1.25rem' }}><Skeleton height={100} /></div>
          : <Table empty="No assignments yet."
              columns={[
                { key: 'projectId', label: 'Project', render: (r) => projName(r.projectId) },
                { key: 'resourceId', label: 'Resource', render: (r) => <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{resName(r.resourceId)}{overAllocated.has(r.resourceId) && <Badge color="var(--rag-amber)">over</Badge>}</span> },
                { key: 'role', label: 'Role' },
                { key: 'allocationPercent', label: 'Allocation', render: (r) => `${r.allocationPercent || 0}%` },
                { key: 'startDate', label: 'Start', render: (r) => fmtDate(r.startDate) },
                { key: 'endDate', label: 'End', render: (r) => (
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    {fmtDate(r.endDate)}
                    {isExpired(r.endDate) && <Badge>Ended</Badge>}
                    {!isActiveOn(r.startDate, r.endDate) && !isExpired(r.endDate) && <Badge color="var(--accent)">Upcoming</Badge>}
                  </span>
                ) },
                ...(canEdit ? [{ key: '_actions', label: '', sortable: false, width: 80, render: (r) => (
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button onClick={() => openEdit(r)} aria-label="Edit" title="Edit" style={iconBtnStyle}><Pencil size={15} /></button>
                    <button onClick={() => del(r)} aria-label="Delete" title="Delete" style={{ ...iconBtnStyle, color: 'var(--destructive)' }}><Trash2 size={15} /></button>
                  </div>
                ) }] : []),
              ]} rows={rows} />}
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} title={form?._spId ? 'Edit assignment' : 'Add assignment'}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : (form?._spId ? 'Save' : 'Add')}</Button></>}>
        {form && <>
          <Field label="Project"><Select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>{data.Project.map((p) => <option key={p._spId} value={p.projectId}>{p.projectName || p.name}</option>)}</Select></Field>
          <Field label="Resource"><Select value={form.resourceId} onChange={(e) => setForm({ ...form, resourceId: e.target.value })}>{data.Resource.map((r) => <option key={r._spId} value={r.resourceId}>{r.fullName}</option>)}</Select></Field>
          <Field label="Role on project"><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{PROJECT_ROLES.map((r) => <option key={r}>{r}</option>)}</Select></Field>
          <Field label={`Allocation (${form.allocationPercent}%)`}><Input type="range" min={0} max={100} value={form.allocationPercent} onChange={(e) => setForm({ ...form, allocationPercent: e.target.value })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Start"><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
            <Field label="End"><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
          </div>
        </>}
      </Dialog>
    </div>
  );
}
