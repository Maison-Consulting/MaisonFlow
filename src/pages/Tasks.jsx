import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Bug, CheckSquare, Clock, Trash2, Paperclip } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Button, Input, Select, Textarea, Field, Skeleton, Badge, useToast } from '../components/ui/primitives.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { PriorityPill, fmtDate } from '../components/pills.jsx';
import { sendTaskAssignedEmail, sendMentionEmail } from '../lib/notify.js';
import { graphSearchUsers } from '../lib/graphClient.js';
import { listAttachments, addAttachment, deleteAttachment } from '../lib/spClient.js';

// Board columns, in order. `status` values must match these labels.
const COLUMNS = ['New', 'Open', 'In Progress', 'On Hold', 'Resolved', 'Closed'];
// Terminal state: a Closed task is locked from edits (reopen to change it).
const TERMINAL = 'Closed';
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const TYPES = ['Task', 'Bug'];
const CATEGORIES = ['Dev Task', 'Functional Task'];

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

const blankTask = (projectId, parentId = '') => ({
  projectId,
  parentId,
  Title: '',
  description: '',
  workItemType: 'Task',
  category: 'Dev Task',
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
  discussion: '',
});

// Discussion thread: compact JSON in the `discussion` column — [{ a, t, at }],
// where a = author name, t = comment text, at = ISO timestamp.
function parseDiscussion(raw) {
  if (!raw) return [];
  try { const d = JSON.parse(raw); return Array.isArray(d) ? d : []; } catch { return []; }
}

