import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { resourceService } from '../services/index.js';
import { DEFAULT_ROLE, canViewModule, canWriteEntity, normalizeRole } from '../lib/permissions.js';

// Resolves the signed-in user to a Resource row (by email) to derive their
// access role. Exposes role + capability helpers to the whole app.
const AuthCtx = createContext(null);
export function useAuth() { return useContext(AuthCtx); }

export function AuthProvider({ children }) {
  const { instance } = useMsal();
  const account = instance.getActiveAccount() || instance.getAllAccounts()[0];
  // Normalize the sign-in identity: trim + lowercase so stray whitespace or
  // casing in the SharePoint `email` column can't silently drop the match.
  const email = (account?.username || '').trim().toLowerCase();

  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const resources = await resourceService.list();
        const match = resources.find((r) => (r.email || '').trim().toLowerCase() === email);
        if (!cancelled) setMe(match || null);
      } catch {
        if (!cancelled) setMe(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [email]);

  // Normalize the stored appRole too: " admin " → "Admin" so a stray space or
  // casing doesn't demote the user to the Viewer fallback.
  const role = normalizeRole(me?.appRole) || DEFAULT_ROLE;

  const value = useMemo(() => ({
    me,
    email,
    role,
    ready,
    isResolved: !!me,
    canView: (moduleKey) => canViewModule(role, moduleKey),
    canWrite: (entity) => canWriteEntity(role, entity),
  }), [me, email, role, ready]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
