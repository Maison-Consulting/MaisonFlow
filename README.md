# Maison Flow

> Staff smarter. Deliver calmer.

A resource- and project-delivery management web app: resources, skills, projects,
assignments, weekly tracking, risks, steering meetings, and payments — backed by
**SharePoint lists via the Microsoft Graph API**.

Built with Vite + React (JavaScript), MSAL for auth, and d3 for charts.

---

## 1. Prerequisites

- Node.js 18+ and npm
- A Microsoft 365 tenant with a SharePoint site you can create lists on
- Permission to register an app in Entra ID (or an admin who can)

## 2. Install & run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
npm run preview  # serve the production build
```

The app will load but **cannot sign in or read data until you complete the Azure
configuration below.** That is expected.

## 3. Azure / SharePoint configuration (required)

This app cannot perform these admin steps for you — you (or your tenant admin) must:

1. **Register an app** in the Azure portal → *App registrations* → *New registration*.
2. Under *Authentication*, add a **Single-page application** redirect URI:
   `http://localhost:5173` (and your production origin later).
3. Under *API permissions*, add **Microsoft Graph → Delegated**:
   - `Sites.ReadWrite.All` (or `Sites.Selected`, scoped to your site)
   - `User.Read`
   then **Grant admin consent**.
4. Copy the **Application (client) ID** and **Directory (tenant) ID**.
5. Open `src/lib/authConfig.js` and replace the three placeholders:

   ```js
   export const AZURE_CLIENT_ID = '<your client id>';
   export const AZURE_TENANT_ID = '<your tenant id>';
   export const SHAREPOINT_SITE_PATH = 'yourtenant.sharepoint.com:/sites/YourSite';
   ```

6. Run the app, click **Sign in with Microsoft**, then click **Provision lists**
   in the top bar. This creates any of the 10 lists that don't exist yet
   (idempotent — safe to click again). Then **Reload**.

## 4. Data model

Ten SharePoint lists (created by *Provision lists*):

`Skill`, `Resource`, `ResourceSkill`, `Project`, `ProjectSkill`,
`ProjectAssignment`, `ProjectTracking`, `ProjectRisk`, `SteeringMeeting`,
`ProjectPayment`.

**Foreign keys** are stored as plain text columns holding the related item's
app-generated UUID (e.g. `ProjectAssignment.projectId`), and relationships are
resolved **client-side**. Native SharePoint Lookup columns are intentionally not
used — they are fragile to create and query through Graph.

SharePoint reserves the `Title` column, so each entity's natural name lives in a
dedicated column (`skillName`, `projectName`, `riskTitle`, …) and `Title` is set
to the record's id.

## 5. Importing data

The **Import Data** page accepts one CSV per list. The first row must be column
headers matching the schema field names (shown on each drop card). Rows are
validated before commit; committing writes through to SharePoint.

## 6. What's complete vs. patterned

This codebase is a **runnable foundation**, not a finished product hardened for
production. Be aware of the following.

**Fully implemented**
- Project scaffold, theme tokens (spec §2), routing, sidebar/layout shell
- MSAL auth flow and Graph client (token acquisition, REST wrapper)
- All 10 entity services + idempotent provisioning routine
- Data layer with per-entity loading and optimistic create/update/delete + toasts
- Dashboard (KPIs + 4 d3 charts), Resources, Skills, Resource Skills, Projects,
  Project Detail (tabbed), Project Skills, Assignments (over-allocation warning),
  Tracking (trend chart), Risks (heatmap), Steering Meetings, Payments
  (auto-overdue, totals), Smart Suggest (scoring), Summary Report (print), Import

**Patterned / simplified — review before relying on it**
- **Charts** are hand-rolled d3 wrappers covering the spec's chart types; they are
  not a full charting library and have limited axis/legend/responsive handling.
- **shadcn/ui** components are approximated with lightweight inline-styled
  primitives. The spec referenced shadcn; bootstrapping the full shadcn + Tailwind
  toolchain was out of scope. Swap in real shadcn if you want its full surface.
- **CSV import** uses a minimal parser. For embedded newlines inside quoted fields
  and large files, replace it with `papaparse`.
- **Edit/delete** is implemented on the reference pages (Resources, Skills,
  Resource Skills, Project Skills); some secondary pages expose create + delete but
  not inline edit. The pattern to extend them is identical to Resources.
- **No automated tests** and no pagination — list reads use Graph `$top=999`. Lists
  beyond ~1000 items need `@odata.nextLink` paging added in `listService.list()`.
- The Projects card **budget bar** is a placeholder; the schema has no "spend"
  field, so add one (and a tracking source) if you need real budget burn-down.

## 7. Project structure

```
src/
  lib/         authConfig, graphClient, schema, provision, listService, useDebounced
  services/    one service per list + allServices map
  context/     DataContext (load + optimistic CRUD)
  components/  ui/ (primitives, Dialog, Table), charts/, pills, Sidebar, Layout
  pages/       15 route pages
  App.jsx      auth gate + routes
  main.jsx     MSAL instance + providers
```

## 8. Security notes

- Tokens are acquired per-session via MSAL and cached in `sessionStorage`.
- The app holds no secrets; the client ID and tenant ID are not secrets.
- Grant the narrowest Graph scope you can (`Sites.Selected` over
  `Sites.ReadWrite.All` where feasible).
