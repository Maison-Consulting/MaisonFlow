import React, { useState, useMemo } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Button, Input, Select, Field, Skeleton } from '../components/ui/primitives.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { PageHeader } from '../components/Layout.jsx';

export function ResourceSkills() {
  const { data, loading, create, remove } = useData();
  const { canWrite } = useAuth();
  const canEdit = canWrite('ResourceSkill');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const skillName = (id) => {
    const s = data.Skill.find((x) => x.skillId === id);
    return s?.name || s?.skillName || id;
  };

  // Group resource-skill links by resource, filtered by search (resource name or skill name).
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.Resource.map((res) => ({
      res,
      links: data.ResourceSkill.filter((rs) => rs.resourceId === res.resourceId),
    }))
      .filter(({ res, links }) => {
        if (!q) return true;
        if (res.fullName?.toLowerCase().includes(q)) return true;
        return links.some((l) => skillName(l.skillId).toLowerCase().includes(q));
      })
      .filter(({ links }) => links.length > 0 || !q);
  }, [data.Resource, data.ResourceSkill, data.Skill, search]);

  function openNew() {
    setError('');
    setForm({ resourceId: data.Resource[0]?.resourceId || '', skillId: data.Skill[0]?.skillId || '', proficiency: 3, yearsExperience: 0 });
    setOpen(true);
  }
  function openForResource(resourceId) {
    setError('');
    setForm({ resourceId, skillId: data.Skill[0]?.skillId || '', proficiency: 3, yearsExperience: 0, lockResource: true });
    setOpen(true);
  }

  function validate(f) {
    if (!f.resourceId) return 'Resource is required.';
    if (!f.skillId) return 'Skill is required.';
    if (f.proficiency === '' || f.proficiency == null) return 'Proficiency is required.';
    const prof = Number(f.proficiency);
    if (Number.isNaN(prof) || prof < 1 || prof > 5) return 'Proficiency must be between 1 and 5.';
    if (f.yearsExperience === '' || f.yearsExperience == null) return 'Years experience is required.';
    const years = Number(f.yearsExperience);
    if (Number.isNaN(years) || years < 0) return 'Years experience must be 0 or greater.';
    const dupe = data.ResourceSkill.some((r) => r.resourceId === f.resourceId && r.skillId === f.skillId);
    if (dupe) return 'This skill is already linked to that resource.';
    return '';
  }

  async function save() {
    const msg = validate(form);
    if (msg) { setError(msg); return; }
    setError('');
    setSaving(true);
    try {
      const { lockResource, ...payload } = form;
      await create('ResourceSkill', { ...payload, proficiency: Number(payload.proficiency), yearsExperience: Number(payload.yearsExperience) });
      setOpen(false);
    } catch (e) {
      setError(e?.message || 'Failed to add skill. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Resource Skills" />
      <p style={{ color: 'var(--muted-foreground)', margin: '-0.75rem 0 1.25rem', fontSize: '0.9rem' }}>Skills held per resource</p>

      {/* Toolbar */}
      <Card style={{ padding: '0.9rem 1.1rem', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Input placeholder="Search resource or skill…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 320, maxWidth: '100%' }} />
        {canEdit && <Button onClick={openNew} style={{ marginLeft: 'auto' }}><Plus size={16} /> Add Skill to Resource</Button>}
      </Card>

      {loading.ResourceSkill || loading.Resource ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          <Skeleton height={180} /><Skeleton height={180} />
        </div>
      ) : grouped.length === 0 ? (
        <Card style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>No resources found.</Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {grouped.map(({ res, links }) => (
            <Card key={res._spId} style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>{res.fullName}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, border: '1px solid var(--border)', borderRadius: 999, padding: '0.15rem 0.6rem', whiteSpace: 'nowrap' }}>
                    {links.length} {links.length === 1 ? 'skill' : 'skills'}
                  </span>
                  {canEdit && (
                    <button onClick={() => openForResource(res.resourceId)} aria-label="Add skill to this resource" title="Add skill to this resource"
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
                    <span key={l._spId} title={`Proficiency ${l.proficiency}/5 · ${l.yearsExperience || 0} yrs`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.4rem 0.7rem', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600 }}>
                      {skillName(l.skillId)}
                      <span style={{ color: 'var(--secondary)', fontSize: '0.8rem' }}>{Number(l.proficiency) || 0}/5</span>
                      {canEdit && (
                        <button onClick={() => remove('ResourceSkill', l._spId)} aria-label="Remove skill"
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

      <Dialog open={open} onClose={() => !saving && setOpen(false)} title="Add skill to resource"
        footer={<>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Adding…' : 'Add'}</Button>
        </>}>
        {form && <>
          {error && (
            <div style={{ marginBottom: '0.85rem', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius)', background: 'oklch(0.60 0.22 25 / 0.1)', border: '1px solid var(--destructive)', color: 'var(--foreground)', fontSize: '0.82rem' }}>
              {error}
            </div>
          )}
          <Field label="Resource" required>
            <Select value={form.resourceId} disabled={form.lockResource} onChange={(e) => setForm({ ...form, resourceId: e.target.value })}>
              {data.Resource.map((r) => <option key={r._spId} value={r.resourceId}>{r.fullName}</option>)}
            </Select>
          </Field>
          <Field label="Skill" required>
            <Select value={form.skillId} onChange={(e) => setForm({ ...form, skillId: e.target.value })}>
              {data.Skill.map((s) => <option key={s._spId} value={s.skillId}>{s.name || s.skillName}</option>)}
            </Select>
          </Field>
          <Field label={`Proficiency (${form.proficiency}/5)`} required>
            <Input type="range" min={1} max={5} value={form.proficiency} onChange={(e) => setForm({ ...form, proficiency: e.target.value })} />
          </Field>
          <Field label="Years experience" required>
            <Input type="number" min={0} value={form.yearsExperience} onChange={(e) => setForm({ ...form, yearsExperience: e.target.value })} />
          </Field>
        </>}
      </Dialog>
    </div>
  );
}
