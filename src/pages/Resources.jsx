import React, { useState, useMemo } from 'react';
import { Plus, Search, MoreHorizontal, Mail, Sparkles, X } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { Card, Button, Input, Select, Field, Skeleton, useToast } from '../components/ui/primitives.jsx';
import { Dialog, Table } from '../components/ui/Dialog.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { ResourceStatusPill } from '../components/pills.jsx';
import { useDebounced } from '../lib/useDebounced.js';
import { PRODUCTS } from '../lib/schema.js';
import { ROLES, DEFAULT_ROLE } from '../lib/permissions.js';
import { useAuth } from '../context/AuthContext.jsx';

const EMPTY = { fullName: '', email: '', role: '', department: '', location: '', product: PRODUCTS[0], weeklyCapacityHours: 40, status: 'Active', appRole: DEFAULT_ROLE };

// Fields that must be filled before a resource can be saved (everything except
// weekly capacity, which is optional and defaults to 40h).
const REQUIRED = [
  { key: 'fullName', label: 'Full name' },
  { key: 'email', label: 'Email' },
  { key: 'role', label: 'Role' },
  { key: 'department', label: 'Department' },
  { key: 'location', label: 'Location' },
  { key: 'status', label: 'Status' },
];

function stars(n) { n = Number(n) || 0; return '★'.repeat(n) + '☆'.repeat(5 - n); }

