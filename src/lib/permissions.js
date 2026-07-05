// ─────────────────────────────────────────────────────────────────────────
// Role-based access config (UI-level).
//
// IMPORTANT: this is visibility/UX, NOT a hard security boundary. The browser
// holds a Graph token with Sites.ReadWrite.All, so a determined user can read
// the lists directly. Real enforcement must live in SharePoint permissions or
// behind an API. These rules drive what the app *shows and offers* per role.
// ─────────────────────────────────────────────────────────────────────────

export const ROLES = ['Admin', 'Project Manager', 'Dev Lead', 'Functional Lead', 'Consultant', 'Viewer'];
export const DEFAULT_ROLE = 'Viewer';

// Lead roles: scoped to the projects they lead, with the same access footprint.
// (Formerly a single "Team Lead"; split into Dev/Functional leads.)
export const LEAD_ROLES = ['Dev Lead', 'Functional Lead'];

// The role a person plays ON a specific project (the assignment's `role` field).
// A lead's project scope is driven by assignments tagged with a lead role.
export const PROJECT_ROLES = ['Project Manager', 'Dev Lead', 'Functional Lead', 'Consultant'];

// Module keys mirror route path slugs ('' route → 'dashboard').
export const MODULES = [
  'dashboard', 'resources', 'skills', 'resource-skills', 'projects', 'project-skills',
  'assignments', 'tasks', 'tracking', 'risks', 'meetings', 'payments',
  'smart-suggest', 'report', 'import',
];

// SharePoint list (entity) → the module that governs writes to it.
export const MODULE_BY_ENTITY = {
  Resource: 'resources',
  Skill: 'skills',
  ResourceSkill: 'resource-skills',
  Project: 'projects',
  ProjectSkill: 'project-skills',
  ProjectAssignment: 'assignments',
  ProjectTask: 'tasks',
  ProjectTracking: 'tracking',
  ProjectRisk: 'risks',
  SteeringMeeting: 'meetings',
  ProjectPayment: 'payments',
};

// Per role: which modules are visible (view), and which are writable (write).
const ROLE_CONFIG = {
  Admin: { view: MODULES, write: MODULES },

  'Project Manager': {
    view: ['dashboard', 'resource-skills', 'projects', 'project-skills', 'assignments', 'tasks', 'tracking', 'risks', 'meetings', 'payments', 'smart-suggest', 'report'],
    write: ['resource-skills', 'projects', 'project-skills', 'assignments', 'tasks', 'tracking', 'risks', 'meetings', 'payments'],
  },

  // Sees only projects he leads; can manage their assignments & tasks, and view
  // their payment plan. Dev Lead and Functional Lead share this footprint.
  'Dev Lead': {
    view: ['dashboard', 'projects', 'assignments', 'tasks', 'tracking', 'payments', 'report'],
    write: ['projects', 'assignments', 'tasks'],
  },
  'Functional Lead': {
    view: ['dashboard', 'projects', 'assignments', 'tasks', 'tracking', 'payments', 'report'],
    write: ['projects', 'assignments', 'tasks'],
  },

  // Sees only his own records (read-only).
  Consultant: {
    view: ['resource-skills', 'assignments', 'tasks'],
    write: [],
  },

  // Sees everything, changes nothing.
  Viewer: {
    view: MODULES,
    write: [],
  },
};

// Map a stored appRole value back to its canonical ROLES entry, tolerating
// leading/trailing whitespace and any casing (" admin " → "Admin"). Returns
// null if it matches no known role, so callers can fall back to DEFAULT_ROLE.
// Legacy role names → current canonical role. Keeps already-stored values
// working after a rename so nobody silently drops to Viewer.
const ROLE_ALIASES = { 'team lead': 'Dev Lead' };

export function normalizeRole(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase();
  if (ROLE_ALIASES[key]) return ROLE_ALIASES[key];
  return ROLES.find((r) => r.toLowerCase() === key) || null;
}

