import React, { createContext, useContext, useState, useCallback } from 'react';

const r = 'var(--radius)';

export function Card({ children, style, className, ...rest }) {
  return (
    <div
      className={className}
      {...rest}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: r,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, style }) {
  return <div style={{ padding: '1rem 1.25rem 0.5rem', ...style }}>{children}</div>;
}
export function CardContent({ children, style }) {
  return <div style={{ padding: '0.75rem 1.25rem 1.25rem', ...style }}>{children}</div>;
}

export function Button({ variant = 'primary', size = 'md', children, style, ...props }) {
  const variants = {
    primary: { background: 'var(--primary)', color: 'var(--primary-foreground)', border: '1px solid transparent' },
    secondary: { background: 'var(--secondary)', color: 'var(--secondary-foreground)', border: '1px solid transparent' },
    accent: { background: 'var(--accent)', color: 'var(--accent-foreground)', border: '1px solid transparent' },
    outline: { background: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border)' },
    ghost: { background: 'transparent', color: 'var(--foreground)', border: '1px solid transparent' },
    destructive: { background: 'var(--destructive)', color: 'var(--destructive-foreground)', border: '1px solid transparent' },
  };
  const sizes = {
    sm: { padding: '0.3rem 0.6rem', fontSize: '0.8rem' },
    md: { padding: '0.5rem 0.9rem', fontSize: '0.875rem' },
    icon: { padding: '0.4rem', fontSize: '0.875rem', width: 34, height: 34 },
  };
  return (
    <button
      {...props}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
        borderRadius: 'calc(var(--radius) - 0.25rem)', fontWeight: 600,
        transition: 'filter 0.15s, opacity 0.15s', whiteSpace: 'nowrap',
        ...variants[variant], ...sizes[size], ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(0.95)')}
      onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
    >
      {children}
    </button>
  );
}

export function Badge({ children, color, style }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
        padding: '0.15rem 0.55rem', borderRadius: '999px', fontSize: '0.75rem',
        fontWeight: 600, background: color ? `${color}` : 'var(--muted)',
        color: color ? '#fff' : 'var(--muted-foreground)', ...style,
      }}
    >
      {children}
    </span>
  );
}

const fieldStyle = {
  width: '100%', padding: '0.5rem 0.7rem', borderRadius: 'calc(var(--radius) - 0.25rem)',
  border: '1px solid var(--input)', background: 'var(--card)', color: 'var(--foreground)',
  fontSize: '0.875rem', outline: 'none',
};

export function Input(props) {
  return <input {...props} style={{ ...fieldStyle, ...props.style }} />;
}
export function Textarea(props) {
  return <textarea {...props} style={{ ...fieldStyle, minHeight: 80, resize: 'vertical', ...props.style }} />;
}
export function Select({ children, ...props }) {
  return <select {...props} style={{ ...fieldStyle, ...props.style }}>{children}</select>;
}

export function Field({ label, required, children }) {
  return (
    <label style={{ display: 'block', marginBottom: '0.75rem' }}>
      <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--muted-foreground)' }}>
        {label}{required && <span style={{ color: 'var(--destructive)' }}> *</span>}
      </span>
      {children}
    </label>
  );
}

export function Skeleton({ height = 16, width = '100%', style }) {
  return (
    <div
      style={{
        height, width, borderRadius: 6,
        background: 'linear-gradient(90deg, var(--muted) 25%, var(--border) 37%, var(--muted) 63%)',
        backgroundSize: '400% 100%', animation: 'mf-shimmer 1.4s ease infinite', ...style,
      }}
    />
  );
}

// Inject shimmer keyframes once.
if (typeof document !== 'undefined' && !document.getElementById('mf-shimmer-kf')) {
  const s = document.createElement('style');
  s.id = 'mf-shimmer-kf';
  s.textContent = '@keyframes mf-shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}';
  document.head.appendChild(s);
}

// ── Toast system (spec §8: top-right success/error) ──────────────────────
const ToastCtx = createContext(null);
export function useToast() { return useContext(ToastCtx); }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div style={{ position: 'fixed', top: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 1000 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              padding: '0.6rem 0.9rem', borderRadius: 'var(--radius)', color: '#fff', fontSize: '0.85rem',
              fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              background: t.type === 'error' ? 'var(--destructive)' : 'var(--rag-green)',
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
