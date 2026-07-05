import React, { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { Card, CardHeader, CardContent, Button, Input, Select, Textarea, Field, Skeleton } from '../components/ui/primitives.jsx';
import { Dialog, Table } from '../components/ui/Dialog.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { SeverityPill } from '../components/pills.jsx';
import { Heatmap } from '../components/charts/Charts.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const iconBtnStyle = { display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4, borderRadius: 6 };

export function Risks() {
  const { data, loading, create, update, remove } = useData();
  const { canWrite } = useAuth();
  const canEdit = canWrite('ProjectRisk');
  const [projectId, setProjectId] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);

  const projects = data.Project;
  const selected = projectId || projects[0]?.projectId || '';
  const rows = useMemo(() => data.ProjectRisk.filter((r) => r.projectId === selected), [data.ProjectRisk, selected]);

  const cells = useMemo(() => {
    const c = {};
    rows.forEach((r) => { const k = `${r.severity}|${r.probability}`; c[k] = (c[k] || 0) + 1; });
    return c;
  }, [rows]);

  function openNew() {
    setForm({ projectId: selected, title: '', description: '', severity: 'Medium', probability: 'Medium', owner: '', mitigation: '', status: 'Open' });
    setOpen(true);
  }
  function openEdit(r) {
    setForm({
      _spId: r._spId, projectId: r.projectId,
      title: r.title || r.riskTitle || '', description: r.description || '',
      severity: r.severity || 'Medium', probability: r.probability || 'Medium',
      owner: r.owner || '', mitigation: r.mitigation || '', status: r.status || 'Open',
    });
    setOpen(true);
  }
  async function save() {
    const { _spId, ...patch } = form;
    if (_spId) await update('ProjectRisk', _spId, patch);
    else await create('ProjectRisk', form);
    setOpen(false);
  }
  function del(r) {
    if (window.confirm('Delete this risk?')) remove('ProjectRisk', r._spId);
  }

  return (
    <div>
      <PageHeader title="Risk Register">
        <Select value={selected} onChange={(e) => setProjectId(e.target.value)} style={{ width: 200 }}>
          {projects.map((p) => <option key={p._spId} value={p.projectId}>{p.projectName || p.name}</option>)}
        </Select>
        {canEdit && <Button onClick={openNew} disabled={!selected}><Plus size={16} /> New Risk</Button>}
      </PageHeader>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(280px,1fr)', gap: 12 }}>
        <Card>
          {loading.ProjectRisk ? <CardContent><Skeleton height={120} /></CardContent>
            : <Table empty="No risks logged for this project."
                columns={[
                  { key: 'title', label: 'Title', render: (r) => r.title || r.riskTitle },
                  { key: 'severity', label: 'Severity', render: (r) => <SeverityPill level={r.severity} /> },
                  { key: 'probability', label: 'Probability' },
                  { key: 'owner', label: 'Owner' },
                  { key: 'status', label: 'Status' },
                  ...(canEdit ? [{ key: '_actions', label: '', sortable: false, width: 80, render: (r) => (
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button onClick={() => openEdit(r)} aria-label="Edit" title="Edit" style={iconBtnStyle}><Pencil size={15} /></button>
                      <button onClick={() => del(r)} aria-label="Delete" title="Delete" style={{ ...iconBtnStyle, color: 'var(--destructive)' }}><Trash2 size={15} /></button>
                    </div>
                  ) }] : []),
                ]} rows={rows} />}
        </Card>
        <Card>
          <CardHeader><strong>Heatmap</strong></CardHeader>
          <CardContent><Heatmap cells={cells} /></CardContent>
        </Card>
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title={form?._spId ? 'Edit risk' : 'New risk'}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>{form?._spId ? 'Save' : 'Add risk'}</Button></>}>
        {form && <>
          <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Severity">
              <Select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
              </Select>
            </Field>
            <Field label="Probability">
              <Select value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })}>
                <option>Low</option><option>Medium</option><option>High</option>
              </Select>
            </Field>
          </div>
          <Field label="Owner"><Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></Field>
          <Field label="Mitigation"><Textarea value={form.mitigation} onChange={(e) => setForm({ ...form, mitigation: e.target.value })} /></Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option>Open</option><option>Mitigating</option><option>Closed</option>
            </Select>
          </Field>
        </>}
      </Dialog>
    </div>
  );
}
