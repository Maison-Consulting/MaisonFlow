import React, { useState, useMemo } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Button, Input, Select, Field, Skeleton } from '../components/ui/primitives.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { PageHeader } from '../components/Layout.jsx';

export function ProjectSkills() {
  const { data, loading, create, remove } = useData();
  const { canWrite, canManageProject } = useAuth();
  const canEdit = canWrite('ProjectSkill');
  // Skills can only be managed on projects the user leads (or as Admin).
  const canManage = (pid) => canEdit && canManageProject(pid);
  const manageableProjects = data.Project.filter((p) => canManageProject(p.projectId));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [filterProject, setFilterProject] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const projName = (id) => { const p = data.Project.find((x) => x.projectId === id); return p?.projectName || p?.name || id; };
  const skillName = (id) => { const s = data.Skill.find((x) => x.skillId === id); return s?.name || s?.skillName || id; };

  // One group per project (filtered), with its required-skill links.
  const grouped = useMemo(() =>
    data.Project
      .filter((p) => !filterProject || p.projectId === filterProject)
      .map((proj) => ({
        proj,
        links: data.ProjectSkill.filter((ps) => ps.projectId === proj.projectId),
      })),
    [data.Project, data.ProjectSkill, filterProject]);

  function openNew() {
    setError('');
    const defaultProject = (filterProject && canManageProject(filterProject)) ? filterProject : (manageableProjects[0]?.projectId || '');
    setForm({ projectId: defaultProject, skillId: data.Skill[0]?.skillId || '', minProficiency: 3, hoursNeeded: '' });
    setOpen(true);
  }
  function openForProject(projectId) {
    setError('');
    setForm({ projectId, skillId: data.Skill[0]?.skillId || '', minProficiency: 3, hoursNeeded: '', lockProject: true });
    setOpen(true);
  }

  function validate(f) {
    if (!f.projectId) return 'Project is required.';
    if (!f.skillId) return 'Skill is required.';
    if (f.minProficiency === '' || f.minProficiency == null) return 'Min proficiency is required.';
    const prof = Number(f.minProficiency);
    if (Number.isNaN(prof) || prof < 1 || prof > 5) return 'Min proficiency must be between 1 and 5.';
    if (f.hoursNeeded === '' || f.hoursNeeded == null) return 'Hours needed is required.';
    const hrs = Number(f.hoursNeeded);
    if (Number.isNaN(hrs) || hrs < 1) return 'Hours needed must be 1 or greater.';
    const dupe = data.ProjectSkill.some((r) => r.projectId === f.projectId && r.skillId === f.skillId);
    if (dupe) return 'This skill is already required for that project.';
    return '';
  }

  async function save() {
    const msg = validate(form);
    if (msg) { setError(msg); return; }
    setError('');
    setSaving(true);
    try {
      const { lockProject, ...payload } = form;
      await create('ProjectSkill', { ...payload, minProficiency: Number(payload.minProficiency), hoursNeeded: Number(payload.hoursNeeded) });
      setOpen(false);
    } catch (e) {
      setError(e?.message || 'Failed to add skill. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Project Skills" />
      <p style={{ color: 'var(--muted-foreground)', margin: '-0.75rem 0 1.25rem', fontSize: '0.9rem' }}>Skills required per project</p>

      {/* Toolbar */}
      <Card style={{ padding: '0.9rem 1.1rem', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} style={{ width: 320, maxWidth: '100%' }}>
          <option value="">All Projects</option>
          {data.Project.map((p) => <option key={p._spId} value={p.projectId}>{projName(p.projectId)}</option>)}
        </Select>
        {canEdit && manageableProjects.length > 0 && <Button onClick={openNew} style={{ marginLeft: 'auto' }}><Plus size={16} /> Add Skill to Project</Button>}
      </Card>

      {loading.ProjectSkill || loading.Project ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          <Skeleton height={180} /><Skeleton height={180} />
        </div>
      ) : grouped.length === 0 ? (
        <Card style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>No projects found.</Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {grouped.map(({ proj, links }) => (
            <Card key={proj._spId} style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>{projName(proj.projectId)}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, border: '1px solid var(--border)', borderRadius: 999, padding: '0.15rem 0.6rem', whiteSpace: 'nowrap' }}>
                    {links.length} {links.length === 1 ? 'skill' : 'skills'}
                  </span>
                  {canManage(proj.projectId) && (
                    <button onClick={() => openForProject(proj.projectId)} aria-label="Add skill to this project" title="Add skill to this project"
                      style={{ display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--rag-green)', padding: 2 }}>
                      <Sparkles size={18} />
                    </button>
                  )}
                </div>
              </div>

              {links.length === 0 ? (
                <div style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>No skills yet.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {links.map((l) => (
                    <span key={l._spId} title={`Min proficiency ${l.minProficiency}/5 · ${l.hoursNeeded}h`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.4rem 0.7rem', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600 }}>
                      {skillName(l.skillId)}
                      {canManage(proj.projectId) && (
                        <button onClick={() => remove('ProjectSkill', l._spId)} aria-label="Remove skill"
                          style={{ display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 0 }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Add Skill to Project"
        footer={<>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Adding…' : 'Add'}</Button>
        </>}>
        {form && <>
          {error && (
            <div style={{ marginBottom: '0.85rem', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius)', background: 'oklch(0.60 0.22 25 / 0.1)', border: '1px solid var(--destructive)', color: 'var(--foreground)', fontSize: '0.82rem' }}>
              {error}
            </div>
          )}
          <Field label="Project" required>
            <Select value={form.projectId} disabled={form.lockProject} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              {manageableProjects.map((p) => <option key={p._spId} value={p.projectId}>{projName(p.projectId)}</option>)}
            </Select>
          </Field>
          <Field label="Skill" required>
            <Select value={form.skillId} onChange={(e) => setForm({ ...form, skillId: e.target.value })}>
              {data.Skill.map((s) => <option key={s._spId} value={s.skillId}>{s.name || s.skillName}</option>)}
            </Select>
          </Field>
          <Field label={`Min proficiency (${form.minProficiency}/5)`} required>
            <Input type="range" min={1} max={5} value={form.minProficiency} onChange={(e) => setForm({ ...form, minProficiency: e.target.value })} />
          </Field>
          <Field label="Hours needed" required>
            <Input type="number" min={1} value={form.hoursNeeded} onChange={(e) => setForm({ ...form, hoursNeeded: e.target.value })} />
          </Field>
        </>}
      </Dialog>
    </div>
  );
}