export function roleConfig(role) {
  return ROLE_CONFIG[role] || ROLE_CONFIG[DEFAULT_ROLE];
}
export function canViewModule(role, moduleKey) {
  return roleConfig(role).view.includes(moduleKey);
}
export function canWriteEntity(role, entity) {
  const mod = MODULE_BY_ENTITY[entity];
  return !!mod && roleConfig(role).write.includes(mod);
}

// Derive a nav/route path into its module key, and back.
export function moduleForPath(path) {
  if (path === '/' || path === '') return 'dashboard';
  return path.replace(/^\//, '').split('/')[0];
}
export function pathForModule(key) {
  return key === 'dashboard' ? '/' : `/${key}`;
}

// Where to send a role when they hit a page they can't see (and as their home).
// Ordered by "nicest landing first" among the modules a role can view.
const LANDING_ORDER = [
  'dashboard', 'tasks', 'projects', 'assignments', 'resource-skills',
  'payments', 'report', 'tracking', 'risks', 'meetings', 'project-skills',
  'smart-suggest', 'resources', 'skills', 'import',
];
export function firstAllowedPath(role) {
  const cfg = roleConfig(role);
  const key = LANDING_ORDER.find((k) => cfg.view.includes(k)) || 'dashboard';
  return pathForModule(key);
}

// ── Record-level scoping ──────────────────────────────────────────────────
const PROJECT_CHILD_ENTITIES = ['ProjectSkill', 'ProjectAssignment', 'ProjectTask', 'ProjectTracking', 'ProjectRisk', 'SteeringMeeting', 'ProjectPayment'];

// Return a scoped copy of the dataset for the current user. Reference lists
// (Resource/Skill) are left intact so names and pickers still resolve.
export function scopeData(rawData, me, role) {
  // Full-visibility roles (Viewer sees all but can't write — gated elsewhere).
  if (role === 'Admin' || role === 'Viewer' || role === 'Project Manager' || !me) return rawData;

  // Lead (Dev/Functional): every record on the projects where he is assigned AS
  // a lead (the assignment's role is a lead role; 'Team Lead' kept for legacy data).
  if (LEAD_ROLES.includes(role)) {
    const leadAssignmentRoles = new Set([...LEAD_ROLES, 'Team Lead']);
    const ids = new Set(
      rawData.ProjectAssignment
        .filter((a) => a.resourceId === me.resourceId && leadAssignmentRoles.has(a.role))
        .map((a) => a.projectId)
    );
    const scoped = { ...rawData };
    scoped.Project = rawData.Project.filter((p) => ids.has(p.projectId));
    PROJECT_CHILD_ENTITIES.forEach((e) => { scoped[e] = (rawData[e] || []).filter((r) => ids.has(r.projectId)); });
    return scoped;
  }

  // Consultant: only his own records.
  if (role === 'Consultant') {
    const mine = me.resourceId;
    const myAssignments = rawData.ProjectAssignment.filter((a) => a.resourceId === mine);
    const myTasks = rawData.ProjectTask.filter((t) => t.assigneeId === mine || t.reporterId === mine);
    const ids = new Set([...myAssignments.map((a) => a.projectId), ...myTasks.map((t) => t.projectId)]);
    const scoped = { ...rawData };
    scoped.Project = rawData.Project.filter((p) => ids.has(p.projectId)); // for label resolution
    scoped.ProjectAssignment = myAssignments;
    scoped.ProjectTask = myTasks;
    scoped.ResourceSkill = rawData.ResourceSkill.filter((rs) => rs.resourceId === mine);
    // Everything else project-related is hidden from a consultant.
    ['ProjectSkill', 'ProjectTracking', 'ProjectRisk', 'SteeringMeeting', 'ProjectPayment'].forEach((e) => { scoped[e] = []; });
    return scoped;
  }

  return rawData;
}
