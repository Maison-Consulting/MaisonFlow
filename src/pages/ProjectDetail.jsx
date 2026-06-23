import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Trash2, Pencil } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { PROJECT_ROLES } from '../lib/permissions.js';
import { Card, CardContent, Button, Input, Select, Textarea, Field } from '../components/ui/primitives.jsx';
import { Dialog, Table } from '../components/ui/Dialog.jsx';
import { RagDot, RagBadge, SeverityPill, PaymentStatusPill, PriorityPill, money, fmtDate } from '../components/pills.jsx';
import { LineChart } from '../components/charts/Charts.jsx';

const TABS = ['Overview', 'Assignments', 'Tasks', 'Tracking', 'Risks', 'Meetings', 'Payments'];

const RAG_OPTIONS = ['Green', 'Amber', 'Red'];
const TASK_TYPE_OPTIONS = ['Task', 'Bug'];
const TASK_STATUS_OPTIONS = ['New', 'Open', 'In Progress', 'On Hold', 'Resolved', 'Closed'];
const TASK_PRIORITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low'];
const SEVERITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'];
const PROBABILITY_OPTIONS = ['Low', 'Medium', 'High'];
const RISK_STATUS_OPTIONS = ['Open', 'Mitigating', 'Closed'];
const PAYMENT_STATUS_OPTIONS = ['Pending', 'Invoiced', 'Paid', 'Overdue'];

// Add/Edit form config per entity. `numbers` lists fields coerced to Number on save.
const FORMS = {
  ProjectAssignment: {
    label: 'assignment',
    empty: { resourceId: '', role: 'Consultant', allocationPercent: 50, startDate: '', endDate: '' },
    numbers: ['allocationPercent'],
    fields: [
      { name: 'resourceId', label: 'Resource', type: 'resource' },
      { name: 'role', label: 'Role on project', type: 'select', options: PROJECT_ROLES },
      { name: 'allocationPercent', label: 'Allocation', type: 'range', min: 0, max: 100, suffix: '%' },
      { name: 'startDate', label: 'Start', type: 'date', half: true },
      { name: 'endDate', label: 'End', type: 'date', half: true },
    ],
  },
  ProjectTask: {
    label: 'task',
    empty: { Title: '', description: '', workItemType: 'Task', status: 'New', priority: 'Medium', assigneeId: '', startDate: '', dueDate: '', estimatedHours: '', loggedHours: '', labels: '', boardOrder: 0 },
    numbers: ['estimatedHours', 'loggedHours', 'boardOrder'],
    fields: [
      { name: 'Title', label: 'Title', type: 'text' },
      { name: 'workItemType', label: 'Type', type: 'select', options: TASK_TYPE_OPTIONS, half: true },
      { name: 'status', label: 'Status', type: 'select', options: TASK_STATUS_OPTIONS, half: true },
      { name: 'priority', label: 'Priority', type: 'select', options: TASK_PRIORITY_OPTIONS, half: true },
      { name: 'assigneeId', label: 'Assignee', type: 'resource', half: true },
      { name: 'startDate', label: 'Start', type: 'date', half: true },
      { name: 'dueDate', label: 'Due', type: 'date', half: true },
      { name: 'estimatedHours', label: 'Est. hours', type: 'number', min: 0, half: true },
      { name: 'loggedHours', label: 'Logged hours', type: 'number', min: 0, half: true },
      { name: 'labels', label: 'Labels', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
    ],
  },
  ProjectTracking: {
    label: 'tracking entry',
    empty: { weekEnding: '', percentComplete: 0, ragStatus: 'Green', narrative: '', nextSteps: '' },
    numbers: ['percentComplete'],
    fields: [
      { name: 'weekEnding', label: 'Week ending', type: 'date', half: true },
      { name: 'percentComplete', label: '% Complete', type: 'number', min: 0, max: 100, half: true },
      { name: 'ragStatus', label: 'RAG', type: 'select', options: RAG_OPTIONS },
      { name: 'narrative', label: 'Narrative', type: 'textarea' },
      { name: 'nextSteps', label: 'Next steps', type: 'textarea' },
    ],
  },
  ProjectRisk: {
    label: 'risk',
    empty: { riskTitle: '', description: '', severity: 'Medium', probability: 'Medium', owner: '', mitigation: '', status: 'Open' },
    numbers: [],
    fields: [
      { name: 'riskTitle', label: 'Title', type: 'text', read: (r) => r.riskTitle || r.title },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'severity', label: 'Severity', type: 'select', options: SEVERITY_OPTIONS, half: true },
      { name: 'probability', label: 'Probability', type: 'select', options: PROBABILITY_OPTIONS, half: true },
      { name: 'owner', label: 'Owner', type: 'text' },
      { name: 'mitigation', label: 'Mitigation', type: 'textarea' },
      { name: 'status', label: 'Status', type: 'select', options: RISK_STATUS_OPTIONS },
    ],
  },
  SteeringMeeting: {
    label: 'meeting',
    empty: { meetingDate: '', attendees: '', agenda: '', decisions: '', actionItems: '' },
    numbers: [],
    fields: [
      { name: 'meetingDate', label: 'Date', type: 'date' },
      { name: 'attendees', label: 'Attendees', type: 'textarea' },
      { name: 'agenda', label: 'Agenda', type: 'textarea' },
      { name: 'decisions', label: 'Decisions', type: 'textarea' },
      { name: 'actionItems', label: 'Action items', type: 'textarea' },
    ],
  },
  ProjectPayment: {
    label: 'payment',
    empty: { milestone: '', amount: 0, currency: 'USD', dueDate: '', invoiceNumber: '', status: 'Pending' },
    numbers: ['amount'],
    fields: [
      { name: 'milestone', label: 'Milestone', type: 'text' },
      { name: 'amount', label: 'Amount', type: 'number', min: 0, half: true },
      { name: 'currency', label: 'Currency', type: 'text', half: true },
      { name: 'dueDate', label: 'Due date', type: 'date', half: true },
      { name: 'invoiceNumber', label: 'Invoice #', type: 'text', half: true },
      { name: 'status', label: 'Status', type: 'select', options: PAYMENT_STATUS_OPTIONS },
    ],
  },
};

