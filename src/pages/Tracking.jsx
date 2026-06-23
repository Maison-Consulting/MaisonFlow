import React, { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { Card, CardHeader, CardContent, Button, Input, Select, Textarea, Field, Skeleton } from '../components/ui/primitives.jsx';
import { Dialog, Table } from '../components/ui/Dialog.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { RagBadge, fmtDate, nextSunday } from '../components/pills.jsx';
import { LineChart } from '../components/charts/Charts.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const iconBtnStyle = { display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4, borderRadius: 6 };

export function Tracking() {
  const { data, loading, create, update, remove } = useData();
  const { canWrite } = useAuth();
  const canEdit = canWrite('ProjectTracking');
  const [projectId, setProjectId] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);

  const projects = data.Project;
  const selected = projectId || projects[0]?.projectId || '';

  const rows = useMemo(() =>
    data.ProjectTracking.filter((t) => t.projectId === selected)
      .sort((a, b) => new Date(b.weekEnding) - new Date(a.weekEnding)),
    [data.ProjectTracking, selected]);

  const trend = useMemo(() =>
    rows.slice().reverse().map((t) => ({ x: fmtDate(t.weekEnding).slice(5), y: Number(t.percentComplete) || 0 })),
    [rows]);

  function openLog() {
    setForm({ projectId: selected, weekEnding: nextSunday(), percentComplete: 0, ragStatus: 'Green', narrative: '', nextSteps: '' });
    setOpen(true);
  }
  function openEdit(r) {
    setForm({
      _spId: r._spId, projectId: r.projectId,
      weekEnding: (r.weekEnding || '').slice(0, 10), percentComplete: r.percentComplete ?? 0,
      ragStatus: r.ragStatus || 'Green', narrative: r.narrative || '', nextSteps: r.nextSteps || '',
    });
    setOpen(true);
  }
  async function save() {
    const { _spId, ...rest } = form;
    const payload = { ...rest, percentComplete: Number(form.percentComplete) || 0 };
    if (_spId) await update('ProjectTracking', _spId, payload);
    else await create('ProjectTracking', payload);
    setOpen(false);
  }
  function del(r) {
    if (window.confirm('Delete this tracking entry?')) remove('ProjectTracking', r._spId);
  }

  return (
    <div>
      <PageHeader title="Project Tracking">
        <Select value={selected} onChange={(e) => setProjectId(e.target.value)} style={{ width: 200 }}>
          {projects.map((p) => <option key={p._spId} value={p.projectId}>{p.projectName || p.name}</option>)}
        </Select>
        {canEdit && <Button onClick={openLog} disabled={!selected}><Plus size={16} /> Log Week</Button>}
      </PageHeader>

      <Card style={{ marginBottom: 12 }}>
        {loading.ProjectTracking ? <CardContent><Skeleton height={120} /></CardContent>
          : <Table empty="No tracking entries for this project yet."
              columns={[
                { key: 'weekEnding', label: 'Week Ending', render: (r) => fmtDate(r.weekEnding) },
                { key: 'ragStatus', label: 'RAG', render: (r) => <RagBadge status={r.ragStatus} /> },
                { key: 'percentComplete', label: '% Complete', render: (r) => `${r.percentComplete || 0}%` },
                { key: 'narrative', label: 'Narrative' },
                { key: 'nextSteps', label: 'Next Steps' },
                ...(canEdit ? [{ key: '_actions', label: '', sortable: false, width: 80, render: (r) => (
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button onClick={() => openEdit(r)} aria-label="Edit" title="Edit" style={iconBtnStyle}><Pencil size={15} /></button>
                    <button onClick={() => del(r)} aria-label="Delete" title="Delete" style={{ ...iconBtnStyle, color: 'var(--destructive)' }}><Trash2 size={15} /></button>
                  </div>
                ) }] : []),
              ]}
              rows={rows} />}
      </Card>

      {trend.length > 0 && (
        <Card>
          <CardHeader><strong>Progress trend</strong> <span style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>(% complete over weeks)</span></CardHeader>
          <CardContent><LineChart data={trend} /></CardContent>
        </Card>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={form?._spId ? 'Edit tracking entry' : 'Log week'}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>{form?._spId ? 'Save' : 'Save entry'}</Button></>}>
        {form && <>
          <Field label="Week ending"><Input type="date" value={form.weekEnding} onChange={(e) => setForm({ ...form, weekEnding: e.target.value })} /></Field>
          <Field label="% Complete"><Input type="number" min={0} max={100} value={form.percentComplete} onChange={(e) => setForm({ ...form, percentComplete: e.target.value })} /></Field>
          <Field label="RAG status">
            <Select value={form.ragStatus} onChange={(e) => setForm({ ...form, ragStatus: e.target.value })}>
              <option>Green</option><option>Amber</option><option>Red</option>
            </Select>
          </Field>
          <Field label="Narrative"><Textarea value={form.narrative} onChange={(e) => setForm({ ...form, narrative: e.target.value })} /></Field>
          <Field label="Next steps"><Textarea value={form.nextSteps} onChange={(e) => setForm({ ...form, nextSteps: e.target.value })} /></Field>
        </>}
      </Dialog>
    </div>
  );
}
