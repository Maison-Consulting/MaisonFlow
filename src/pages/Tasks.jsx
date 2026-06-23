import React, { useState, useMemo } from 'react';
import { Plus, Bug, CheckSquare, Clock, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Button, Input, Select, Textarea, Field, Skeleton, Badge } from '../components/ui/primitives.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { PriorityPill, fmtDate } from '../components/pills.jsx';

// Board columns, in order. `status` values must match these labels.
const COLUMNS = ['New', 'Open', 'In Progress', 'On Hold', 'Resolved', 'Closed'];
// Terminal state: a Closed task is locked from edits (reopen to change it).
const TERMINAL = 'Closed';
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const TYPES = ['Task', 'Bug'];

// Status-change log: compact JSON in the statusHistory column — [{ s, at }],
// where s = status and at = ISO timestamp of when the task entered it.
function parseHistory(raw) {
  if (!raw) return [];
  try { const h = JSON.parse(raw); return Array.isArray(h) ? h : []; } catch { return []; }
}
// Append a new entry and return the serialized history for the patch.
function pushStatus(task, status) {
  const h = parseHistory(task.statusHistory);
  h.push({ s: status, at: new Date().toISOString() });
  return JSON.stringify(h);
}
function fmtDuration(ms) {
  if (!(ms > 0)) return '0m';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}
function fmtDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

const blankTask = (projectId) => ({
  projectId,
  Title: '',
  description: '',
  workItemType: 'Task',
  status: 'New',
  priority: 'Medium',
  assigneeId: '',
  reporterId: '',
  estimatedHours: '',
  loggedHours: '',
  startDate: '',
  dueDate: '',
  labels: '',
  boardOrder: 0,
});

