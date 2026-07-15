import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { resourceService, assignmentService } from '../services/index.js';
import { canViewModule, canWriteEntity, normalizeRole, effectiveRole, projectRoleFor, DEFAULT_ROLE } from '../lib/permissions.js';

// Resolves the signed-in user to a Resource row (by email), then derives their
// effective access role from their project assignments (Admin/Viewer excepted).
// Exposes role + capability helpers + the user's assignments to the whole app.
const AuthCtx = createContext(null);
export function useAuth() { return useContext(AuthCtx); }

export function AuthProvider({ children }) {
  const { instance } = useMsal();
  const account = instance.getActiveAccount() || instance.getAllAccounts()[0];
  // Normalize the sign-in identity: trim + lowercase so stray whitespace or
  // casing in the SharePoint `email` column can't silently drop the match.
  const email = (account?.username || '').trim().toLowerCase();

  const [me, setMe] = useState(null);
  const [myAssignments, setMyAssignments] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        // Identity comes from the resource (email match); role from the
        // assignments tied to that resource. The assignment load is non-fatal —
        // a hiccup there must not drop the user's identity.
        const resources = await resourceService.list();
        const match = resources.find((r) => (r.email || '').trim().toLowerCase() === email) || null;
        let assignments = [];
        if (match) {
          try { assignments = await assignmentService.list(); } catch { assignments = []; }
        }
        if (!cancelled) {
          setMe(match);
          setMyAssignments(match ? assignments.filter((a) => a.resourceId === match.resourceId) : []);
        }
      } catch {
        if (!cancelled) { setMe(null); setMyAssignments([]); }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [email]);

  // Admin/Viewer come from the resource's global Access role; everyone else is
  // derived from their assignment roles (lead → Project Manager, else Consultant).
  const appRole = normalizeRole(me?.appRole);
  const role = effectiveRole(appRole, myAssignments.map((a) => a.role));
  // The resource's Access role (Admin/Viewer/User) for display — distinct from
  // `role`, which is the internal effective capability used for gating.
  const accessRole = appRole || DEFAULT_ROLE;

  const value = useMemo(() => ({
    me,
    email,
    role,
    accessRole,
    assignments: myAssignments,
    ready,
    isResolved: !!me,
    canView: (moduleKey) => canViewModule(role, moduleKey),
    canWrite: (entity) => canWriteEntity(role, entity),
    // Per-project management right: Admins, or whoever is a LEAD on that project.
    // Used by standalone module pages to gate create/edit/delete per project.
    canManageProject: (projectId) => role === 'Admin' || projectRoleFor(myAssignments, me?.resourceId, projectId) === 'lead',
    projectRole: (projectId) => (role === 'Admin' ? 'lead' : projectRoleFor(myAssignments, me?.resourceId, projectId)),
  }), [me, email, role, accessRole, myAssignments, ready]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
