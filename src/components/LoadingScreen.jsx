import React from 'react';

// Inject the spinner keyframes once (same pattern as the shimmer in primitives).
if (typeof document !== 'undefined' && !document.getElementById('mf-spin-kf')) {
  const s = document.createElement('style');
  s.id = 'mf-spin-kf';
  s.textContent = '@keyframes mf-spin{to{transform:rotate(360deg)}}@keyframes mf-pulse{0%,100%{opacity:0.4}50%{opacity:1}}';
  document.head.appendChild(s);
}

// Full-screen branded splash shown while identity/role and initial data load.
export function LoadingScreen({ message = 'Loading your workspace…' }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', zIndex: 2000,
        background: 'linear-gradient(120deg, oklch(0.62 0.17 35 / 0.12), oklch(0.66 0.10 195 / 0.12)), var(--background)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: 44, height: 44, margin: '0 auto 1rem', borderRadius: '50%',
            border: '3px solid var(--border)', borderTopColor: 'var(--primary)',
            animation: 'mf-spin 0.8s linear infinite',
          }}
        />
        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>Maison Flow</div>
        <div style={{ color: 'var(--muted-foreground)', fontSize: '0.9rem', marginTop: 4, animation: 'mf-pulse 1.6s ease infinite' }}>
          {message}
        </div>
      </div>
    </div>
  );
}
