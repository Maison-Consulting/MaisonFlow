import React, { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { Card, CardContent, Button, Input, Select, Textarea, Field, Skeleton } from '../components/ui/primitives.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { fmtDate } from '../components/pills.jsx';
import { MEETING_TYPES } from '../lib/schema.js';
import { useAuth } from '../context/AuthContext.jsx';

function monthKey(d) { const dt = new Date(d); return isNaN(dt) ? 'Undated' : dt.toLocaleString('en', { month: 'long', year: 'numeric' }); }

const iconBtnStyle = { display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4, borderRadius: 6 };

export function Meetings() {
  const { data, loading, create, update, remove } = useData();
  const { canWrite } = useAuth();
  const canEdit = canWrite('SteeringMeeting');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);

  const grouped = useMemo(() => {
    const sorted = data.SteeringMeeting.slice().sort((a, b) => new Date(b.meetingDate) - new Date(a.meetingDate));
    const map = {};
    sorted.forEach((m) => { const k = monthKey(m.meetingDate); (map[k] = map[k] || []).push(m); });
    return map;
  }, [data.SteeringMeeting]);

  function openNew() { setForm({ projectId: data.Project[0]?.projectId || '', meetingType: MEETING_TYPES[0], meetingDate: '', attendees: '', agenda: '', decisions: '', actionItems: '' }); setOpen(true); }
  function openEdit(m) {
    setForm({
      _spId: m._spId, projectId: m.projectId, meetingType: m.meetingType || MEETING_TYPES[0],
      meetingDate: (m.meetingDate || '').slice(0, 10), attendees: m.attendees || '',
      agenda: m.agenda || '', decisions: m.decisions || '', actionItems: m.actionItems || '',
    });
    setOpen(true);
  }
  async function save() {
    const { _spId, ...patch } = form;
    if (_spId) await update('SteeringMeeting', _spId, patch);
    else await create('SteeringMeeting', form);
    setOpen(false);
  }
  function del(m) {
    if (window.confirm('Delete this meeting?')) remove('SteeringMeeting', m._spId);
  }

  const projName = (id) => { const p = data.Project.find((x) => x.projectId === id); return p?.projectName || p?.name || id; };

  return (
    <div>
      <PageHeader title="Meetings">{canEdit && <Button onClick={openNew}><Plus size={16} /> Add</Button>}</PageHeader>

      {loading.SteeringMeeting ? <Card style={{ padding: '1.25rem' }}><Skeleton height={120} /></Card>
        : Object.keys(grouped).length === 0 ? <Card><CardContent><div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>No meetings yet.</div></CardContent></Card>
        : Object.entries(grouped).map(([month, items]) => (
          <div key={month} style={{ marginBottom: 18 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 8, color: 'var(--primary)' }}>{month}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((m) => (
                <Card key={m._spId}>
                  <CardContent>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <strong>{m.meetingType ? `${m.meetingType} · ` : ''}{fmtDate(m.meetingDate)} — {projName(m.projectId)}</strong>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>{(m.attendees || '').split(',').filter(Boolean).length} attendees</span>
                        {canEdit && <button onClick={() => openEdit(m)} aria-label="Edit" title="Edit" style={iconBtnStyle}><Pencil size={15} /></button>}
                        {canEdit && <button onClick={() => del(m)} aria-label="Delete" title="Delete" style={{ ...iconBtnStyle, color: 'var(--destructive)' }}><Trash2 size={15} /></button>}
                      </div>
                    </div>
                    {m.agenda && <p style={{ fontSize: '0.85rem', marginTop: 6 }}><strong>Agenda:</strong> {m.agenda}</p>}
                    {m.decisions && <p style={{ fontSize: '0.85rem', marginTop: 4 }}><strong>Decisions:</strong> {m.decisions}</p>}
                    {m.actionItems && <p style={{ fontSize: '0.85rem', marginTop: 4 }}><strong>Actions:</strong> {m.actionItems}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}

      <Dialog open={open} onClose={() => setOpen(false)} title={form?._spId ? 'Edit meeting' : 'Add meeting'}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>{form?._spId ? 'Save' : 'Add'}</Button></>}>
        {form && <>
          <Field label="Project"><Select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>{data.Project.map((p) => <option key={p._spId} value={p.projectId}>{p.projectName || p.name}</option>)}</Select></Field>
          <Field label="Meeting type"><Select value={form.meetingType} onChange={(e) => setForm({ ...form, meetingType: e.target.value })}>{MEETING_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="Meeting date"><Input type="date" value={form.meetingDate} onChange={(e) => setForm({ ...form, meetingDate: e.target.value })} /></Field>
          <Field label="Attendees (comma-separated)"><Input value={form.attendees} onChange={(e) => setForm({ ...form, attendees: e.target.value })} /></Field>
          <Field label="Agenda"><Textarea value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} /></Field>
          <Field label="Decisions"><Textarea value={form.decisions} onChange={(e) => setForm({ ...form, decisions: e.target.value })} /></Field>
          <Field label="Action items"><Textarea value={form.actionItems} onChange={(e) => setForm({ ...form, actionItems: e.target.value })} /></Field>
        </>}
      </Dialog>
    </div>
  );
}
