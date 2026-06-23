import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { resourceService } from '../services/index.js';
import { DEFAULT_ROLE, canViewModule, canWriteEntity } from '../lib/permissions.js';

// Resolves the signed-in user to a Resource row (by email) to derive their
// access role. Exposes role + capability helpers to the whole app.
const AuthCtx = createContext(null);
export function useAuth() { return useContext(AuthCtx); }

export function AuthProvider({ children }) {
  const { instance } = useMsal();
  const account = instance.getActiveAccount() || instance.getAllAccounts()[0];
  const email = (account?.username || '').toLowerCase();

  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const resources = await resourceService.list();
        const match = resources.find((r) => (r.email || '').toLowerCase() === email);
        if (!cancelled) setMe(match || null);
      } catch {
        if (!cancelled) setMe(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [email]);

  const role = me?.appRole || DEFAULT_ROLE;

  const value = useMemo(() => ({
    me,
    role,
    ready,
    isResolved: !!me,
    canView: (moduleKey) => canViewModule(role, moduleKey),
    canWrite: (entity) => canWriteEntity(role, entity),
  }), [me, role, ready]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
