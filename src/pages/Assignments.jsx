import React, { useState, useMemo } from 'react';
import { Plus, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { Card, Button, Input, Select, Field, Skeleton, Badge } from '../components/ui/primitives.jsx';
import { Dialog, Table } from '../components/ui/Dialog.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { fmtDate, isExpired, isActiveOn } from '../components/pills.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { PROJECT_ROLES } from '../lib/permissions.js';
import { assignmentExceeds100 } from '../lib/allocation.js';
import { useSubmitGuard } from '../lib/useSubmitGuard.js';

const iconBtnStyle = { display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4, borderRadius: 6 };

export function Assignments() {
  const [busy, guard] = useSubmitGuard(); // blocks double-submit on save
  const { data, loading, create, update, remove, fetchFresh } = useData();
  const { canWrite, canManageProject } = useAuth();
  const canEdit = canWrite('ProjectAssignment');
  // Assignments can only be managed on projects the user leads (or as Admin).
  const manageableProjects = data.Project.filter((p) => canManageProject(p.projectId));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deptFilter, setDeptFilter] = useState(''); // form: filter resource picker by department
  const [fProject, setFProject] = useState('');
  const [fResource, setFResource] = useState('');
  const [fStatus, setFStatus] = useState(''); // '', 'Active', 'Upcoming', 'Ended'
  const [fDept, setFDept] = useState('');

  const projName = (id) => { const p = data.Project.find((x) => x.projectId === id); return p?.projectName || p?.name || id; };
  const resName = (id) => data.Resource.find((r) => r.resourceId === id)?.fullName || id;
  // Department filter for the form's resource picker.
  const departments = [...new Set(data.Resource.map((r) => r.department).filter(Boolean))].sort();
  const formResources = deptFilter ? data.Resource.filter((r) => r.department === deptFilter) : data.Resource;

  // Resources over-allocated AS OF TODAY: sum the allocation of assignments
  // that are live today (start ≤ today ≤ end). Expired and not-yet-started
  // assignments don't consume capacity, so they're excluded.
  const overAllocated = useMemo(() => {
    const byRes = {};
    data.ProjectAssignment.forEach((a) => {
      if (!isActiveOn(a.startDate, a.endDate)) return;
      byRes[a.resourceId] = (byRes[a.resourceId] || 0) + Number(a.allocationPercent || 0);
    });
    return new Set(Object.keys(byRes).filter((rid) => byRes[rid] > 100));
  }, [data.ProjectAssignment]);

  function openNew() { setError(''); setDeptFilter(''); setForm({ projectId: manageableProjects[0]?.projectId || '', resourceId: data.Resource[0]?.resourceId || '', allocationPercent: 50, startDate: new Date().toISOString().slice(0, 10), endDate: '', role: 'Consultant' }); setOpen(true); }
  function openEdit(r) {
    setError(''); setDeptFilter('');
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
    if (!form.startDate || !form.endDate) { setError('Start date and end date are required.'); return; }
    if (form.endDate < form.startDate) { setError('End date cannot be before the start date.'); return; }
    if (assignmentExceeds100(data.ProjectAssignment, form)) {
      setError('This would put the resource over 100% utilization during the selected dates.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      // Re-check against the LATEST assignments so a second user can't over-
      // allocate the same resource concurrently on stale data.
      const fresh = await fetchFresh('ProjectAssignment');
      if (assignmentExceeds100(fresh, form)) {
        setError('This would put the resource over 100% utilization — another change was just made. Review the updated assignments.');
        setSaving(false);
        return;
      }
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
    remove('ProjectAssignment', r._spId);
  }

  function statusOf(r) {
    if (isExpired(r.endDate)) return 'Ended';
    return isActiveOn(r.startDate, r.endDate) ? 'Active' : 'Upcoming';
  }

  const deptOf = (rid) => data.Resource.find((x) => x.resourceId === rid)?.department || '';
  const rows = useMemo(() => data.ProjectAssignment.filter((r) =>
    (!fProject || r.projectId === fProject) &&
    (!fResource || r.resourceId === fResource) &&
    (!fStatus || statusOf(r) === fStatus) &&
    (!fDept || deptOf(r.resourceId) === fDept)
  ), [data.ProjectAssignment, data.Resource, fProject, fResource, fStatus, fDept]);

  return (
    <div>
      <PageHeader title="Assignments">{canEdit && manageableProjects.length > 0 && <Button onClick={openNew}><Plus size={16} /> Add</Button>}</PageHeader>

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
        <Select value={fDept} onChange={(e) => setFDept(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d}>{d}</option>)}
        </Select>
        {(fProject || fResource || fStatus || fDept) && (
          <Button variant="ghost" size="sm" onClick={() => { setFProject(''); setFResource(''); setFStatus(''); setFDept(''); }}>Clear</Button>
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
                ...(canEdit ? [{ key: '_actions', label: '', sortable: false, width: 80, render: (r) => {
                  if (!canManageProject(r.projectId)) return null;
                  const ended = isExpired(r.endDate); // ended assignments are locked
                  const lock = ended ? { opacity: 0.4, cursor: 'not-allowed' } : null;
                  return (
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button onClick={ended ? undefined : () => openEdit(r)} disabled={ended} aria-label="Edit" title={ended ? 'Ended — locked' : 'Edit'} style={{ ...iconBtnStyle, ...lock }}><Pencil size={15} /></button>
                      <button onClick={ended ? undefined : () => del(r)} disabled={ended} aria-label="Delete" title={ended ? 'Ended — locked' : 'Delete'} style={{ ...iconBtnStyle, color: 'var(--destructive)', ...lock }}><Trash2 size={15} /></button>
                    </div>
                  );
                } }] : []),
              ]} rows={rows} />}
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} title={form?._spId ? 'Edit assignment' : 'Add assignment'}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={guard(save)} disabled={saving || busy}>{saving || busy ? 'Saving…' : (form?._spId ? 'Save' : 'Add')}</Button></>}>
        {form && <>
          {error && (
            <div style={{ marginBottom: '0.85rem', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius)', background: 'oklch(0.60 0.22 25 / 0.1)', border: '1px solid var(--destructive)', color: 'var(--foreground)', fontSize: '0.82rem' }}>
              {error}
            </div>
          )}
          <Field label="Project"><Select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>{manageableProjects.map((p) => <option key={p._spId} value={p.projectId}>{p.projectName || p.name}</option>)}</Select></Field>
          <Field label="Department (filter)">
            <Select value={deptFilter} onChange={(e) => {
              const d = e.target.value; setDeptFilter(d);
              const pool = d ? data.Resource.filter((r) => r.department === d) : data.Resource;
              if (!pool.some((r) => r.resourceId === form.resourceId)) setForm((f) => ({ ...f, resourceId: pool[0]?.resourceId || '' }));
            }}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d}>{d}</option>)}
            </Select>
          </Field>
          <Field label="Resource"><Select value={form.resourceId} onChange={(e) => setForm({ ...form, resourceId: e.target.value })}>{formResources.map((r) => <option key={r._spId} value={r.resourceId}>{r.fullName}</option>)}</Select></Field>
          <Field label="Role on project"><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{PROJECT_ROLES.map((r) => <option key={r}>{r}</option>)}</Select></Field>
          <Field label={`Allocation (${form.allocationPercent}%)`}><Input type="range" min={0} max={100} value={form.allocationPercent} onChange={(e) => setForm({ ...form, allocationPercent: e.target.value })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Start" required><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
            <Field label="End" required><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
          </div>
        </>}
      </Dialog>
    </div>
  );
}
