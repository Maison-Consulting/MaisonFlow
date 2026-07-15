import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { allServices } from '../services/index.js';
import { useToast } from '../components/ui/primitives.jsx';
import { useAuth } from './AuthContext.jsx';
import { scopeData } from '../lib/permissions.js';

const DataCtx = createContext(null);
export function useData() { return useContext(DataCtx); }

const ENTITIES = Object.keys(allServices);

// Entities that belong to a project — writes to these are authorized per project
// (lead of that project or Admin), not just by global role.
const PROJECT_CHILD = new Set([
  'ProjectSkill', 'ProjectAssignment', 'ProjectTask', 'ProjectTracking',
  'ProjectRisk', 'SteeringMeeting', 'ProjectPayment',
]);

export function DataProvider({ children }) {
  const toast = useToast();
  const auth = useAuth();
  // rawData holds everything fetched; `data` (exposed) is the role-scoped view.
  const [rawData, setData] = useState(() => Object.fromEntries(ENTITIES.map((e) => [e, []])));
  const [loading, setLoading] = useState(() => Object.fromEntries(ENTITIES.map((e) => [e, true])));
  const [initialLoading, setInitialLoading] = useState(true);
  const [fatalError, setFatalError] = useState(null);

  const data = useMemo(() => scopeData(rawData, auth.me, auth.role), [rawData, auth.me, auth.role]);

  // Load each entity independently so each section's skeleton clears as its
  // own service resolves (spec §8 loading strategy).
  const reload = useCallback(async (entity) => {
    const targets = entity ? [entity] : ENTITIES;
    await Promise.all(
      targets.map(async (e) => {
        setLoading((l) => ({ ...l, [e]: true }));
        try {
          const rows = await allServices[e].list();
          setData((d) => ({ ...d, [e]: rows }));
        } catch (err) {
          // First load failure is almost always auth/provisioning — surface once.
          setFatalError((prev) => prev || err.message);
        } finally {
          setLoading((l) => ({ ...l, [e]: false }));
        }
      })
    );
  }, []);

  useEffect(() => { reload().finally(() => setInitialLoading(false)); }, [reload]);

  // Central write authorization. The global role must allow the entity; and for
  // project-child records the user must be Admin or a LEAD on that record's
  // project — except a non-lead member may UPDATE their own task. Returns an
  // error message string when denied, or null when allowed.
  const authorize = useCallback((entity, action, record) => {
    if (!auth.canWrite(entity)) return `Your role (${auth.role}) can't modify ${entity}.`;
    if (PROJECT_CHILD.has(entity) && auth.role !== 'Admin') {
      if (!auth.canManageProject(record?.projectId)) {
        const mine = auth.me?.resourceId;
        const ownTaskUpdate = entity === 'ProjectTask' && action === 'update'
          && record && (record.assigneeId === mine || record.reporterId === mine);
        if (!ownTaskUpdate) return 'You can only manage the projects you lead.';
      }
    }
    return null;
  }, [auth]);
  const guardOrThrow = (err) => { if (err) { toast(err, 'error'); throw new Error('forbidden'); } };

  // Optimistic create.
  const create = useCallback(async (entity, payload) => {
    guardOrThrow(authorize(entity, 'create', payload));
    const tmpId = `tmp-${Math.random().toString(36).slice(2)}`;
    const optimistic = { ...payload, _spId: tmpId };
    setData((d) => ({ ...d, [entity]: [...d[entity], optimistic] }));
    try {
      const saved = await allServices[entity].create(payload);
      setData((d) => ({ ...d, [entity]: d[entity].map((r) => (r._spId === tmpId ? saved : r)) }));
      toast(`${entity} created`);
      return saved;
    } catch (err) {
      setData((d) => ({ ...d, [entity]: d[entity].filter((r) => r._spId !== tmpId) }));
      toast(`Couldn't create ${entity}: ${err.message}`, 'error');
      throw err;
    }
  }, [toast, authorize]);

  // Optimistic update.
  const update = useCallback(async (entity, spId, patch) => {
    guardOrThrow(authorize(entity, 'update', rawData[entity]?.find((r) => r._spId === spId)));
    let prev;
    setData((d) => {
      prev = d[entity].find((r) => r._spId === spId);
      return { ...d, [entity]: d[entity].map((r) => (r._spId === spId ? { ...r, ...patch } : r)) };
    });
    try {
      await allServices[entity].update(spId, patch);
      toast(`${entity} updated`);
    } catch (err) {
      setData((d) => ({ ...d, [entity]: d[entity].map((r) => (r._spId === spId ? prev : r)) }));
      toast(`Couldn't update ${entity}: ${err.message}`, 'error');
      throw err;
    }
  }, [toast, authorize, rawData]);

  // Optimistic delete.
  const remove = useCallback(async (entity, spId) => {
    guardOrThrow(authorize(entity, 'delete', rawData[entity]?.find((r) => r._spId === spId)));
    let removed, idx;
    setData((d) => {
      idx = d[entity].findIndex((r) => r._spId === spId);
      removed = d[entity][idx];
      return { ...d, [entity]: d[entity].filter((r) => r._spId !== spId) };
    });
    try {
      await allServices[entity].remove(spId);
      toast(`${entity} deleted`);
    } catch (err) {
      setData((d) => {
        const arr = [...d[entity]];
        arr.splice(idx, 0, removed);
        return { ...d, [entity]: arr };
      });
      toast(`Couldn't delete ${entity}: ${err.message}`, 'error');
      throw err;
    }
  }, [toast, authorize, rawData]);

  const value = { data, loading, initialLoading, fatalError, reload, create, update, remove };
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
