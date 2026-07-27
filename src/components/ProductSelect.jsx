import React from 'react';
import { PRODUCTS, parseProducts } from '../lib/schema.js';

// Multi-select product picker. Value is a comma-separated string ("F&O, BC");
// no selection means "Unassigned". Toggling a chip adds/removes that product.
export function ProductSelect({ value, onChange }) {
  const selected = parseProducts(value);
  const toggle = (p) => {
    const next = selected.includes(p) ? selected.filter((x) => x !== p) : [...selected, p];
    onChange(next.join(', '));
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {PRODUCTS.map((p) => {
        const on = selected.includes(p);
        return (
          <button
            type="button"
            key={p}
            onClick={() => toggle(p)}
            aria-pressed={on}
            style={{
              padding: '0.35rem 0.75rem', borderRadius: 999, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
              border: '1px solid ' + (on ? 'transparent' : 'var(--border)'),
              background: on ? 'var(--primary)' : 'var(--card)',
              color: on ? 'var(--primary-foreground)' : 'var(--foreground)',
            }}
          >
            {p}
          </button>
        );
      })}
      {selected.length === 0 && (
        <span style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>Unassigned</span>
      )}
    </div>
  );
}
