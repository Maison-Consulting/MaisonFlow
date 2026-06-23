import React, { useState, useMemo, useEffect } from 'react';
import { Sparkles, CalendarDays, Box, Plus, Check, Award, Users, Wand2 } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { Card, Button, Select } from '../components/ui/primitives.jsx';
import { PageHeader } from '../components/Layout.jsx';

const LEVELS = ['—', 'Beginner', 'Basic', 'Intermediate', 'Advanced', 'Expert'];
const levelLabel = (n) => LEVELS[Math.max(0, Math.min(5, Number(n) || 0))];
const todayISO = () => new Date().toISOString().slice(0, 10);

const projName = (p) => p?.projectName || p?.name || '';
const skillNameOf = (s) => s?.name || s?.skillName || '';

// Does an assignment overlap the [from, to] window? `to` empty = open-ended.
function overlaps(a, from, to) {
  const as = a.startDate ? a.startDate.slice(0, 10) : null;
  const ae = a.endDate ? a.endDate.slice(0, 10) : null;
  if (to && as && as > to) return false;
  if (from && ae && ae < from) return false;
  return true;
}

export function SmartSuggest() {
  const { data, create } = useData();
  const [projectId, setProjectId] = useState('');
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState('');
  const [region, setRegion] = useState('All');
  const [type, setType] = useState('All');
  const [selectedSkills, setSelectedSkills] = useState(() => new Set());
  const [addingSkill, setAddingSkill] = useState(false);
  const [combo, setCombo] = useState(false);
  const [teamSize, setTeamSize] = useState('auto');

  const project = useMemo(
    () => data.Project.find((p) => p.projectId === projectId) || data.Project[0],
    [data.Project, projectId]
  );
  const product = project?.product || '';

  const skillName = (id) => skillNameOf(data.Skill.find((s) => s.skillId === id)) || id;

  // Required skills for the project.
  const required = useMemo(
    () => (project ? data.ProjectSkill.filter((ps) => ps.projectId === project.projectId) : []),
    [data.ProjectSkill, project]
  );

  // Reset selection to "all required" whenever the project changes.
  useEffect(() => {
    setSelectedSkills(new Set(required.map((r) => r.skillId)));
  }, [project?.projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const regions = useMemo(() => ['All', ...new Set(data.Resource.map((r) => r.location).filter(Boolean))], [data.Resource]);
  const types = useMemo(() => ['All', ...new Set(data.Resource.map((r) => r.role).filter(Boolean))], [data.Resource]);

  const selectedRequired = required.filter((r) => selectedSkills.has(r.skillId));

  // Rank candidate resources for the selected project / window / filters.
  const ranked = useMemo(() => {
    if (!project) return [];
    const reqBySkill = new Map(selectedRequired.map((r) => [r.skillId, r]));

    return data.Resource
      .filter((r) => region === 'All' || r.location === region)
      .filter((r) => type === 'All' || r.role === type)
      // Restrict to the project's product when both sides declare one.
      .filter((r) => !product || !r.product || r.product === product)
      // Exclude anyone already on THIS project within the window.
      .filter((r) => !data.ProjectAssignment.some(
        (a) => a.resourceId === r.resourceId && a.projectId === project.projectId && overlaps(a, from, to)
      ))
      .map((r) => {
        const allocated = data.ProjectAssignment
          .filter((a) => a.resourceId === r.resourceId && overlaps(a, from, to))
          .reduce((s, a) => s + Number(a.allocationPercent || 0), 0);
        const availability = Math.max(0, 100 - allocated);

        const rSkills = data.ResourceSkill.filter((rs) => rs.resourceId === r.resourceId);
        const matched = [];
        let profSum = 0;
        reqBySkill.forEach((req, skillId) => {
          const rs = rSkills.find((x) => x.skillId === skillId);
          if (rs) {
            const prof = Number(rs.proficiency || 0);
            profSum += prof;
            matched.push({ skillId, prof, meets: prof >= Number(req.minProficiency || 0) });
          }
        });
        const coverage = selectedRequired.length ? matched.length / selectedRequired.length : 0;
        const score = matched.length * 50 + profSum * 10 + availability;
        return {
          res: r, availability, matched, matchedIds: matched.map((m) => m.skillId),
          coverage, profSum, skillCount: rSkills.length, score: Math.round(score),
        };
      })
      .filter((c) => c.matched.length > 0)
      .sort((a, b) => b.score - a.score);
  }, [project, data, region, type, product, from, to, selectedRequired]);

  // Greedy set-cover to build the smallest team covering all selected skills.
  const bestTeam = useMemo(() => {
    if (!combo) return null;
    const need = new Set(selectedRequired.map((r) => r.skillId));
    const total = need.size;
    const pool = [...ranked];
    const team = [];
    const fixed = teamSize !== 'auto';
    const cap = fixed ? Number(teamSize) : pool.length;
    // Auto: stop once all skills are covered. Fixed: keep filling up to the chosen size.
    while (team.length < cap && (fixed || need.size)) {
      let best = null, bestGain = 0, bestScore = -1;
      for (const c of pool) {
        if (team.includes(c)) continue;
        const gain = c.matchedIds.filter((id) => need.has(id)).length;
        const tie = c.availability + c.profSum;
        if (gain > bestGain || (gain === bestGain && tie > bestScore)) { best = c; bestGain = gain; bestScore = tie; }
      }
      if (!best || bestGain === 0) {
        // No more skill gains — for a fixed team size, fill remaining slots by score.
        if (fixed) { const next = pool.find((c) => !team.includes(c)); if (next) { team.push(next); continue; } }
        break;
      }
      team.push(best);
      best.matchedIds.forEach((id) => need.delete(id));
    }
    return { team, covered: total - need.size, total };
  }, [combo, teamSize, ranked, selectedRequired]);

  async function assign(c) {
    await create('ProjectAssignment', {
      projectId: project.projectId,
      resourceId: c.res.resourceId,
      allocationPercent: c.availability || 100,
      startDate: from,
      endDate: to || '',
      role: c.res.role || '',
    });
  }

  function toggleSkill(id) {
    setSelectedSkills((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAll() { setSelectedSkills(new Set(required.map((r) => r.skillId))); }
  function clearAll() { setSelectedSkills(new Set()); }

  // Skills not yet required for this project (for the "+ Add skill" picker).
  const addable = data.Skill.filter((s) => !required.some((r) => r.skillId === s.skillId));
  async function addSkill(skillId) {
    setAddingSkill(false);
    if (!skillId) return;
    const saved = await create('ProjectSkill', { projectId: project.projectId, skillId, minProficiency: 3, hoursNeeded: 1 });
    if (saved?.skillId) setSelectedSkills((s) => new Set(s).add(saved.skillId));
  }

  if (!data.Project.length) {
    return (
      <div>
        <PageHeader title="Smart Suggest" />
        <Card style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>Create a project first.</Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Smart Suggest" />
      <p style={{ color: 'var(--muted-foreground)', margin: '-0.75rem 0 1.25rem', fontSize: '0.9rem' }}>AI-powered resource recommendations</p>

      {/* Intro banner */}
      <Card style={{ display: 'flex', gap: 14, padding: '1.25rem', marginBottom: 16, background: 'linear-gradient(90deg, oklch(0.95 0.03 250), oklch(0.96 0.03 150))' }}>
        <div style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12, background: 'var(--primary)', color: 'var(--primary-foreground)', display: 'grid', placeItems: 'center' }}>
          <Sparkles size={22} />
        </div>
        <div>
          <strong style={{ fontSize: '1.1rem' }}>AI-Powered Resource Suggestions</strong>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--muted-foreground)', fontSize: '0.88rem', lineHeight: 1.5 }}>
            Suggestions are restricted to the project's <strong>product</strong>, exclude anyone already assigned to this
            project in the selected date window, and are ranked by skill match, availability and product expertise.
            Toggle skill chips to refine the matching criteria.
          </p>
        </div>
      </Card>

      {/* Controls */}
      <Card style={{ padding: '1.5rem', marginBottom: 16 }}>
        <Row label="Project:">
          <Select value={project?.projectId || ''} onChange={(e) => setProjectId(e.target.value)} style={{ flex: 1, maxWidth: 520 }}>
            {data.Project.map((p) => <option key={p._spId} value={p.projectId}>{projName(p)}</option>)}
          </Select>
          {product && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.35rem 0.7rem', borderRadius: 8, border: '1px solid var(--border)', background: 'oklch(0.95 0.03 250)', color: 'var(--primary)', fontSize: '0.82rem', fontWeight: 600 }}>
              <Box size={14} /> Product: {product}
            </span>
          )}
        </Row>

        <Divider />

        <Row label={<><CalendarDays size={16} /> Assignment window:</>}>
          <div>
            <FieldLabel>FROM</FieldLabel>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={dateStyle} />
          </div>
          <div>
            <FieldLabel>TO (OPTIONAL)</FieldLabel>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={dateStyle} />
          </div>
        </Row>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 14 }}>
          <PillGroup label="Region:" options={regions} value={region} onChange={setRegion} />
          <PillGroup label="Type:" options={types} value={type} onChange={setType} />
        </div>

        <Divider />

        {/* Required skills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Required skills</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, border: '1px solid var(--border)', borderRadius: 999, padding: '0.1rem 0.5rem' }}>{selectedRequired.length}/{required.length} selected</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
            <button onClick={selectAll} style={linkStyle}>Select all</button>
            <button onClick={clearAll} style={{ ...linkStyle, color: 'var(--foreground)', fontWeight: 700 }}>Clear</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {required.map((r) => {
            const on = selectedSkills.has(r.skillId);
            return (
              <button key={r._spId} onClick={() => toggleSkill(r.skillId)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.8rem', borderRadius: 999, cursor: 'pointer',
                fontSize: '0.85rem', fontWeight: 600,
                border: '1px solid ' + (on ? 'transparent' : 'var(--border)'),
                background: on ? 'var(--primary)' : 'var(--card)', color: on ? 'var(--primary-foreground)' : 'var(--foreground)',
              }}>
                {on && <Check size={14} />} {skillName(r.skillId)}
              </button>
            );
          })}
          {required.length === 0 && <span style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>No required skills yet — add some.</span>}
          {addingSkill ? (
            <Select autoFocus value="" onChange={(e) => addSkill(e.target.value)} onBlur={() => setAddingSkill(false)} style={{ width: 200 }}>
              <option value="">Select a skill…</option>
              {addable.map((s) => <option key={s._spId} value={s.skillId}>{skillNameOf(s)}</option>)}
            </Select>
          ) : (
            <button onClick={() => setAddingSkill(true)} disabled={!addable.length} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.4rem 0.8rem', borderRadius: 999, cursor: 'pointer',
              fontSize: '0.85rem', fontWeight: 600, border: '1px dashed var(--primary)', background: 'transparent', color: 'var(--primary)',
            }}><Plus size={14} /> Add skill</button>
          )}
        </div>

        <Divider />

        {/* Best-combination toggle */}
        <label style={{
          display: 'flex', gap: 12, alignItems: 'flex-start', padding: '0.9rem 1rem', borderRadius: 'var(--radius)', cursor: 'pointer',
          border: '1px solid ' + (combo ? 'var(--rag-green)' : 'var(--border)'),
          background: combo ? 'oklch(0.96 0.05 150)' : 'transparent',
        }}>
          <input type="checkbox" checked={combo} onChange={(e) => setCombo(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><Wand2 size={16} style={{ color: 'var(--rag-green)' }} /> Suggest best combination according to skills and availability</div>
            <div style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem', marginTop: 2 }}>
              Builds a team of one or more resources that together covers the selected skills, preferring higher skill levels and more remaining capacity in the chosen window.
            </div>
          </div>
        </label>

        {combo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600 }}><Users size={15} /> Team size:</span>
            <TeamPill active={teamSize === 'auto'} onClick={() => setTeamSize('auto')}>Auto (smallest)</TeamPill>
            {[1, 2, 3, 4, 5, 6].map((n) => <TeamPill key={n} active={teamSize === n} onClick={() => setTeamSize(n)}>{n}</TeamPill>)}
            <span style={{ color: 'var(--muted-foreground)', fontSize: '0.82rem' }}>
              {teamSize === 'auto' ? 'Picks the smallest team that covers all selected skills.' : `Builds a team of up to ${teamSize}.`}
            </span>
          </div>
        )}
      </Card>

      {/* Best combination result */}
      {combo && bestTeam && (
        <Card style={{ padding: '1.5rem', marginBottom: 16, background: 'oklch(0.97 0.03 150)', border: '1px solid var(--rag-green)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <Wand2 size={18} style={{ color: 'var(--rag-green)' }} />
            <strong style={{ fontSize: '1.05rem' }}>Best Combination</strong>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 600, border: '1px solid var(--border)', borderRadius: 999, padding: '0.1rem 0.55rem', background: 'var(--card)' }}>
              <Users size={13} /> {bestTeam.team.length} resource{bestTeam.team.length === 1 ? '' : 's'}
            </span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.82rem', fontWeight: 700, color: '#fff', background: 'var(--rag-green)', borderRadius: 999, padding: '0.2rem 0.7rem' }}>
              <Check size={14} /> {bestTeam.covered}/{bestTeam.total} skills covered ({bestTeam.total ? Math.round((bestTeam.covered / bestTeam.total) * 100) : 0}%)
            </span>
          </div>
          {bestTeam.team.length === 0 ? (
            <div style={{ color: 'var(--muted-foreground)', fontSize: '0.88rem' }}>No combination of candidates covers the selected skills.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {bestTeam.team.map((c, i) => (
                <div key={c.res._spId} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <RankBadge n={i + 1} color="var(--rag-green)" />
                    <strong>{c.res.fullName}</strong>
                    <span style={{ marginLeft: 'auto', fontSize: '0.78rem', fontWeight: 600, border: '1px solid var(--border)', borderRadius: 999, padding: '0.1rem 0.55rem' }}>{c.availability}% free</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {c.matched.map((m) => (
                      <span key={m.skillId} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.3rem 0.6rem', borderRadius: 999, border: '1px solid var(--rag-green)', background: 'oklch(0.96 0.05 150)', fontSize: '0.8rem', fontWeight: 600 }}>
                        <Check size={13} style={{ color: 'var(--rag-green)' }} /> {skillName(m.skillId)}
                      </span>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => assign(c)}><Plus size={14} /> Assign</Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Ranked candidates */}
      {selectedRequired.length === 0 ? (
        <Card style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>Select at least one required skill to see suggestions.</Card>
      ) : ranked.length === 0 ? (
        <Card style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>No matching resources for these criteria.</Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {ranked.map((c, i) => {
            const best = combo && bestTeam?.team.includes(c);
            const coveragePct = Math.round(c.coverage * 100);
            return (
              <Card key={c.res._spId} style={{ padding: '1.25rem', border: best ? '1px solid var(--rag-green)' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <RankBadge n={i + 1} color={i === 0 ? 'var(--rag-green)' : 'var(--primary)'} />
                  <strong style={{ fontSize: '1.02rem' }}>{c.res.fullName}</strong>
                  {best && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700, color: '#fff', background: 'var(--rag-green)', borderRadius: 999, padding: '0.1rem 0.5rem' }}><Wand2 size={11} /> Best</span>}
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--rag-green)', fontWeight: 700, fontSize: '0.9rem' }}>
                    <Award size={16} /> {c.score}
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {c.res.location && <Tag>{c.res.location}</Tag>}
                  {c.res.role && <Tag>{c.res.role}</Tag>}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.15rem 0.55rem', borderRadius: 999, border: '1px solid var(--rag-green)', background: 'oklch(0.96 0.05 150)', fontSize: '0.75rem', fontWeight: 600 }}>
                    <Box size={12} /> {c.res.product ? `${c.res.product} · ` : ''}{c.skillCount} skills
                  </span>
                </div>

                <Meter label="Available in window" pct={c.availability} />
                <div style={{ height: 10 }} />
                <Meter label="Skill coverage" pct={coveragePct} />

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0 14px' }}>
                  {c.matched.map((m) => (
                    <span key={m.skillId} style={{
                      padding: '0.22rem 0.55rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, color: '#fff',
                      background: m.meets ? 'var(--rag-green)' : 'var(--primary)',
                    }}>
                      {skillName(m.skillId)} · {levelLabel(m.prof)}
                    </span>
                  ))}
                </div>

                <Button onClick={() => assign(c)} style={{ width: '100%' }}><Plus size={16} /> Assign to Project</Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── small presentational helpers ──────────────────────────────────────────
const dateStyle = {
  padding: '0.5rem 0.7rem', borderRadius: 'calc(var(--radius) - 0.25rem)', border: '1px solid var(--input)',
  background: 'var(--card)', color: 'var(--foreground)', fontSize: '0.9rem', minWidth: 200,
};
const linkStyle = { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: 'var(--muted-foreground)' };

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 110, fontWeight: 600, fontSize: '0.9rem' }}>{label}</span>
      {children}
    </div>
  );
}
function FieldLabel({ children }) {
  return <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--muted-foreground)', marginBottom: 4 }}>{children}</div>;
}
function Divider() { return <div style={{ height: 1, background: 'var(--border)', margin: '1.1rem 0' }} />; }

function PillGroup({ label, options, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted-foreground)', marginRight: 2 }}>{label}</span>
      {options.map((o) => {
        const active = value === o;
        return (
          <button key={o} onClick={() => onChange(o)} style={{
            padding: '0.3rem 0.8rem', borderRadius: 999, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
            border: '1px solid ' + (active ? 'transparent' : 'var(--border)'),
            background: active ? 'var(--primary)' : 'var(--muted)', color: active ? 'var(--primary-foreground)' : 'var(--foreground)',
          }}>{o}</button>
        );
      })}
    </div>
  );
}
function TeamPill({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '0.3rem 0.8rem', borderRadius: 999, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
      border: '1px solid ' + (active ? 'transparent' : 'var(--border)'),
      background: active ? 'var(--rag-green)' : 'var(--muted)', color: active ? '#fff' : 'var(--foreground)',
    }}>{children}</button>
  );
}
function RankBadge({ n, color }) {
  return <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: color, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '0.85rem' }}>{n}</div>;
}
function Tag({ children }) {
  return <span style={{ padding: '0.15rem 0.55rem', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--card)', fontSize: '0.75rem', fontWeight: 600 }}>{children}</span>;
}
function Meter({ label, pct }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
        <span style={{ color: 'var(--muted-foreground)' }}>{label}</span>
        <strong>{pct}%</strong>
      </div>
      <div style={{ height: 7, background: 'var(--muted)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--rag-green)' }} />
      </div>
    </div>
  );
}
