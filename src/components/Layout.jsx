import React, { useState, useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, RefreshCw, DatabaseZap, LogOut, User } from 'lucide-react';
import { useMsal } from '@azure/msal-react';
import { Sidebar } from './Sidebar.jsx';
import { Button, useToast } from './ui/primitives.jsx';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ensureProvisioned } from '../lib/provision.js';

export function Layout() {
  const [open, setOpen] = useState(window.innerWidth > 900);
  const [provisioning, setProvisioning] = useState(false);
  const { reload, fatalError } = useData();
  const { role } = useAuth();
  const isAdmin = role === 'Admin';
  const toast = useToast();
  const isMobile = window.innerWidth <= 900;

  async function provision() {
    setProvisioning(true);
    try {
      const res = await ensureProvisioned();
      toast(res.created.length ? `Provisioned ${res.created.length} list(s)` : 'All lists already exist');
      reload();
    } catch (err) {
      toast(`Provisioning failed: ${err.message}`, 'error');
    } finally {
      setProvisioning(false);
    }
  }

  return (
    <div>
      <Sidebar open={open} onNavigate={() => isMobile && setOpen(false)} />
      {open && isMobile && (
        <div className="no-print" onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 90 }} />
      )}
      <div style={{ marginLeft: open && !isMobile ? 'var(--sidebar-w)' : 0, transition: 'margin 0.2s' }}>
        <header
          className="no-print"
          style={{
            height: 56, borderBottom: '1px solid var(--border)', background: 'var(--card)',
            display: 'flex', alignItems: 'center', gap: 12, padding: '0 1rem',
            position: 'sticky', top: 0, zIndex: 80,
          }}
        >
          <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} aria-label="Toggle navigation">
            <Menu size={18} />
          </Button>
          <div style={{ flex: 1 }} />
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={provision} disabled={provisioning}>
              <DatabaseZap size={15} /> {provisioning ? 'Provisioning…' : 'Provision lists'}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => reload()} aria-label="Reload data">
            <RefreshCw size={16} />
          </Button>
          <UserMenu />
        </header>

        {fatalError && (
          <div className="no-print" style={{
            margin: '1rem', padding: '0.85rem 1rem', borderRadius: 'var(--radius)',
            background: 'oklch(0.60 0.22 25 / 0.1)', border: '1px solid var(--destructive)',
            color: 'var(--foreground)', fontSize: '0.85rem',
          }}>
            <strong>Can't reach SharePoint.</strong> This is expected until Azure config in
            <code> src/lib/authConfig.js </code> is filled in and you sign in. Once configured,
            use <strong>Provision lists</strong> to create the 10 lists, then Reload. Detail: {fatalError}
          </div>
        )}

        <main style={{ padding: '1.5rem', maxWidth: 1280, margin: '0 auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// Signed-in user details + logout, shown in the header.
function UserMenu() {
  const { instance } = useMsal();
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const account = instance.getActiveAccount() || instance.getAllAccounts()[0];

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!account) return null;

  const name = account.name || account.username || 'Account';
  const email = account.username || '';
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  function logout() {
    instance.logoutPopup({ account, postLogoutRedirectUri: window.location.origin }).catch(() => {});
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} aria-label="Account menu" style={{ padding: 0 }}>
        <span
          style={{
            display: 'grid', placeItems: 'center', flexShrink: 0, width: 30, height: 30, borderRadius: '50%',
            background: 'var(--primary)', color: 'var(--primary-foreground)', fontSize: '0.72rem', fontWeight: 700,
          }}
        >
          {initials || <User size={16} />}
        </span>
      </Button>

      {open && (
        <div
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 8px)', minWidth: 240, zIndex: 100,
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
          }}
        >
          <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{name}</div>
            {email && (
              <div style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem', marginTop: 2, wordBreak: 'break-all' }}>
                {email}
              </div>
            )}
            <div style={{ marginTop: 6, display: 'inline-block', fontSize: '0.72rem', fontWeight: 700, padding: '0.1rem 0.5rem', borderRadius: 999, background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
              {role}
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '0.7rem 1rem',
              background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
              color: 'var(--destructive)', fontSize: '0.85rem', fontWeight: 600,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--muted)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// Reusable page heading.
export function PageHeader({ title, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 12 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{title}</h1>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{children}</div>
    </div>
  );
}