export function Tasks() {
  const { data, loading, create, update, remove } = useData();
  const { canWrite, me, email, canManageProject } = useAuth();
  const canEdit = canWrite('ProjectTask');
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [attachments, setAttachments] = useState([]);
  const [attachBusy, setAttachBusy] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]); // files chosen while creating a task (uploaded after save)
  const [projectId, setProjectId] = useState('');
  const [selectedParentId, setSelectedParentId] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [comment, setComment] = useState('');
  const [orgUsers, setOrgUsers] = useState([]);      // org directory matches for @mention
  const [mentionedMap, setMentionedMap] = useState({}); // fullName → email, for people picked from suggestions
  const [dragId, setDragId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const projects = data.Project;
  const selected = projectId || projects[0]?.projectId || '';
  const selectedProject = projects.find((p) => p.projectId === selected);
  const projName = selectedProject?.projectName || selectedProject?.name || '';
  // Task create/delete + parent management require lead rights on the SELECTED
  // project. Editing/completing an own task uses canEdit (a member can do that).
  const canManageTasks = canEdit && canManageProject(selected);

  // Assignment email — surface the result so it's clear whether it sent.
  function emailAssignee(assigneeId, task) {
    const r = data.Resource.find((x) => x.resourceId === assigneeId);
    if (!r?.email) { toast(`No email on ${r?.fullName || 'the assignee'}'s record — notification not sent.`, 'error'); return; }
    sendTaskAssignedEmail({
      to: r.email, toName: r.fullName, taskTitle: task.Title,
      projectName: projName, assignedBy: me?.fullName || email || 'Someone',
    })
      .then(() => toast(`Assignment email sent to ${r.fullName}`))
      .catch((e) => toast(`Email not sent: ${e.message}`, 'error'));
  }

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

  // Two levels: parent-level tasks (no parentId) group the board; sub-tasks
  // (parentId set) are what the kanban shows, filtered to the active parent.
  const parents = useMemo(() => tasks.filter((t) => !t.parentId), [tasks]);
  const activeParentId = selectedParentId && parents.some((p) => p.taskId === selectedParentId)
    ? selectedParentId
    : (parents[0]?.taskId || '');
  const activeParent = parents.find((p) => p.taskId === activeParentId) || null;
  const subtasks = useMemo(
    () => tasks.filter((t) =>
      t.parentId && t.parentId === activeParentId &&
      (!mineOnly || t.assigneeId === me?.resourceId)
    ),
    [tasks, activeParentId, mineOnly, me]
  );

  // Group sub-tasks by status column, each sorted by boardOrder.
  const byColumn = useMemo(() => {
    const g = Object.fromEntries(COLUMNS.map((c) => [c, []]));
    for (const t of subtasks) (g[t.status] || g.New).push(t);
    for (const c of COLUMNS) g[c].sort((a, b) => (Number(a.boardOrder) || 0) - (Number(b.boardOrder) || 0));
    return g;
  }, [subtasks]);

  function openNewParent() {
    setComment(''); setPendingFiles([]);
    setForm(blankTask(selected, ''));
    setOpen(true);
  }
  function openNewSubtask() {
    setComment(''); setPendingFiles([]);
    setForm(blankTask(selected, activeParentId));
    setOpen(true);
  }
  function openEdit(task) {
    setComment(''); setPendingFiles([]);
    setForm({ ...task });
    setOpen(true);
  }

  // Append a comment to the task's discussion thread (attributed to the
  // signed-in user) and persist immediately.
  async function postComment() {
    const text = comment.trim();
    if (!text || !form?._spId) return;
    const author = me?.fullName || email || 'Unknown';
    const next = [...parseDiscussion(form.discussion), { a: author, t: text, at: new Date().toISOString() }];
    const discussion = JSON.stringify(next);
    await update('ProjectTask', form._spId, { discussion });
    setForm((f) => ({ ...f, discussion }));
    // Email anyone @mentioned (best-effort). Combine people picked from the
    // suggestion list (mentionedMap: covers org-directory users) with local
    // Resource names found in the text — dedup by email.
    const targets = new Map(); // email → name
    Object.entries(mentionedMap).forEach(([name, mail]) => {
      if (mail && text.includes(`@${name}`)) targets.set(mail.toLowerCase(), name);
    });
    data.Resource.forEach((r) => {
      if (r.email && r.fullName && text.includes(`@${r.fullName}`)) targets.set(r.email.toLowerCase(), r.fullName);
    });
    targets.forEach((name, mail) => {
      sendMentionEmail({
        to: mail, toName: name, taskTitle: form.Title,
        projectName: projName, mentionedBy: author, comment: text,
      })
        .then(() => toast(`Mention emailed to ${name}`))
        .catch((e) => toast(`Mention email not sent: ${e.message}`, 'error'));
    });
    setComment('');
    setMentionedMap({});
  }

  // Load the open task's SharePoint attachments.
  useEffect(() => {
    if (!open || !form?._spId) { setAttachments([]); return; }
    let cancelled = false;
    listAttachments('ProjectTask', form._spId)
      .then((a) => { if (!cancelled) setAttachments(a); })
      .catch(() => { if (!cancelled) setAttachments([]); });
    return () => { cancelled = true; };
  }, [open, form?._spId]);

  async function uploadAttachment(file) {
    if (!file || !form?._spId) return;
    setAttachBusy(true);
    try {
      await addAttachment('ProjectTask', form._spId, file);
      setAttachments(await listAttachments('ProjectTask', form._spId));
      toast('Attachment added');
    } catch (e) {
      toast(`Couldn't attach file: ${e.message}`, 'error');
    } finally {
      setAttachBusy(false);
    }
  }
  async function removeAttachment(name) {
    if (!form?._spId) return;
    setAttachBusy(true);
    try {
      await deleteAttachment('ProjectTask', form._spId, name);
      setAttachments((prev) => prev.filter((x) => x.name !== name));
      toast('Attachment removed');
    } catch (e) {
      toast(`Couldn't remove attachment: ${e.message}`, 'error');
    } finally {
      setAttachBusy(false);
    }
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
      // Email the assignee only when the assignment actually changed.
      if (patch.assigneeId && orig?.assigneeId !== patch.assigneeId) emailAssignee(patch.assigneeId, patch);
    } else {
      // New card lands at the bottom of its column; seed the history with the
      // initial status so time-in-stage is measured from creation.
      payload.boardOrder = nextOrder(form.status);
      payload.statusHistory = JSON.stringify([{ s: form.status, at: new Date().toISOString() }]);
      const saved = await create('ProjectTask', payload);
      if (payload.assigneeId) emailAssignee(payload.assigneeId, payload);
      // Upload any files chosen during creation, now that the item exists.
      if (saved?._spId && pendingFiles.length) {
        let failed = 0;
        for (const f of pendingFiles) {
          try { await addAttachment('ProjectTask', saved._spId, f); } catch { failed += 1; }
        }
        if (failed) toast(`${failed} attachment(s) couldn't be uploaded.`, 'error');
        setPendingFiles([]);
      }
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
    if (assigneeId) emailAssignee(assigneeId, task);
    // Heads-up when a hand-off removes the task from a non-manager's board.
    if (!canManageTasks && assigneeId && assigneeId !== me?.resourceId) {
      toast('Task handed off — it will drop off your board.');
    }
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

  // @mention autocomplete: read the text after the last '@' as the query.
  const mentionMatch = /@([^@\n]*)$/.exec(comment);
  const mentionQuery = mentionMatch && !mentionMatch[1].endsWith(' ') ? mentionMatch[1].trim() : null;

  // Search the org directory (debounced) whenever the @query changes. Best-effort:
  // if User.ReadBasic.All isn't consented, we silently fall back to local results.
  useEffect(() => {
    if (mentionQuery === null || mentionQuery.length < 2) { setOrgUsers([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      graphSearchUsers(mentionQuery)
        .then((u) => { if (!cancelled) setOrgUsers(u); })
        .catch(() => { if (!cancelled) setOrgUsers([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [mentionQuery]);

  // Merge local Resource matches with org-directory matches (dedup by email).
  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const local = data.Resource
      .filter((r) => r.fullName && (r.fullName.toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q)))
      .map((r) => ({ key: `r-${r._spId}`, name: r.fullName, email: r.email || '' }));
    const seen = new Set(local.map((m) => m.email.toLowerCase()).filter(Boolean));
    const org = orgUsers
      .map((u) => ({ key: `o-${u.id}`, name: u.displayName, email: u.mail || u.userPrincipalName || '' }))
      .filter((m) => m.name && m.email && !seen.has(m.email.toLowerCase()));
    return [...local, ...org].slice(0, 8);
  }, [mentionQuery, data.Resource, orgUsers]);

  // Insert the picked name and remember its email so we can notify on post.
  const insertMention = (m) => {
    setComment((c) => c.replace(/@([^@\n]*)$/, `@${m.name} `));
    if (m.email) setMentionedMap((prev) => ({ ...prev, [m.name]: m.email }));
  };

  return (
    <div>
      <PageHeader title="Task Board">
        <Select value={selected} onChange={(e) => { setProjectId(e.target.value); setSelectedParentId(''); }} style={{ width: 170 }}>
          {projects.map((p) => <option key={p._spId} value={p.projectId}>{p.projectName || p.name}</option>)}
        </Select>
        <Select value={activeParentId} onChange={(e) => setSelectedParentId(e.target.value)} style={{ width: 190 }} disabled={!parents.length} title="Filter board by parent">
          {parents.length
            ? parents.map((p) => <option key={p._spId} value={p.taskId}>{p.Title || '(untitled parent)'}</option>)
            : <option value="">No parents yet</option>}
        </Select>
        <Button variant={mineOnly ? 'primary' : 'outline'} size="sm" onClick={() => setMineOnly((v) => !v)} disabled={!me} title="Show only tasks assigned to me">My tasks</Button>
        {activeParent && <Button variant="ghost" size="sm" onClick={() => openEdit(activeParent)}>{canManageTasks ? 'Edit parent' : 'View parent'}</Button>}
        {canManageTasks && <Button variant="outline" onClick={openNewParent} disabled={!selected}><Plus size={16} /> New parent</Button>}
        {canManageTasks && <Button onClick={openNewSubtask} disabled={!selected || !parents.length}><Plus size={16} /> New sub-task</Button>}
      </PageHeader>

      {!loading.ProjectTask && selected && !parents.length && (
        <div style={{ marginBottom: 12, padding: '0.7rem 0.9rem', borderRadius: 'var(--radius)', background: 'var(--muted)', color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
          No parent tasks yet. Create a <strong>parent</strong> first, then add sub-tasks under it — the board shows a parent's sub-tasks.
        </div>
      )}

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
                    allowUnassign={canManageTasks}
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
        title={`${form?._spId ? 'Edit' : 'New'} ${form?.parentId ? 'sub-task' : 'parent'}`}
        width={560}
        footer={
          <>
            {canManageTasks && form?._spId && (
              <Button variant="destructive" onClick={del} style={{ marginRight: 'auto' }}>
                <Trash2 size={15} /> Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)}>{canEdit ? 'Cancel' : 'Close'}</Button>
            {canEdit && (locked
              ? <Button onClick={reopen}>Reopen</Button>
              : <Button onClick={save}>{form?._spId ? 'Save' : (form?.parentId ? 'Create sub-task' : 'Create parent')}</Button>)}
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
              <Input value={form.Title} disabled={formLocked} onChange={(e) => setForm({ ...form, Title: e.target.value })} placeholder={form.parentId ? 'What needs doing?' : 'Name this parent'} />
            </Field>
            {form.parentId ? (
              <Field label="Parent">
                <Select value={form.parentId} disabled={formLocked} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
                  {parents.map((p) => <option key={p._spId} value={p.taskId}>{p.Title || '(untitled parent)'}</option>)}
                </Select>
              </Field>
            ) : (
              <div style={{ marginBottom: '0.85rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)', background: 'var(--muted)', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                This is a <strong>parent</strong> task. Sub-tasks added under it appear on the board when it's selected.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Type">
                <Select value={form.workItemType} disabled={formLocked} onChange={(e) => setForm({ ...form, workItemType: e.target.value })}>
                  {TYPES.map((t) => <option key={t}>{t}</option>)}
                </Select>
              </Field>
              <Field label="Category">
                <Select value={form.category || CATEGORIES[0]} disabled={formLocked} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
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
                  {(canManageTasks || !form.assigneeId) && <option value="">Unassigned</option>}
                  {assignedResources.map((r) => <option key={r._spId} value={r.resourceId}>{r.fullName}</option>)}
                </Select>
              </Field>
              <Field label="Reporter">
                <Select value={form.reporterId} disabled={formLocked} onChange={(e) => setForm({ ...form, reporterId: e.target.value })}>
                  <option value="">—</option>
                  {assignedResources.map((r) => <option key={r._spId} value={r.resourceId}>{r.fullName}</option>)}
                </Select>
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
            {form && (
              <div style={{ marginTop: 16 }}>
                <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--muted-foreground)' }}>Attachments</span>
                {form._spId ? (
                  attachments.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>No attachments.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {attachments.map((a) => (
                        <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                          <Paperclip size={14} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
                          <a href={a.url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', wordBreak: 'break-all' }}>{a.name}</a>
                          {canEdit && (
                            <button onClick={() => removeAttachment(a.name)} disabled={attachBusy} aria-label="Remove attachment" title="Remove"
                              style={{ marginLeft: 'auto', display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--destructive)', padding: 2 }}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  pendingFiles.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>No files yet — they'll upload when you create the task.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {pendingFiles.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                          <Paperclip size={14} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
                          <span style={{ wordBreak: 'break-all' }}>{f.name}</span>
                          <button onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove file" title="Remove"
                            style={{ marginLeft: 'auto', display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--destructive)', padding: 2 }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                )}
                {canEdit && (
                  <div style={{ marginTop: 8 }}>
                    <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (form._spId) uploadAttachment(f); else setPendingFiles((prev) => [...prev, f]); }} />
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={attachBusy}>
                      <Paperclip size={14} /> {attachBusy ? 'Working…' : 'Attach file'}
                    </Button>
                  </div>
                )}
              </div>
            )}
            {form._spId && (
              <div style={{ marginTop: 16 }}>
                <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--muted-foreground)' }}>Discussion</span>
                <DiscussionThread comments={parseDiscussion(form.discussion)} />
                {canEdit && (
                  <div style={{ position: 'relative', marginTop: 8 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Input
                        value={comment}
                        placeholder="Write a comment… type @ to mention"
                        onChange={(e) => setComment(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          if (mentionSuggestions.length) { e.preventDefault(); insertMention(mentionSuggestions[0]); }
                          else if (comment.trim()) postComment();
                        }}
                      />
                      <Button onClick={postComment} disabled={!comment.trim()}>Post</Button>
                    </div>
                    {mentionSuggestions.length > 0 && (
                      <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 30, minWidth: 200, overflow: 'hidden' }}>
                        {mentionSuggestions.map((m) => (
                          <button key={m.key} onClick={() => insertMention(m)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.45rem 0.75rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--foreground)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--muted)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{m.name}</div>
                            {m.email && <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>{m.email}</div>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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

function TaskCard({ task, assignee, dragging, onDragStart, onDragEnd, onDrop, onClick, onStatusChange, onAssigneeChange, resources, canEdit, allowUnassign }) {
  const TypeIcon = task.workItemType === 'Bug' ? Bug : CheckSquare;
  const typeColor = task.workItemType === 'Bug' ? 'var(--rag-red)' : 'var(--accent)';
  const initials = (assignee || '').split(' ').map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
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
        {assignee && (
          <span title={`Assigned to ${assignee}`} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '60%' }}>
            <span style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, background: 'var(--primary)', color: 'var(--primary-foreground)', fontSize: '0.6rem', fontWeight: 700, display: 'grid', placeItems: 'center' }}>{initials}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assignee.split(' ')[0]}</span>
          </span>
        )}
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
          {(allowUnassign || !task.assigneeId) && <option value="">Unassigned</option>}
          {assigneeOptions.map((r) => <option key={r._spId} value={r.resourceId}>{r.fullName}</option>)}
        </select>
      </div>
    </Card>
  );
}

// Comment thread rendered from the task's discussion JSON, newest last.
function DiscussionThread({ comments }) {
  if (!comments.length) {
    return <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>No comments yet.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {comments.map((c, i) => (
        <div key={i} style={{ background: 'var(--muted)', borderRadius: 'var(--radius)', padding: '0.5rem 0.7rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{c.a || 'Unknown'}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>{fmtDateTime(c.at)}</span>
          </div>
          <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{c.t}</div>
        </div>
      ))}
    </div>
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