export function Tasks() {
  const { data, loading, create, update, remove } = useData();
  const { canWrite } = useAuth();
  const canEdit = canWrite('ProjectTask');
  const [projectId, setProjectId] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const projects = data.Project;
  const selected = projectId || projects[0]?.projectId || '';

  // resourceId → display name, for showing assignees on cards.
  const resourceName = useMemo(() => {
    const m = {};
    for (const r of data.Resource) m[r.resourceId] = r.fullName;
    return m;
  }, [data.Resource]);

  // Assignee/reporter pickers are limited to resources actually assigned to
  // this project (via ProjectAssignment) — you staff the project, then pick
  // from that team.
  const assignedResources = useMemo(() => {
    const ids = new Set(
      data.ProjectAssignment.filter((a) => a.projectId === selected).map((a) => a.resourceId)
    );
    return data.Resource.filter((r) => ids.has(r.resourceId));
  }, [data.ProjectAssignment, data.Resource, selected]);

  const tasks = useMemo(
    () => data.ProjectTask.filter((t) => t.projectId === selected),
    [data.ProjectTask, selected]
  );

  // Group tasks by status column, each sorted by boardOrder.
  const byColumn = useMemo(() => {
    const g = Object.fromEntries(COLUMNS.map((c) => [c, []]));
    for (const t of tasks) (g[t.status] || g.New).push(t);
    for (const c of COLUMNS) g[c].sort((a, b) => (Number(a.boardOrder) || 0) - (Number(b.boardOrder) || 0));
    return g;
  }, [tasks]);

  function openNew() {
    setForm(blankTask(selected));
    setOpen(true);
  }
  function openEdit(task) {
    setForm({ ...task });
    setOpen(true);
  }

  async function save() {
    if (!form.Title?.trim()) return;
    const payload = {
      ...form,
      estimatedHours: form.estimatedHours === '' ? null : Number(form.estimatedHours),
      loggedHours: form.loggedHours === '' ? null : Number(form.loggedHours),
      boardOrder: Number(form.boardOrder) || 0,
    };
    if (form._spId) {
      const orig = tasks.find((t) => t._spId === form._spId);
      const { _spId, ...patch } = payload;
      // Log a transition if the status was changed from the dialog.
      if (orig && orig.status !== patch.status) patch.statusHistory = pushStatus(orig, patch.status);
      await update('ProjectTask', _spId, patch);
    } else {
      // New card lands at the bottom of its column; seed the history with the
      // initial status so time-in-stage is measured from creation.
      payload.boardOrder = nextOrder(form.status);
      payload.statusHistory = JSON.stringify([{ s: form.status, at: new Date().toISOString() }]);
      await create('ProjectTask', payload);
    }
    setOpen(false);
  }

  async function del() {
    if (form?._spId) await remove('ProjectTask', form._spId);
    setOpen(false);
  }

  // Quick status change from the card's inline dropdown (no drag needed).
  async function changeStatus(task, newStatus) {
    if (task.status === newStatus) return;
    const patch = { status: newStatus, boardOrder: nextOrder(newStatus), statusHistory: pushStatus(task, newStatus) };
    if (newStatus === TERMINAL) patch.completedDate = new Date().toISOString().slice(0, 10);
    else if (task.status === TERMINAL) patch.completedDate = null;
    await update('ProjectTask', task._spId, patch);
  }

  // Quick reassign from the card — e.g. hand a task to a tester when it
  // reaches Resolved.
  async function changeAssignee(task, assigneeId) {
    if ((task.assigneeId || '') === assigneeId) return;
    await update('ProjectTask', task._spId, { assigneeId });
  }

  // Explicitly reopen a Done task (the only way out, since status is locked).
  // Sends it back to In Progress, clears the completion date, logs the move.
  async function reopen() {
    const orig = tasks.find((t) => t._spId === form._spId);
    if (!orig) return;
    const newStatus = 'In Progress';
    const patch = {
      status: newStatus, boardOrder: nextOrder(newStatus),
      completedDate: null, statusHistory: pushStatus(orig, newStatus),
    };
    await update('ProjectTask', form._spId, patch);
    setForm((f) => ({ ...f, status: newStatus, completedDate: null, statusHistory: patch.statusHistory }));
  }

  // Highest order in a column + 1 (cards appended to the end).
  function nextOrder(col) {
    const items = byColumn[col] || [];
    return items.length ? Math.max(...items.map((t) => Number(t.boardOrder) || 0)) + 1 : 0;
  }

  // Drop the dragged card into `col`, before `beforeTask` (or at the end).
  async function handleDrop(col, beforeTask) {
    setDragOverCol(null);
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const task = tasks.find((t) => t._spId === id);
    if (!task) return;

    const colItems = byColumn[col].filter((t) => t._spId !== id);
    const idx = beforeTask ? colItems.findIndex((t) => t._spId === beforeTask._spId) : colItems.length;
    const prev = colItems[idx - 1];
    const next = colItems[idx];
    // Midpoint ranking avoids renumbering the whole column.
    let order;
    if (prev && next) order = (Number(prev.boardOrder) + Number(next.boardOrder)) / 2;
    else if (prev) order = Number(prev.boardOrder) + 1;
    else if (next) order = Number(next.boardOrder) - 1;
    else order = 0;

    const patch = { status: col, boardOrder: order };
    if (col === TERMINAL && task.status !== TERMINAL) patch.completedDate = new Date().toISOString().slice(0, 10);
    if (col !== TERMINAL && task.status === TERMINAL) patch.completedDate = null;
    if (task.status === col && Number(task.boardOrder) === order) return;
    if (task.status !== col) patch.statusHistory = pushStatus(task, col);
    await update('ProjectTask', task._spId, patch);
  }

  // A saved task in the terminal (Closed) state is fully locked (status
  // included). Reopen is the only way back into an editable state.
  const locked = !!(form && form._spId && form.status === TERMINAL);
  // Fields are also frozen for roles that can't write tasks (read-only view).
  const formLocked = locked || !canEdit;

  return (
    <div>
      <PageHeader title="Task Board">
        <Select value={selected} onChange={(e) => setProjectId(e.target.value)} style={{ width: 200 }}>
          {projects.map((p) => <option key={p._spId} value={p.projectId}>{p.projectName || p.name}</option>)}
        </Select>
        {canEdit && <Button onClick={openNew} disabled={!selected}><Plus size={16} /> New task</Button>}
      </PageHeader>

      {loading.ProjectTask ? (
        <div style={{ display: 'flex', gap: 12 }}>
          {COLUMNS.map((c) => <Skeleton key={c} height={320} style={{ flex: 1 }} />)}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
          {COLUMNS.map((col) => (
            <div
              key={col}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOverCol(null); }}
              onDrop={() => handleDrop(col, null)}
              style={{
                flex: '1 0 240px', minWidth: 240, background: 'var(--muted)',
                borderRadius: 'var(--radius)', padding: 8,
                outline: dragOverCol === col ? '2px dashed var(--primary)' : '2px solid transparent',
                transition: 'outline 0.12s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.35rem 0.5rem 0.6rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{col}</span>
                <Badge>{byColumn[col].length}</Badge>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 40 }}>
                {byColumn[col].map((task) => (
                  <TaskCard
                    key={task._spId}
                    task={task}
                    assignee={resourceName[task.assigneeId]}
                    dragging={dragId === task._spId}
                    onDragStart={() => setDragId(task._spId)}
                    onDragEnd={() => { setDragId(null); setDragOverCol(null); }}
                    onDrop={(e) => { e.stopPropagation(); handleDrop(col, task); }}
                    onClick={() => openEdit(task)}
                    onStatusChange={(s) => changeStatus(task, s)}
                    onAssigneeChange={(rid) => changeAssignee(task, rid)}
                    resources={assignedResources}
                    canEdit={canEdit}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={form?._spId ? 'Edit task' : 'New task'}
        width={560}
        footer={
          <>
            {canEdit && form?._spId && (
              <Button variant="destructive" onClick={del} style={{ marginRight: 'auto' }}>
                <Trash2 size={15} /> Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)}>{canEdit ? 'Cancel' : 'Close'}</Button>
            {canEdit && (locked
              ? <Button onClick={reopen}>Reopen</Button>
              : <Button onClick={save}>{form?._spId ? 'Save' : 'Create task'}</Button>)}
          </>
        }
      >
        {form && (
          <>
            {locked && (
              <div style={{ marginBottom: '0.85rem', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius)', background: 'oklch(0.72 0.18 150 / 0.12)', border: '1px solid var(--rag-green)', fontSize: '0.82rem' }}>
                This task is <strong>Closed</strong> and locked. Use <strong>Reopen</strong> to edit it again.
              </div>
            )}
            <Field label="Title" required>
              <Input value={form.Title} disabled={formLocked} onChange={(e) => setForm({ ...form, Title: e.target.value })} placeholder="What needs doing?" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Type">
                <Select value={form.workItemType} disabled={formLocked} onChange={(e) => setForm({ ...form, workItemType: e.target.value })}>
                  {TYPES.map((t) => <option key={t}>{t}</option>)}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} disabled={formLocked} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {COLUMNS.map((s) => <option key={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={form.priority} disabled={formLocked} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                </Select>
              </Field>
              <Field label="Assignee">
                <Select value={form.assigneeId} disabled={formLocked} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
                  <option value="">Unassigned</option>
                  {assignedResources.map((r) => <option key={r._spId} value={r.resourceId}>{r.fullName}</option>)}
                </Select>
              </Field>
              <Field label="Reporter">
                <Select value={form.reporterId} disabled={formLocked} onChange={(e) => setForm({ ...form, reporterId: e.target.value })}>
                  <option value="">—</option>
                  {assignedResources.map((r) => <option key={r._spId} value={r.resourceId}>{r.fullName}</option>)}
                </Select>
              </Field>
              <Field label="Labels">
                <Input value={form.labels} disabled={formLocked} onChange={(e) => setForm({ ...form, labels: e.target.value })} placeholder="comma, separated" />
              </Field>
              <Field label="Start date">
                <Input type="date" value={form.startDate || ''} disabled={formLocked} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </Field>
              <Field label="Due date">
                <Input type="date" value={form.dueDate || ''} disabled={formLocked} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </Field>
              <Field label="Estimated hours">
                <Input type="number" min={0} value={form.estimatedHours} disabled={formLocked} onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })} />
              </Field>
              <Field label="Logged hours">
                <Input type="number" min={0} value={form.loggedHours} disabled={formLocked} onChange={(e) => setForm({ ...form, loggedHours: e.target.value })} />
              </Field>
            </div>
            <Field label="Description">
              <Textarea value={form.description} disabled={formLocked} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            {form._spId && (
              <div>
                <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--muted-foreground)' }}>Stage history</span>
                <StageTimeline history={parseHistory(form.statusHistory)} />
              </div>
            )}
          </>
        )}
      </Dialog>
    </div>
  );
}

const inlineSelect = {
  flex: 1, minWidth: 0, padding: '0.25rem 0.4rem', fontSize: '0.72rem',
  borderRadius: 'calc(var(--radius) - 0.35rem)', border: '1px solid var(--input)',
  background: 'var(--muted)', color: 'var(--foreground)', cursor: 'pointer',
};

function TaskCard({ task, assignee, dragging, onDragStart, onDragEnd, onDrop, onClick, onStatusChange, onAssigneeChange, resources, canEdit }) {
  const TypeIcon = task.workItemType === 'Bug' ? Bug : CheckSquare;
  const typeColor = task.workItemType === 'Bug' ? 'var(--rag-red)' : 'var(--accent)';
  // Inline controls are frozen when the task is closed OR the role can't write.
  const frozen = task.status === TERMINAL || !canEdit;
  const closed = task.status === TERMINAL;
  const overdue = task.dueDate && !closed && new Date(task.dueDate) < new Date();
  // Ensure the current assignee is always selectable, even if they're no longer
  // on the project's assigned team.
  const assigneeOptions = task.assigneeId && !resources.some((r) => r.resourceId === task.assigneeId)
    ? [{ _spId: 'current', resourceId: task.assigneeId, fullName: assignee || task.assigneeId }, ...resources]
    : resources;
  return (
    <Card
      draggable={!frozen}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={onClick}
      style={{
        padding: '0.6rem 0.7rem', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
        opacity: dragging ? 0.4 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <TypeIcon size={14} color={typeColor} />
        <PriorityPill level={task.priority} />
        {task.labels && <Badge>{task.labels.split(',')[0].trim()}</Badge>}
      </div>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.3, marginBottom: 6 }}>{task.Title}</div>
      {(task.dueDate || (task.estimatedHours != null && task.estimatedHours !== '')) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.72rem', color: 'var(--muted-foreground)', flexWrap: 'wrap', marginBottom: 2 }}>
          {task.dueDate && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: overdue ? 'var(--destructive)' : undefined, fontWeight: overdue ? 700 : 400 }}>
              <Clock size={12} /> {fmtDate(task.dueDate)}
            </span>
          )}
          {task.estimatedHours != null && task.estimatedHours !== '' && <span>{task.loggedHours || 0}/{task.estimatedHours}h</span>}
        </div>
      )}
      {/* Inline status + assignee controls. stopPropagation so they neither open
          the card nor start a drag. The assignee picker is how you hand a task
          to a tester when it moves to Resolved. */}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <select
          value={task.status}
          title={closed ? 'Reopen the task to change status' : 'Status'}
          disabled={frozen}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { e.stopPropagation(); onStatusChange(e.target.value); }}
          style={{ ...inlineSelect, ...(frozen ? { opacity: 0.5, cursor: 'not-allowed' } : null) }}
        >
          {COLUMNS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={task.assigneeId || ''}
          title={closed ? 'Reopen the task to reassign' : 'Assignee'}
          disabled={frozen}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { e.stopPropagation(); onAssigneeChange(e.target.value); }}
          style={{ ...inlineSelect, ...(frozen ? { opacity: 0.5, cursor: 'not-allowed' } : null) }}
        >
          <option value="">Unassigned</option>
          {assigneeOptions.map((r) => <option key={r._spId} value={r.resourceId}>{r.fullName}</option>)}
        </select>
      </div>
    </Card>
  );
}

// Per-stage timeline: when the task entered each status and how long it stayed.
// The last (current) stage is measured up to now; Total spans creation → now.
function StageTimeline({ history }) {
  if (!history.length) {
    return <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>No stage changes logged yet.</div>;
  }
  const now = Date.now();
  const total = now - new Date(history[0].at).getTime();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {history.map((h, i) => {
        const start = new Date(h.at).getTime();
        const end = i < history.length - 1 ? new Date(history[i + 1].at).getTime() : now;
        const isCurrent = i === history.length - 1;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem' }}>
            <Badge color={isCurrent ? 'var(--accent)' : undefined}>{h.s}</Badge>
            <span style={{ color: 'var(--muted-foreground)' }}>{fmtDateTime(h.at)}</span>
            <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{fmtDuration(end - start)}{isCurrent ? ' • current' : ''}</span>
          </div>
        );
      })}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 2, paddingTop: 6, display: 'flex', fontSize: '0.8rem', fontWeight: 700 }}>
        <span>Total elapsed</span>
        <span style={{ marginLeft: 'auto' }}>{fmtDuration(total)}</span>
      </div>
    </div>
  );
}
