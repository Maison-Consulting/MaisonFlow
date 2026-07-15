// ─────────────────────────────────────────────────────────────────────────
// Role-based access config (UI-level).
//
// IMPORTANT: this is visibility/UX, NOT a hard security boundary. The browser
// holds a Graph token with Sites.ReadWrite.All, so a determined user can read
// the lists directly. Real enforcement must live in SharePoint permissions or
// behind an API. These rules drive what the app *shows and offers* per role.
// ─────────────────────────────────────────────────────────────────────────

// Resource-level Access roles. Only Admin and Viewer carry inherent access;
// 'User' has none on its own — a User's reach is derived entirely from their
// project assignments (see effectiveRole / scopeData).
export const ROLES = ['Admin', 'Viewer', 'User'];
export const DEFAULT_ROLE = 'User';

// The role a person plays ON a specific project (the assignment's `role` field).
// This — not the resource's global Access role — drives per-project access.
export const PROJECT_ROLES = ['Project Manager', 'Dev Lead', 'Functional Lead', 'Consultant'];

// Assignment roles that grant lead (management) access to a project.
export const LEAD_PROJECT_ROLES = ['Project Manager', 'Dev Lead', 'Functional Lead'];

// The effective access role a user operates under. Admin and Viewer come from
// the resource's global Access role (appRole); everyone else is derived from
// their project assignments — a lead assignment on ANY project grants lead
// capabilities, otherwise they act as a Consultant. Actual reach is per-project
// (see scopeData for visibility and ProjectDetail for per-project management).
export function effectiveRole(appRole, assignmentRoles = []) {
  if (appRole === 'Admin') return 'Admin';
  if (appRole === 'Viewer') return 'Viewer';
  const isLead = assignmentRoles.some((r) => LEAD_PROJECT_ROLES.includes(r));
  return isLead ? 'Project Manager' : 'Consultant';
}

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

  // Sees the projects he's assigned to (read-only) and can update the tasks
  // assigned to him — but nothing project-level. Data scoping limits both his
  // visible projects and his writable tasks to his own.
  Consultant: {
    view: ['projects', 'resource-skills', 'assignments', 'tasks'],
    write: ['tasks'],
  },

  // Sees everything, changes nothing.
  Viewer: {
    view: MODULES,
    write: [],
  },
};

// Map a stored appRole value back to its canonical ROLES entry, tolerating
// leading/trailing whitespace and any casing (" admin " → "Admin"). Returns
// null if it matches no known role — legacy values (Project Manager, Consultant,
// …) fall through to null and are then treated as a plain 'User'.
export function normalizeRole(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase();
  return ROLES.find((r) => r.toLowerCase() === key) || null;
}

// `role` here is an EFFECTIVE role (Admin/Viewer/Project Manager/Consultant),
// not the resource Access role — so a missing entry falls back to the minimal
// Consultant footprint rather than a broad default.
export function roleConfig(role) {
  return ROLE_CONFIG[role] || ROLE_CONFIG.Consultant;
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
  if (role === 'Admin' || role === 'Viewer' || !me) return rawData;

  // Everyone else is scoped by their assignments. Two tiers of visibility:
  //   • lead projects  — where the user's assignment role is a lead role: full
  //     project data (they manage them).
  //   • member projects — where the user is assigned as a non-lead (e.g.
  //     Consultant) or just has a task: only their own tasks/assignment show.
  const mine = me.resourceId;
  const myAssignments = rawData.ProjectAssignment.filter((a) => a.resourceId === mine);
  const myTasks = rawData.ProjectTask.filter((t) => t.assigneeId === mine || t.reporterId === mine);

  const leadIds = new Set(myAssignments.filter((a) => LEAD_PROJECT_ROLES.includes(a.role)).map((a) => a.projectId));
  const memberIds = new Set([
    ...myAssignments.map((a) => a.projectId),
    ...myTasks.map((t) => t.projectId),
  ].filter((pid) => !leadIds.has(pid)));

  const visible = new Set([...leadIds, ...memberIds]);
  const isMine = (t) => t.assigneeId === mine || t.reporterId === mine;
  // Parent tasks of the user's member-project sub-tasks, for board context.
  const parentIds = new Set(myTasks.filter((t) => memberIds.has(t.projectId) && t.parentId).map((t) => t.parentId));

  const scoped = { ...rawData };
  scoped.Project = rawData.Project.filter((p) => visible.has(p.projectId));
  // Lead projects: every record. Member projects: only the user's own.
  scoped.ProjectTask = rawData.ProjectTask.filter((t) =>
    leadIds.has(t.projectId) ||
    (memberIds.has(t.projectId) && (isMine(t) || (t.taskId && parentIds.has(t.taskId))))
  );
  scoped.ProjectAssignment = rawData.ProjectAssignment.filter((a) =>
    leadIds.has(a.projectId) || (memberIds.has(a.projectId) && a.resourceId === mine)
  );
  // The remaining project artefacts are only visible on projects the user leads.
  ['ProjectSkill', 'ProjectTracking', 'ProjectRisk', 'SteeringMeeting', 'ProjectPayment'].forEach((e) => {
    scoped[e] = (rawData[e] || []).filter((r) => leadIds.has(r.projectId));
  });
  return scoped;
}

// The user's role on a specific project, from their assignment there: 'lead'
// (a lead assignment role), 'member' (any other assignment/task), or null.
export function projectRoleFor(assignments, resourceId, projectId) {
  const mine = (assignments || []).filter((a) => a.resourceId === resourceId && a.projectId === projectId);
  if (!mine.length) return null;
  return mine.some((a) => LEAD_PROJECT_ROLES.includes(a.role)) ? 'lead' : 'member';
}