const iconBtnStyle = { display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4, borderRadius: 6 };

export function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, create, update, remove } = useData();
  const { canWrite } = useAuth();
  const [tab, setTab] = useState('Overview');
  const [skillOpen, setSkillOpen] = useState(false);
  const [skillForm, setSkillForm] = useState(null);
  const [skillError, setSkillError] = useState('');
  const [skillSaving, setSkillSaving] = useState(false);

  // Generic add/edit dialog state: which entity + the working form (with _spId when editing).
  const [editEntity, setEditEntity] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  const project = data.Project.find((p) => p.projectId === id);
  if (!project) return <div>Project not found. <Button variant="ghost" onClick={() => navigate('/projects')}>Back</Button></div>;
  const name = project.projectName || project.name;

  const byProject = (entity) => data[entity].filter((r) => r.projectId === id);
  const resName = (rid) => data.Resource.find((r) => r.resourceId === rid)?.fullName || rid;
  // Resources staffed on this project — the pool the task assignee picker draws from.
  const assignedResources = (() => {
    const ids = new Set(byProject('ProjectAssignment').map((a) => a.resourceId));
    return data.Resource.filter((r) => ids.has(r.resourceId));
  })();
  const skillName = (sid) => { const s = data.Skill.find((x) => x.skillId === sid); return s?.name || s?.skillName || sid; };

  // ── Generic CRUD for the tab tables ──────────────────────────────────────
  function openCreate(entity) {
    const empty = { ...FORMS[entity].empty };
    if (entity === 'ProjectAssignment' && !empty.resourceId) empty.resourceId = data.Resource[0]?.resourceId || '';
    setEditEntity(entity);
    setEditForm(empty);
  }
  function openEdit(entity, row) {
    const cfg = FORMS[entity];
    const f = { _spId: row._spId };
    cfg.fields.forEach((fl) => {
      let v = fl.read ? fl.read(row) : row[fl.name];
      if (v == null) v = cfg.empty[fl.name];
      if (fl.type === 'date' && v) v = String(v).slice(0, 10);
      f[fl.name] = v;
    });
    setEditEntity(entity);
    setEditForm(f);
  }
  function closeEdit() { setEditEntity(null); setEditForm(null); setEditSaving(false); }
  async function saveEdit() {
    const cfg = FORMS[editEntity];
    const { _spId, ...rest } = editForm;
    const payload = { ...rest };
    cfg.numbers.forEach((n) => { payload[n] = Number(payload[n]) || 0; });
    setEditSaving(true);
    try {
      if (_spId) await update(editEntity, _spId, payload);
      else await create(editEntity, { ...payload, projectId: id });
      closeEdit();
    } finally {
      setEditSaving(false);
    }
  }
  function delRow(entity, spId) {
    if (window.confirm('Delete this record?')) remove(entity, spId);
  }

  // Trailing actions column (edit + delete) appended to each tab's table.
  // Returns null for roles that can't write the entity — callers filter it out.
  const actionsCol = (entity) => (canWrite(entity) ? {
    key: '_actions', label: '', sortable: false, width: 80,
    render: (r) => (
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        <button onClick={() => openEdit(entity, r)} aria-label="Edit" title="Edit" style={iconBtnStyle}><Pencil size={15} /></button>
        <button onClick={() => delRow(entity, r._spId)} aria-label="Delete" title="Delete" style={{ ...iconBtnStyle, color: 'var(--destructive)' }}><Trash2 size={15} /></button>
      </div>
    ),
  } : null);

  // ── Required skills (Overview tab) ───────────────────────────────────────
  function openAddSkill() {
    setSkillError('');
    setSkillForm({ projectId: id, skillId: data.Skill[0]?.skillId || '', minProficiency: 3, hoursNeeded: '' });
    setSkillOpen(true);
  }
  async function saveSkill() {
    if (!skillForm.skillId) { setSkillError('Skill is required.'); return; }
    if (byProject('ProjectSkill').some((r) => r.skillId === skillForm.skillId)) {
      setSkillError('This skill is already required for this project.');
      return;
    }
    setSkillError('');
    setSkillSaving(true);
    try {
      await create('ProjectSkill', {
        projectId: id,
        skillId: skillForm.skillId,
        minProficiency: Number(skillForm.minProficiency) || 0,
        hoursNeeded: Number(skillForm.hoursNeeded) || 0,
      });
      setSkillOpen(false);
    } catch (e) {
      setSkillError(e?.message || 'Failed to add skill. Try again.');
    } finally {
      setSkillSaving(false);
    }
  }

  const tracking = useMemo(() =>
    byProject('ProjectTracking').slice().sort((a, b) => new Date(a.weekEnding) - new Date(b.weekEnding)),
    [data.ProjectTracking, id]);

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}><ChevronLeft size={16} /> Back to Projects</Button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0.75rem 0 0.25rem', flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>{name}</h1>
        <Button variant="outline" size="sm" onClick={() => navigate(`/report/${id}`)}>Summary Report</Button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted-foreground)', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <span>{project.client}</span> • <span>{project.status}</span> • <RagDot status={project.ragStatus} /> • <span>{fmtDate(project.startDate)} → {fmtDate(project.endDate)}</span>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: '1rem', overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '0.6rem 0.9rem', background: 'transparent', border: 'none', borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
            color: tab === t ? 'var(--primary)' : 'var(--muted-foreground)', fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap',
          }}>{t}</button>
        ))}
      </div>

      <Card><CardContent>
        {tab === 'Overview' && (
          <div>
            <p style={{ marginBottom: 12 }}>{project.description || 'No description.'}</p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Stat label="Budget" value={money(project.budget)} />
              <Stat label="RAG" value={<RagBadge status={project.ragStatus} />} />
              <Stat label="Assignments" value={byProject('ProjectAssignment').length} />
              <Stat label="Open risks" value={byProject('ProjectRisk').filter((r) => r.status !== 'Closed').length} />
            </div>
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>Required skills</div>
                {canWrite('ProjectSkill') && <Button variant="outline" size="sm" onClick={openAddSkill} style={{ marginLeft: 'auto' }}><Plus size={14} /> Add skill</Button>}
              </div>
              {byProject('ProjectSkill').length === 0 ? (
                <div style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>No required skills logged.</div>
              ) : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {byProject('ProjectSkill').map((r) => (
                    <span key={r._spId} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', padding: '0.25rem 0.4rem 0.25rem 0.6rem', borderRadius: 999, background: 'var(--muted)', color: 'var(--foreground)', fontWeight: 600 }}>
                      {skillName(r.skillId)}
                      {canWrite('ProjectSkill') && (
                        <button onClick={() => remove('ProjectSkill', r._spId)} aria-label="Remove skill" title="Remove skill"
                          style={{ display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 0 }}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {tab === 'Assignments' && (
          <div>
            {canWrite('ProjectAssignment') && <TabToolbar onAdd={() => openCreate('ProjectAssignment')} label="Add resource" />}
            <Table empty="No assignments."
              columns={[{ key: 'resourceId', label: 'Resource', render: (r) => resName(r.resourceId) }, { key: 'role', label: 'Role' }, { key: 'allocationPercent', label: 'Allocation', render: (r) => `${r.allocationPercent || 0}%` }, { key: 'startDate', label: 'Start', render: (r) => fmtDate(r.startDate) }, { key: 'endDate', label: 'End', render: (r) => fmtDate(r.endDate) }, actionsCol('ProjectAssignment')].filter(Boolean)}
              rows={byProject('ProjectAssignment')} />
          </div>
        )}
        {tab === 'Tasks' && (
          <div>
            {canWrite('ProjectTask') && <TabToolbar onAdd={() => openCreate('ProjectTask')} label="Add task" />}
            <Table empty="No tasks."
              columns={[
                { key: 'Title', label: 'Title' },
                { key: 'workItemType', label: 'Type' },
                { key: 'status', label: 'Status' },
                { key: 'priority', label: 'Priority', render: (r) => <PriorityPill level={r.priority} /> },
                { key: 'assigneeId', label: 'Assignee', render: (r) => r.assigneeId ? resName(r.assigneeId) : '—' },
                { key: 'dueDate', label: 'Due', render: (r) => fmtDate(r.dueDate) },
                actionsCol('ProjectTask'),
              ].filter(Boolean)}
              rows={byProject('ProjectTask')} />
          </div>
        )}
        {tab === 'Tracking' && (
          <div>
            {canWrite('ProjectTracking') && <TabToolbar onAdd={() => openCreate('ProjectTracking')} label="Add tracking entry" />}
            {tracking.length > 0 && <div style={{ marginBottom: 16 }}><LineChart data={tracking.map((t) => ({ x: fmtDate(t.weekEnding).slice(5), y: Number(t.percentComplete) || 0 }))} /></div>}
            <Table empty="No tracking entries."
              columns={[{ key: 'weekEnding', label: 'Week Ending', render: (r) => fmtDate(r.weekEnding) }, { key: 'ragStatus', label: 'RAG', render: (r) => <RagBadge status={r.ragStatus} /> }, { key: 'percentComplete', label: '% Complete', render: (r) => `${r.percentComplete || 0}%` }, { key: 'narrative', label: 'Narrative' }, actionsCol('ProjectTracking')].filter(Boolean)}
              rows={tracking} />
          </div>
        )}
        {tab === 'Risks' && (
          <div>
            {canWrite('ProjectRisk') && <TabToolbar onAdd={() => openCreate('ProjectRisk')} label="Add risk" />}
            <Table empty="No risks."
              columns={[{ key: 'riskTitle', label: 'Title', render: (r) => r.riskTitle || r.title }, { key: 'severity', label: 'Severity', render: (r) => <SeverityPill level={r.severity} /> }, { key: 'probability', label: 'Probability' }, { key: 'owner', label: 'Owner' }, { key: 'status', label: 'Status' }, actionsCol('ProjectRisk')].filter(Boolean)}
              rows={byProject('ProjectRisk')} />
          </div>
        )}
        {tab === 'Meetings' && (
          <div>
            {canWrite('SteeringMeeting') && <TabToolbar onAdd={() => openCreate('SteeringMeeting')} label="Add meeting" />}
            <Table empty="No meetings."
              columns={[{ key: 'meetingDate', label: 'Date', render: (r) => fmtDate(r.meetingDate) }, { key: 'attendees', label: 'Attendees' }, { key: 'decisions', label: 'Decisions' }, actionsCol('SteeringMeeting')].filter(Boolean)}
              rows={byProject('SteeringMeeting')} />
          </div>
        )}
        {tab === 'Payments' && (
          <div>
            {canWrite('ProjectPayment') && <TabToolbar onAdd={() => openCreate('ProjectPayment')} label="Add payment" />}
            <Table empty="No payments."
              columns={[{ key: 'milestone', label: 'Milestone' }, { key: 'amount', label: 'Amount', render: (r) => money(r.amount, r.currency) }, { key: 'dueDate', label: 'Due', render: (r) => fmtDate(r.dueDate) }, { key: 'status', label: 'Status', render: (r) => <PaymentStatusPill status={r.status} /> }, actionsCol('ProjectPayment')].filter(Boolean)}
              rows={byProject('ProjectPayment')} />
          </div>
        )}
      </CardContent></Card>

      {/* Generic add/edit dialog for the tab entities */}
      <Dialog open={!!editEntity} onClose={closeEdit}
        title={`${editForm?._spId ? 'Edit' : 'Add'} ${editEntity ? FORMS[editEntity].label : ''}`}
        footer={<>
          <Button variant="outline" onClick={closeEdit}>Cancel</Button>
          <Button onClick={saveEdit} disabled={editSaving}>{editSaving ? 'Saving…' : (editForm?._spId ? 'Save' : 'Add')}</Button>
        </>}>
        {editEntity && editForm && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {FORMS[editEntity].fields.map((fl) => (
              <div key={fl.name} style={{ gridColumn: fl.half ? 'span 1' : 'span 2' }}>
                <Field label={fl.suffix ? `${fl.label} (${editForm[fl.name]}${fl.suffix})` : fl.label}>
                  <EditField field={fl} value={editForm[fl.name]}
                    resources={editEntity === 'ProjectTask' ? assignedResources : data.Resource}
                    onChange={(v) => setEditForm((f) => ({ ...f, [fl.name]: v }))} />
                </Field>
              </div>
            ))}
          </div>
        )}
      </Dialog>

      <Dialog open={skillOpen} onClose={() => setSkillOpen(false)} title="Add required skill"
        footer={<>
          <Button variant="outline" onClick={() => setSkillOpen(false)}>Cancel</Button>
          <Button onClick={saveSkill} disabled={skillSaving}>{skillSaving ? 'Adding…' : 'Add'}</Button>
        </>}>
        {skillForm && <>
          {skillError && (
            <div style={{ marginBottom: '0.85rem', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius)', background: 'oklch(0.60 0.22 25 / 0.1)', border: '1px solid var(--destructive)', color: 'var(--foreground)', fontSize: '0.82rem' }}>
              {skillError}
            </div>
          )}
          <Field label="Skill">
            <Select value={skillForm.skillId} onChange={(e) => setSkillForm({ ...skillForm, skillId: e.target.value })}>
              {data.Skill.map((s) => <option key={s._spId} value={s.skillId}>{s.name || s.skillName}</option>)}
            </Select>
          </Field>
          <Field label={`Min proficiency (${skillForm.minProficiency}/5)`}>
            <Input type="range" min={1} max={5} value={skillForm.minProficiency} onChange={(e) => setSkillForm({ ...skillForm, minProficiency: e.target.value })} />
          </Field>
          <Field label="Hours needed">
            <Input type="number" min={1} value={skillForm.hoursNeeded} onChange={(e) => setSkillForm({ ...skillForm, hoursNeeded: e.target.value })} />
          </Field>
        </>}
      </Dialog>
    </div>
  );
}

function TabToolbar({ onAdd, label }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
      <Button size="sm" onClick={onAdd}><Plus size={16} /> {label}</Button>
    </div>
  );
}

function EditField({ field, value, onChange, resources }) {
  const v = value ?? '';
  switch (field.type) {
    case 'resource':
      return <Select value={v} onChange={(e) => onChange(e.target.value)}>{resources.map((r) => <option key={r._spId} value={r.resourceId}>{r.fullName}</option>)}</Select>;
    case 'select':
      return <Select value={v} onChange={(e) => onChange(e.target.value)}>{field.options.map((o) => <option key={o} value={o}>{o}</option>)}</Select>;
    case 'textarea':
      return <Textarea value={v} onChange={(e) => onChange(e.target.value)} />;
    case 'date':
      return <Input type="date" value={v} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return <Input type="number" min={field.min} max={field.max} value={v} onChange={(e) => onChange(e.target.value)} />;
    case 'range':
      return <Input type="range" min={field.min} max={field.max} value={v} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <Input value={v} onChange={(e) => onChange(e.target.value)} />;
  }
}

function Stat({ label, value }) {
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
