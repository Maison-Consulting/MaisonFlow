// ─────────────────────────────────────────────────────────────────────────
// Schema for all 10 SharePoint lists (spec §3).
//
// FK strategy (per your decision): foreign keys are stored as plain TEXT
// columns holding the related item's id (a UUID we generate app-side), and
// relationships are resolved in the client. We do NOT use native SharePoint
// Lookup columns — they are fragile to create and query via Graph.
//
// SharePoint reserves the column name "Title". We map each entity's natural
// primary text onto a dedicated column and leave Title unused (set to the id)
// to keep provisioning simple.
//
// Graph column "type" hints:
//   text:   { text: {} }
//   note:   { text: { allowMultipleLines: true } }   (long text)
//   number: { number: {} }
//   date:   { dateTime: { format: 'dateOnly' } }
// ─────────────────────────────────────────────────────────────────────────

const T = 'text';
const NOTE = 'note';
const NUM = 'number';
const DATE = 'date';

// Product lines used to scope Smart Suggest and tag resources/projects.
export const PRODUCTS = ['F&O', 'BC', 'F&O Retail', 'Power Platform', 'Other'];

// Each list: { name, displayName, columns: [{ name, kind }] }
// `name` is the internal/list name used in the Graph URL.
export const SCHEMA = [
  {
    name: 'Skill',
    columns: [
      { name: 'skillId', kind: T },
      { name: 'name', kind: T },
      { name: 'category', kind: T },
      { name: 'description', kind: NOTE },
    ],
  },
  {
    name: 'Resource',
    columns: [
      { name: 'resourceId', kind: T },
      { name: 'fullName', kind: T },
      { name: 'email', kind: T },
      { name: 'role', kind: T },
      { name: 'department', kind: T },
      { name: 'location', kind: T },
      { name: 'product', kind: T },
      { name: 'weeklyCapacityHours', kind: NUM },
      { name: 'status', kind: T },
      { name: 'appRole', kind: T }, // access role: Admin | Viewer | User (User's access comes from assignments)
    ],
  },
  {
    name: 'ResourceSkill',
    columns: [
      { name: 'resourceSkillId', kind: T },
      { name: 'resourceId', kind: T },
      { name: 'skillId', kind: T },
      { name: 'proficiency', kind: NUM },
      { name: 'yearsExperience', kind: NUM },
    ],
  },
  {
    name: 'Project',
    columns: [
      { name: 'projectId', kind: T },
      { name: 'name', kind: T },
      { name: 'client', kind: T },
      { name: 'product', kind: T },
      { name: 'startDate', kind: DATE },
      { name: 'endDate', kind: DATE },
      { name: 'budget', kind: NUM },
      { name: 'status', kind: T },
      { name: 'ragStatus', kind: T },
      { name: 'managerId', kind: T }, // FK → Resource: the project's owner/PM (record scoping)
      { name: 'devLeadId', kind: T }, // FK → Resource: the project's Dev Lead
      { name: 'functionalLeadId', kind: T }, // FK → Resource: the project's Functional Lead
    ],
  },
  {
    name: 'ProjectSkill',
    columns: [
      { name: 'projectSkillId', kind: T },
      { name: 'projectId', kind: T },
      { name: 'skillId', kind: T },
      { name: 'minProficiency', kind: NUM },
      { name: 'hoursNeeded', kind: NUM },
    ],
  },
  {
    name: 'ProjectAssignment',
    columns: [
      { name: 'assignmentId', kind: T },
      { name: 'projectId', kind: T },
      { name: 'resourceId', kind: T },
      { name: 'allocationPercent', kind: NUM },
      { name: 'startDate', kind: DATE },
      { name: 'endDate', kind: DATE },
      { name: 'role', kind: T },
    ],
  },
  {
    name: 'ProjectTracking',
    columns: [
      { name: 'trackingId', kind: T },
      { name: 'projectId', kind: T },
      { name: 'weekEnding', kind: DATE },
      { name: 'percentComplete', kind: NUM },
      { name: 'ragStatus', kind: T },
      { name: 'narrative', kind: NOTE },
      { name: 'nextSteps', kind: NOTE },
    ],
  },
  {
    // Jira/DevOps-style work-item board. Flat tasks (no parent/child).
    // status drives the board columns; boardOrder ranks cards within a column.
    name: 'ProjectTask',
    columns: [
      { name: 'taskId', kind: T },
      { name: 'projectId', kind: T },        // FK → Project
      { name: 'parentId', kind: T },         // FK → ProjectTask.taskId; empty = parent-level task, set = sub-task
      // Task name lives in the built-in Title column (no separate column needed).
      { name: 'description', kind: NOTE },
      { name: 'discussion', kind: NOTE },    // JSON comment thread: [{ a: author, t: text, at: ISO }]
      { name: 'workItemType', kind: T },     // Task | Bug
      { name: 'category', kind: T },         // Dev Task | Functional Task
      { name: 'status', kind: T },           // New | Open | In Progress | On Hold | Resolved | Closed
      { name: 'priority', kind: T },         // Critical | High | Medium | Low
      { name: 'assigneeId', kind: T },       // FK → Resource (who it's assigned to)
      { name: 'reporterId', kind: T },       // FK → Resource (who raised it)
      { name: 'estimatedHours', kind: NUM },
      { name: 'loggedHours', kind: NUM },
      { name: 'startDate', kind: DATE },
      { name: 'dueDate', kind: DATE },
      { name: 'boardOrder', kind: NUM },
      { name: 'labels', kind: T },
      { name: 'completedDate', kind: DATE },
      { name: 'statusHistory', kind: NOTE }, // JSON log of status transitions: [{ s, at }]
    ],
  },
  {
    name: 'ProjectRisk',
    columns: [
      { name: 'riskId', kind: T },
      { name: 'projectId', kind: T },
      { name: 'title', kind: T },
      { name: 'description', kind: NOTE },
      { name: 'severity', kind: T },
      { name: 'probability', kind: T },
      { name: 'owner', kind: T },
      { name: 'mitigation', kind: NOTE },
      { name: 'status', kind: T },
    ],
  },
  {
    name: 'SteeringMeeting',
    columns: [
      { name: 'meetingId', kind: T },
      { name: 'projectId', kind: T },
      { name: 'meetingDate', kind: DATE },
      { name: 'attendees', kind: NOTE },
      { name: 'agenda', kind: NOTE },
      { name: 'decisions', kind: NOTE },
      { name: 'actionItems', kind: NOTE },
    ],
  },
  {
    name: 'ProjectPayment',
    columns: [
      { name: 'paymentId', kind: T },
      { name: 'projectId', kind: T },
      { name: 'milestone', kind: T },
      { name: 'amount', kind: NUM },
      { name: 'currency', kind: T },
      { name: 'dueDate', kind: DATE },
      { name: 'invoiceNumber', kind: T },
      { name: 'invoiceDate', kind: DATE }, // date the invoice was issued (shown when status is Invoiced/Paid)
      { name: 'status', kind: T },
    ],
  },
];

// Translate our column kind into a Graph columnDefinition body.
export function graphColumnBody(col) {
  const base = { name: col.name };
  switch (col.kind) {
    case NUM:
      return { ...base, number: {} };
    case DATE:
      return { ...base, dateTime: { format: 'dateOnly' } };
    case NOTE:
      return { ...base, text: { allowMultipleLines: true } };
    case T:
    default:
      return { ...base, text: {} };
  }
}
