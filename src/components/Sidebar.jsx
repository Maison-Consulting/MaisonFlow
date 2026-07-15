import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, Target, Link2, FolderKanban, Puzzle, Pin,
  TrendingUp, AlertTriangle, Armchair, Wallet, Sparkles, FileText, Upload, Home, Trello,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { moduleForPath } from '../lib/permissions.js';

const SECTIONS = [
  { items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    label: 'People',
    items: [
      { to: '/resources', label: 'Resources', icon: Users },
      { to: '/skills', label: 'Skills', icon: Target },
      { to: '/resource-skills', label: 'Resource Skills', icon: Link2 },
    ],
  },
  {
    label: 'Delivery',
    items: [
      { to: '/projects', label: 'Projects', icon: FolderKanban },
      { to: '/project-skills', label: 'Project Skills', icon: Puzzle },
      { to: '/assignments', label: 'Assignments', icon: Pin },
      { to: '/tasks', label: 'Task Board', icon: Trello },
    ],
  },
  {
    label: 'Governance',
    items: [
      { to: '/tracking', label: 'Tracking', icon: TrendingUp },
      { to: '/risks', label: 'Risks', icon: AlertTriangle },
      { to: '/meetings', label: 'Steering Meetings', icon: Armchair },
      { to: '/payments', label: 'Payments', icon: Wallet },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/smart-suggest', label: 'Smart Suggest', icon: Sparkles },
      { to: '/report', label: 'Summary Report', icon: FileText },
      { to: '/import', label: 'Import Data', icon: Upload },
    ],
  },
];

export function Sidebar({ open, onNavigate }) {
  const { canView, email, accessRole, isResolved } = useAuth();
  // Hide nav items the role can't view, then drop any section left empty.
  const sections = SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((it) => canView(moduleForPath(it.to))) }))
    .filter((s) => s.items.length > 0);
  return (
    <aside
      className="no-print"
      style={{
        width: 'var(--sidebar-w)', background: 'var(--card)', borderRight: '1px solid var(--border)',
        height: '100vh', position: 'fixed', left: open ? 0 : 'calc(-1 * var(--sidebar-w))',
        top: 0, transition: 'left 0.2s', overflowY: 'auto', zIndex: 100,
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '1.1rem 1.25rem', fontWeight: 800, fontSize: '1.1rem' }}>
        <span style={{
          display: 'inline-flex', width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
          background: 'var(--primary)', color: 'var(--primary-foreground)',
        }}>
          <Home size={18} />
        </span>
        Maison Flow
      </div>
      <nav style={{ padding: '0 0.6rem 1.5rem' }}>
        {sections.map((s, i) => (
          <div key={i} style={{ marginTop: s.label ? '1rem' : '0.25rem' }}>
            {s.label && (
              <div style={{ padding: '0.3rem 0.7rem', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                {s.label}
              </div>
            )}
            {s.items.map((it) => {
              const Icon = it.icon;
              return (
                <NavLink
                  key={it.to} to={it.to} end={it.end} onClick={onNavigate}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 10, padding: '0.55rem 0.7rem',
                    borderRadius: 'calc(var(--radius) - 0.25rem)', fontSize: '0.875rem', fontWeight: 500,
                    color: isActive ? 'var(--primary)' : 'var(--foreground)',
                    background: isActive ? 'oklch(0.62 0.17 35 / 0.08)' : 'transparent',
                    borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
                  })}
                >
                  <Icon size={17} /> {it.label}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Identity + resolved-role indicator. Makes access issues self-diagnosing:
          if the email didn't match a Resource row, role falls back to Viewer and
          "unmatched" is shown so an admin knows why writes are hidden. */}
      <div
        style={{
          marginTop: 'auto', padding: '0.85rem 1.1rem', borderTop: '1px solid var(--border)',
          fontSize: '0.75rem', color: 'var(--muted-foreground)', lineHeight: 1.5,
        }}
      >
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={email || 'no account'}>
          {email || 'no account'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{
            display: 'inline-block', padding: '0.1rem 0.5rem', borderRadius: 999, fontWeight: 700,
            fontSize: '0.7rem', color: 'var(--primary)', background: 'oklch(0.62 0.17 35 / 0.1)',
          }}>
            {accessRole}
          </span>
          {!isResolved && (
            <span title="No Resource record matched this email — defaulting to User. Add a Resource row with this exact email and set its Access role." style={{ color: 'var(--destructive, #c0392b)', fontWeight: 600 }}>
              unmatched
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
