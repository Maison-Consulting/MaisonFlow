# Maison Flow — Admin Setup

This app is a static SPA (React + Vite) that stores all data in **SharePoint lists**
via Microsoft Graph, using the **signed-in user's** delegated permissions. A few
features need one-time setup by a **tenant admin** and a **SharePoint site owner**.

Live app: https://maison-consulting.github.io/MaisonFlow/

## 1. Azure app registration — API permissions

App registration (Entra ID): **client ID `a464fbca-03ff-4659-8f29-776fce88897e`**,
tenant `5df08255-a152-4fbc-a174-0d8a182aa594`. These values live in
[`src/lib/authConfig.js`](src/lib/authConfig.js) along with `SHAREPOINT_SITE_PATH`.

Add each permission under **App registrations → (this app) → API permissions →
Add a permission**, choose **Delegated**, then click **Grant admin consent**.

| Permission | API | Type | Enables | Required? |
|---|---|---|---|---|
| `User.Read` | Microsoft Graph | Delegated | Sign-in | ✅ base (already consented) |
| `Sites.ReadWrite.All` | Microsoft Graph | Delegated | Read/write all app data (SharePoint lists) | ✅ base (already consented) |
| `Mail.Send` | Microsoft Graph | Delegated | Task **assignment + @mention emails** (sent as the signed-in user) | Needed for email |
| `User.ReadBasic.All` | Microsoft Graph | Delegated | `@mention` search of the **org / Outlook directory** (local-resource mentions work without it) | Optional |
| `AllSites.Write` | **SharePoint** | Delegated | **Task file attachments** (SharePoint REST) | Needed for attachments |
| `Sites.Manage.All` | Microsoft Graph | Delegated | Lets the app **create SharePoint columns** via the in-app "Provision lists" button. *Alternative:* a site owner adds columns manually (section 2). | Optional |

Notes
- Each feature acquires its extra scope **on first use** (a one-time consent popup),
  kept separate from sign-in so a missing consent never breaks the rest of the app.
- Emails/attachments are **best-effort** — without consent they fail quietly (email)
  or show a toast (attachments); core task actions still succeed.
- Redirect URI (SPA) must include the app origin `https://maison-consulting.github.io`
  (already configured — sign-in works).

## 2. SharePoint — provision list columns

Data columns were added to existing lists over time. They must exist on the
SharePoint lists or those fields won't save. **Internal names must match exactly**
(no spaces) — type the internal name shown below as the column name.

Two ways to create them:
- **In-app (easiest):** sign in as a user who owns the site (or with `Sites.Manage.All`
  consented) → top bar → **Provision lists**. It adds any missing columns idempotently.
- **Manual:** in each list's **Settings → Add column**, create the columns below.

| List | Column (internal name) | Type |
|---|---|---|
| Project | `managerId`, `devLeadId`, `functionalLeadId` | Single line of text |
| ProjectTask | `parentId`, `category` | Single line of text |
| ProjectTask | `discussion` | Multiple lines of text |
| ProjectPayment | `invoiceDate`, `paymentDate` | Date and Time (Date only) |
| SteeringMeeting | `meetingType` | Single line of text |

> The 403 "access denied" seen when clicking **Provision lists** means the signed-in
> user can't modify list schema — run it as a **site owner**, or add the columns
> manually, or grant `Sites.Manage.All`.

Full schema (source of truth): [`src/lib/schema.js`](src/lib/schema.js).

## 3. Access roles

Resource **Access role** is one of **Admin / Viewer / User**:
- **Admin** — full access.
- **Viewer** — sees everything, read-only.
- **User** — no inherent access; scope comes from **project assignments**
  (lead role on a project → manage it; otherwise sees only their own tasks).

Set a person's Access role on their **Resource** record. Everyone else stays **User**
and is granted access per-project via **Assignments** (Role on project).

## 4. Deploy

```bash
npm install
npm run deploy   # builds and publishes dist/ to the gh-pages branch
```

GitHub Pages must serve from the **`gh-pages`** branch (root). The Vite `base` is
`/MaisonFlow/`; a `404.html` copy of `index.html` handles SPA deep links.
