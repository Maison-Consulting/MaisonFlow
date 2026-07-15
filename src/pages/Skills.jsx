import React, { useState, useMemo } from 'react';
import { Plus, LayoutGrid, List, SquarePen, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Button, Input, Select, Textarea, Field, Skeleton } from '../components/ui/primitives.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';

const CATEGORIES = ['Development', 'Functional', 'PM', 'Soft Skills', 'Infra'];
const EMPTY = { name: '', category: 'Development', description: '' };

// Tolerate legacy rows that stored the name under `skillName` instead of `name`.
const nameOf = (s) => s.name || s.skillName || '';

// Tinted badge colors per category (with a cycling fallback for unknown ones).
const CAT_COLORS = {
  Engineering: { bg: 'oklch(0.93 0.05 25)', fg: 'oklch(0.52 0.18 25)' },
  Design: { bg: 'oklch(0.93 0.07 70)', fg: 'oklch(0.52 0.14 55)' },
  PM: { bg: 'oklch(0.92 0.06 195)', fg: 'oklch(0.48 0.10 200)' },
  Data: { bg: 'oklch(0.94 0.09 95)', fg: 'oklch(0.52 0.12 90)' },
  Cloud: { bg: 'oklch(0.92 0.06 250)', fg: 'oklch(0.50 0.14 260)' },
  Developer: { bg: 'oklch(0.92 0.06 265)', fg: 'oklch(0.48 0.16 265)' },
  Development: { bg: 'oklch(0.92 0.06 265)', fg: 'oklch(0.48 0.16 265)' },
  Functional: { bg: 'oklch(0.92 0.07 320)', fg: 'oklch(0.50 0.16 325)' },
};
const FALLBACK = [
  { bg: 'oklch(0.93 0.05 145)', fg: 'oklch(0.48 0.12 150)' },
  { bg: 'oklch(0.92 0.06 30)', fg: 'oklch(0.52 0.16 30)' },
  { bg: 'oklch(0.92 0.06 290)', fg: 'oklch(0.50 0.15 290)' },
];
const catColor = (cat, i) => CAT_COLORS[cat] || FALLBACK[i % FALLBACK.length];

export function Skills() {
  const { data, loading, create, update, remove } = useData();
  const { canWrite } = useAuth();
  const canEdit = canWrite('Skill');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null | {} | row
  const [form, setForm] = useState(EMPTY);
  const [view, setView] = useState('grid');

  // Group skills by category; known categories first, then any extras.
  const groups = useMemo(() => {
    const cats = [...new Set(data.Skill.map((s) => s.category || 'Other'))];
    const ord = (c) => { const i = CATEGORIES.indexOf(c); return i === -1 ? 999 : i; };
    cats.sort((a, b) => ord(a) - ord(b) || a.localeCompare(b));
    return cats.map((cat, i) => ({
      cat, color: catColor(cat, i),
      items: data.Skill.filter((s) => (s.category || 'Other') === cat),
    }));
  }, [data.Skill]);

  function openCreate() { setForm(EMPTY); setEditing({}); setOpen(true); }
  function openEdit(row) { setForm({ name: nameOf(row), category: row.category || 'Development', description: row.description || '' }); setEditing(row); setOpen(true); }

  async function save() {
    if (!form.name.trim()) return;
    if (editing?._spId) await update('Skill', editing._spId, form);
    else await create('Skill', form);
    setOpen(false);
  }

  function isReferenced(skillId) {
    return data.ResourceSkill.some((r) => r.skillId === skillId) || data.ProjectSkill.some((r) => r.skillId === skillId);
  }
  async function del(row) {
    if (isReferenced(row.skillId) && !window.confirm('This skill is referenced by resources or projects. Delete anyway?')) return;
    await remove('Skill', row._spId);
    setOpen(false);
  }

  return (
    <div>
      {/* Header: title + subtitle, view toggle, add */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>Skills catalog</h1>
          <p style={{ color: 'var(--muted-foreground)', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
            The vocabulary of capabilities used to staff projects.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'inline-flex', background: 'var(--muted)', borderRadius: 'var(--radius)', padding: 3 }}>
            <Toggle active={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid size={15} /> Grid</Toggle>
            <Toggle active={view === 'table'} onClick={() => setView('table')}><List size={15} /> Table</Toggle>
          </div>
          {canEdit && <Button onClick={openCreate}><Plus size={16} /> Add skill</Button>}
        </div>
      </div>

      {loading.Skill ? (
        <Card style={{ padding: '1.25rem' }}><Skeleton height={120} /></Card>
      ) : data.Skill.length === 0 ? (
        <Card style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>No skills yet. Add your first skill.</Card>
      ) : view === 'grid' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groups.map(({ cat, color, items }) => (
            <Card key={cat} style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem' }}>
                <span style={{ background: color.bg, color: color.fg, padding: '0.2rem 0.7rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700 }}>{cat}</span>
                <span style={{ color: 'var(--muted-foreground)', fontWeight: 600, fontSize: '0.9rem' }}>{items.length} {items.length === 1 ? 'skill' : 'skills'}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {items.map((s) => (
                  <button
                    key={s._spId}
                    onClick={() => canEdit && openEdit(s)}
                    title={canEdit ? 'Edit skill' : nameOf(s)}
                    style={{
                      padding: '0.55rem 1rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)',
                      color: 'var(--foreground)', fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer', minWidth: 100, textAlign: 'left',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--muted)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--card)')}
                  >
                    {nameOf(s)}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'var(--muted)' }}>
                  <Th>Skill</Th><Th>Type</Th><Th>Description</Th>{canEdit && <Th style={{ textAlign: 'right' }}>Actions</Th>}
                </tr>
              </thead>
              <tbody>
                {data.Skill.map((s) => (
                  <tr key={s._spId} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>{nameOf(s)}</td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <span style={{ display: 'inline-block', padding: '0.15rem 0.6rem', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--card)', fontSize: '0.75rem', fontWeight: 600 }}>{s.category || '—'}</span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', color: 'var(--muted-foreground)' }}>{s.description || '—'}</td>
                    {canEdit && (
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(s)} aria-label="Edit skill"><SquarePen size={16} /></Button>
                          <Button variant="ghost" size="icon" onClick={() => del(s)} aria-label="Delete skill"><Trash2 size={16} /></Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={editing?._spId ? 'Edit skill' : 'Add skill'}
        footer={<>
          {editing?._spId && <Button variant="destructive" onClick={() => del(editing)} style={{ marginRight: 'auto' }}>Delete</Button>}
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save}>{editing?._spId ? 'Save changes' : 'Add'}</Button>
        </>}>
        <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Type">
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      </Dialog>
    </div>
  );
}

function Toggle({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.35rem 0.8rem', borderRadius: 'calc(var(--radius) - 0.25rem)',
      border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
      background: active ? 'var(--card)' : 'transparent', color: active ? 'var(--primary)' : 'var(--muted-foreground)',
      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
    }}>{children}</button>
  );
}

function Th({ children, style }) {
  return (
    <th style={{
      textAlign: 'left', padding: '0.7rem 1rem', color: 'var(--muted-foreground)',
      fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', ...style,
    }}>{children}</th>
  );
}
