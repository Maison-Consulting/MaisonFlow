import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { Card, CardContent, Button, Input, Select, Field, Skeleton } from '../components/ui/primitives.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { RagDot, RagBadge, money, fmtDate } from '../components/pills.jsx';
import { PRODUCTS } from '../lib/schema.js';
import { normalizeRole } from '../lib/permissions.js';
import { useAuth } from '../context/AuthContext.jsx';

const EMPTY = { name: '', client: '', product: PRODUCTS[0], startDate: '', endDate: '', budget: 0, status: 'Planned', ragStatus: 'Green', managerId: '', devLeadId: '', functionalLeadId: '' };

export function Projects() {
  const navigate = useNavigate();
  const { data, loading, create } = useData();
  const { canWrite } = useAuth();
  const canEdit = canWrite('Project');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  // Each lead picker only lists resources whose access role matches that slot.
  const byAppRole = (roleName) => data.Resource.filter((r) => normalizeRole(r.appRole) === roleName);

  async function save() {
    if (!form.managerId) { setError('Project owner is required.'); return; }
    setError('');
    const saved = await create('Project', { ...form, budget: Number(form.budget) || 0 });
    setOpen(false);
    if (saved?.projectId) navigate(`/projects/${saved.projectId}`);
  }

  return (
    <div>
      <PageHeader title="Projects">
        {canEdit && <Button onClick={() => { setForm(EMPTY); setError(''); setOpen(true); }}><Plus size={16} /> New Project</Button>}
      </PageHeader>

      {loading.Project ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {[0, 1, 2].map((i) => <Card key={i}><CardContent><Skeleton height={120} /></CardContent></Card>)}
        </div>
      ) : data.Project.length === 0 ? (
        <Card><CardContent><div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>No projects yet. Create your first one.</div></CardContent></Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {data.Project.map((p) => {
            const name = p.projectName || p.name;
            const pct = p.budget ? Math.min(100, 60) : 0; // budget bar placeholder (no spend field in schema)
            return (
              <Card key={p._spId}>
                <CardContent>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <strong style={{ fontSize: '1.05rem' }}>{name}</strong>
                    <RagDot status={p.ragStatus} />
                  </div>
                  <div style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem', marginTop: 2 }}>{p.client}</div>
                  <div style={{ margin: '0.75rem 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <RagBadge status={p.ragStatus} />
                    <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.55rem', borderRadius: 999, background: 'var(--muted)', color: 'var(--muted-foreground)', fontWeight: 600 }}>{p.status}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>{fmtDate(p.startDate)} → {fmtDate(p.endDate)}</div>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{money(p.budget)}</div>
                    <div style={{ height: 6, background: 'var(--muted)', borderRadius: 999, marginTop: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--secondary)' }} />
                    </div>
                  </div>
                  <Button variant="outline" size="sm" style={{ marginTop: 12, width: '100%' }} onClick={() => navigate(`/projects/${p.projectId}`)}>Open</Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="New project"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Create</Button></>}>
        {error && (
          <div style={{ marginBottom: '0.85rem', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius)', background: 'oklch(0.60 0.22 25 / 0.1)', border: '1px solid var(--destructive)', color: 'var(--foreground)', fontSize: '0.82rem' }}>
            {error}
          </div>
        )}
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Client"><Input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} /></Field>
        <Field label="Product">
          <Select value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })}>
            {PRODUCTS.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Start date"><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
          <Field label="End date"><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
        </div>
        <Field label="Budget"><Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option>Planned</option><option>Active</option><option>On Hold</option><option>Closed</option>
            </Select>
          </Field>
          <Field label="RAG">
            <Select value={form.ragStatus} onChange={(e) => setForm({ ...form, ragStatus: e.target.value })}>
              <option>Green</option><option>Amber</option><option>Red</option>
            </Select>
          </Field>
        </div>
        <Field label="Project manager (owner)" required>
          <Select value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
            <option value="">Unassigned</option>
            {byAppRole('Project Manager').map((r) => <option key={r._spId} value={r.resourceId}>{r.fullName}</option>)}
          </Select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Dev Lead">
            <Select value={form.devLeadId} onChange={(e) => setForm({ ...form, devLeadId: e.target.value })}>
              <option value="">Unassigned</option>
              {byAppRole('Dev Lead').map((r) => <option key={r._spId} value={r.resourceId}>{r.fullName}</option>)}
            </Select>
          </Field>
          <Field label="Functional Lead">
            <Select value={form.functionalLeadId} onChange={(e) => setForm({ ...form, functionalLeadId: e.target.value })}>
              <option value="">Unassigned</option>
              {byAppRole('Functional Lead').map((r) => <option key={r._spId} value={r.resourceId}>{r.fullName}</option>)}
            </Select>
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
