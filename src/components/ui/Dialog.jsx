import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

// Modal dialog: focus trap + Esc to close (spec §8 keyboard nav).
export function Dialog({ open, onClose, title, children, footer, width = 480 }) {
  const ref = useRef(null);
  // Keep the latest onClose without making it an effect dependency — callers
  // pass a fresh inline function each render, which would otherwise re-run the
  // effects on every keystroke (stealing focus back to the first element).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Keydown handling (Esc + Tab focus trap). Bound once per open/close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'Tab') {
        const f = ref.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!f || f.length === 0) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Autofocus the first form field (not the header close button) once, on open.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const el = ref.current?.querySelector('input, select, textarea')
        || ref.current?.querySelector('button:not([aria-label="Close dialog"])');
      el?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;
  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,12,8,0.4)', zIndex: 900,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 1rem',
      }}
    >
      <div
        ref={ref} role="dialog" aria-modal="true" aria-label={title}
        style={{
          background: 'var(--card)', borderRadius: 'var(--radius)', width: '100%', maxWidth: width,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)', maxHeight: '90vh', overflow: 'auto',
        }}
      >
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1 }}>{title}</span>
          <button
            onClick={onClose} aria-label="Close dialog"
            style={{ display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4, borderRadius: 6 }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '1.25rem' }}>{children}</div>
        {footer && (
          <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Sortable table (spec §8: every column sortable).
// columns: [{ key, label, render?(row), sortable?=true, width? }]
export function Table({ columns, rows, empty = 'No records yet.', onRowClick }) {
  const [sort, setSort] = useState({ key: null, dir: 1 });

  const sorted = React.useMemo(() => {
    if (!sort.key) return rows;
    const c = columns.find((x) => x.key === sort.key);
    const accessor = c?.sortValue || ((row) => row[sort.key]);
    return [...rows].sort((a, b) => {
      const av = accessor(a), bv = accessor(b);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir;
      return String(av).localeCompare(String(bv)) * sort.dir;
    });
  }, [rows, sort, columns]);

  const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }));

  if (!rows.length) {
    return (
      <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>{empty}</div>
    );
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                onClick={() => c.sortable !== false && toggle(c.key)}
                style={{
                  textAlign: 'left', padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border)',
                  color: 'var(--muted-foreground)', fontWeight: 600, fontSize: '0.78rem',
                  cursor: c.sortable !== false ? 'pointer' : 'default', whiteSpace: 'nowrap', width: c.width,
                }}
              >
                {c.label}{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row._spId || row.id || i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ borderBottom: '1px solid var(--border)', cursor: onRowClick ? 'pointer' : 'default' }}
              onMouseEnter={onRowClick ? (e) => (e.currentTarget.style.background = 'var(--muted)') : undefined}
              onMouseLeave={onRowClick ? (e) => (e.currentTarget.style.background = 'transparent') : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} style={{ padding: '0.6rem 0.75rem', verticalAlign: 'middle' }}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