// An assignment is "active" when today falls within its start/end window.
function isActive(a, today) {
  const start = a.startDate ? a.startDate.slice(0, 10) : null;
  const end = a.endDate ? a.endDate.slice(0, 10) : null;
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

export function Resources() {
  const { data, loading, create, update, remove } = useData();
  const { role: myRole, canWrite } = useAuth();
  const isAdmin = myRole === 'Admin';
  const canEdit = canWrite('Resource');
  const canEditSkills = canWrite('ResourceSkill');
  const toast = useToast();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 250);
  const [editing, setEditing] = useState(null); // null | {} | row
  const [form, setForm] = useState(EMPTY);
  const [confirmDel, setConfirmDel] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [detail, setDetail] = useState(null); // resource row being viewed

  const rows = useMemo(() => {
    const q = debounced.toLowerCase();
    return data.Resource.filter((r) =>
      !q || [r.fullName, r.role, r.department].some((v) => (v || '').toLowerCase().includes(q))
    );
  }, [data.Resource, debounced]);

  function openCreate() { setForm(EMPTY); setEditing({}); }
  function openEdit(row) { setForm(row); setEditing(row); setMenuFor(null); }

  async function save() {
    const missing = REQUIRED.filter((f) => !String(form[f.key] ?? '').trim());
    if (missing.length) {
      toast(`Please fill: ${missing.map((f) => f.label).join(', ')}`, 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast('Please enter a valid email address.', 'error');
      return;
    }
    const payload = { ...form, weeklyCapacityHours: Number(form.weeklyCapacityHours) || 0 };
    if (editing._spId) await update('Resource', editing._spId, payload);
    else await create('Resource', payload);
    setEditing(null);
  }

  const columns = [
    { key: 'fullName', label: 'Name' },
    { key: 'role', label: 'Role' },
    { key: 'department', label: 'Dept' },
    { key: 'location', label: 'Location' },
    { key: 'weeklyCapacityHours', label: 'Capacity', render: (r) => `${r.weeklyCapacityHours || 0}h` },
    { key: 'status', label: 'Status', render: (r) => <ResourceStatusPill status={r.status} /> },
    ...(canEdit ? [{
      key: 'actions', label: '', sortable: false, width: 48,
      render: (r) => (
        <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" onClick={() => setMenuFor(menuFor === r._spId ? null : r._spId)} aria-label="Row actions">
            <MoreHorizontal size={16} />
          </Button>
          {menuFor === r._spId && (
            <div style={{ position: 'absolute', right: 0, top: 36, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20, minWidth: 120 }}>
              <MenuItem onClick={() => openEdit(r)}>Edit</MenuItem>
              <MenuItem onClick={() => { setConfirmDel(r); setMenuFor(null); }} danger>Delete</MenuItem>
            </div>
          )}
        </div>
      ),
    }] : []),
  ];

  return (
    <div onClick={(e) => { if (!e.target.closest('[aria-label="Row actions"]')) setMenuFor(null); }}>
      <PageHeader title="Resources">
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--muted-foreground)' }} />
          <Input placeholder="Search name, role, dept…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ paddingLeft: 30, width: 220 }} />
        </div>
        {canEdit && <Button onClick={openCreate}><Plus size={16} /> Add</Button>}
      </PageHeader>

      <Card>
        {loading.Resource ? <div style={{ padding: '1.25rem' }}><Skeleton height={28} style={{ marginBottom: 10 }} /><Skeleton height={28} style={{ marginBottom: 10 }} /><Skeleton height={28} /></div>
          : <Table columns={columns} rows={rows} onRowClick={(r) => setDetail(r)} empty="No resources yet. Add your first teammate." />}
      </Card>

      <Dialog
        open={!!editing} onClose={() => setEditing(null)}
        title={editing?._spId ? 'Edit resource' : 'Add resource'}
        footer={<>
          <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          <Button onClick={save}>{editing?._spId ? 'Save changes' : 'Add resource'}</Button>
        </>}
      >
        <Field label="Full name" required><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
        <Field label="Email" required><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Role" required><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></Field>
        <Field label="Department" required><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></Field>
        <Field label="Location" required><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
        <Field label="Product">
          <Select value={form.product || ''} onChange={(e) => setForm({ ...form, product: e.target.value })}>
            {PRODUCTS.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Weekly capacity (hours)"><Input type="number" value={form.weeklyCapacityHours} onChange={(e) => setForm({ ...form, weeklyCapacityHours: e.target.value })} /></Field>
        <Field label="Status" required>
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option>Active</option><option>On Leave</option><option>Inactive</option>
          </Select>
        </Field>
        <Field label={`Access role${isAdmin ? '' : ' (admin only)'}`}>
          <Select value={form.appRole || DEFAULT_ROLE} disabled={!isAdmin} onChange={(e) => setForm({ ...form, appRole: e.target.value })}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </Select>
        </Field>
      </Dialog>

      {detail && (
        <ResourceDetail
          resource={detail}
          onClose={() => setDetail(null)}
          data={data}
          create={create}
          remove={remove}
          canEdit={canEditSkills}
        />
      )}

      <Dialog
        open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Delete resource" width={400}
        footer={<>
          <Button variant="outline" onClick={() => setConfirmDel(null)}>Cancel</Button>
          <Button variant="destructive" onClick={async () => { await remove('Resource', confirmDel._spId); setConfirmDel(null); }}>Delete</Button>
        </>}
      >
        Delete <strong>{confirmDel?.fullName}</strong>? This can't be undone.
      </Dialog>
    </div>
  );
}

// Read-only resource profile: contact, meta, mapped skills (with inline add),
// and active assignments.
function ResourceDetail({ resource, onClose, data, create, remove, canEdit }) {
  const today = new Date().toISOString().slice(0, 10);
  const [adding, setAdding] = useState(false);
  const [skillForm, setSkillForm] = useState({ skillId: '', proficiency: 3 });

  const skillName = (id) => { const s = data.Skill.find((x) => x.skillId === id); return s?.name || s?.skillName || id; };
  const projectName = (id) => data.Project.find((p) => p.projectId === id)?.projectName || id;

  const skills = useMemo(
    () => data.ResourceSkill.filter((rs) => rs.resourceId === resource.resourceId),
    [data.ResourceSkill, resource.resourceId]
  );
  const assignments = useMemo(
    () => data.ProjectAssignment
      .filter((a) => a.resourceId === resource.resourceId && isActive(a, today))
      .sort((a, b) => Number(b.allocationPercent || 0) - Number(a.allocationPercent || 0)),
    [data.ProjectAssignment, resource.resourceId, today]
  );
  const usedCapacity = assignments.reduce((s, a) => s + Number(a.allocationPercent || 0), 0);

  // Skills the resource doesn't already have, available to add.
  const available = data.Skill.filter((s) => !skills.some((rs) => rs.skillId === s.skillId));

  function startAdd() {
    setSkillForm({ skillId: available[0]?.skillId || '', proficiency: 3 });
    setAdding(true);
  }
  async function addSkill() {
    if (!skillForm.skillId) return;
    await create('ResourceSkill', {
      resourceId: resource.resourceId,
      skillId: skillForm.skillId,
      proficiency: Number(skillForm.proficiency),
      yearsExperience: 0,
    });
    setAdding(false);
  }

  return (
    <Dialog open onClose={onClose} title={resource.fullName} width={620}>
      {resource.email && (
        <a href={`mailto:${resource.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none', marginBottom: '1.25rem' }}>
          <Mail size={16} /> {resource.email}
        </a>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 16, marginBottom: '1.5rem' }}>
        <Meta label="Region" value={resource.location} />
        <Meta label="Type" value={resource.role} />
        <Meta label="Department" value={resource.department} />
        <Meta label="Used Capacity" value={`${usedCapacity}%`} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <strong style={{ fontSize: '1.05rem' }}>Skills ({skills.length})</strong>
        {canEdit && (
          <Button variant="ghost" size="icon" aria-label="Add skill" onClick={startAdd} disabled={!available.length}>
            <Sparkles size={18} style={{ color: 'var(--secondary)' }} />
          </Button>
        )}
      </div>

      {adding && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: '0.75rem', padding: '0.75rem', background: 'var(--muted)', borderRadius: 'var(--radius)' }}>
          <div style={{ flex: 1 }}>
            <Field label="Skill"><Select value={skillForm.skillId} onChange={(e) => setSkillForm({ ...skillForm, skillId: e.target.value })}>{available.map((s) => <option key={s._spId} value={s.skillId}>{s.name || s.skillName}</option>)}</Select></Field>
          </div>
          <div style={{ width: 140 }}>
            <Field label={`Proficiency (${skillForm.proficiency}/5)`}><Input type="range" min={1} max={5} value={skillForm.proficiency} onChange={(e) => setSkillForm({ ...skillForm, proficiency: e.target.value })} /></Field>
          </div>
          <Button onClick={addSkill} style={{ marginBottom: '0.75rem' }}>Add</Button>
          <Button variant="outline" onClick={() => setAdding(false)} style={{ marginBottom: '0.75rem' }}>Cancel</Button>
        </div>
      )}

      {skills.length === 0 ? (
        <div style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>No skills mapped</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '1.5rem' }}>
          {skills.map((rs) => (
            <span key={rs._spId} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.3rem 0.6rem', background: 'var(--muted)', borderRadius: 999, fontSize: '0.82rem' }}>
              {skillName(rs.skillId)}
              <span style={{ color: 'var(--secondary)', letterSpacing: 1 }}>{stars(rs.proficiency)}</span>
              {canEdit && (
                <button onClick={() => remove('ResourceSkill', rs._spId)} aria-label="Remove skill" style={{ display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 0 }}>
                  <X size={13} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <strong style={{ fontSize: '1.05rem', display: 'block', marginBottom: '0.5rem' }}>Active Assignments</strong>
      {assignments.length === 0 ? (
        <div style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>No active assignments.</div>
      ) : (
        <Table
          empty="No active assignments."
          rows={assignments}
          columns={[
            { key: 'projectId', label: 'Project', render: (a) => projectName(a.projectId) },
            { key: 'allocationPercent', label: '%', render: (a) => `${a.allocationPercent || 0}%` },
            { key: 'startDate', label: 'From', render: (a) => (a.startDate || '').slice(0, 10) },
            { key: 'endDate', label: 'To', render: (a) => (a.endDate || '').slice(0, 10) },
          ]}
        />
      )}
    </Dialog>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value || '—'}</div>
    </div>
  );
}

function MenuItem({ children, onClick, danger }) {
  return (
    <button onClick={onClick} style={{
      display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', background: 'transparent',
      border: 'none', fontSize: '0.85rem', color: danger ? 'var(--destructive)' : 'var(--foreground)',
    }}>{children}</button>
  );
}
