// ─────────────────────────────────────────────────────────────────────────
// Azure AD / MSAL configuration.
//
// PLACEHOLDERS — replace before the app can sign in. You (or your tenant
// admin) must complete these steps; this code cannot do them for you:
//
//   1. Register an app in Entra ID (Azure portal > App registrations).
//   2. Set redirect URI (SPA) to your dev/prod origin, e.g. http://localhost:5173.
//   3. Grant Microsoft Graph DELEGATED permissions:
//        Sites.ReadWrite.All   (or Sites.Selected, scoped to your site)
//        User.Read
//      and grant admin consent.
//   4. Copy the Application (client) ID and Directory (tenant) ID below.
//   5. Set SHAREPOINT_SITE_PATH to your site (hostname + server-relative path).
//
// Until these are real values, sign-in will fail. That is expected.
// ─────────────────────────────────────────────────────────────────────────

export const AZURE_CLIENT_ID = 'a464fbca-03ff-4659-8f29-776fce88897e'; // TODO
export const AZURE_TENANT_ID = '5df08255-a152-4fbc-a174-0d8a182aa594'; // TODO
 
// e.g. "contoso.sharepoint.com:/sites/MaisonFlow"
export const SHAREPOINT_SITE_PATH = 'maisonglobal.sharepoint.com:/sites/m365appbuilder-maison-flow-8145'; // TODO

export const msalConfig = {
  auth: {
    clientId: AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${AZURE_TENANT_ID}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

// Scopes requested at sign-in / token acquisition.
export const loginRequest = {
  scopes: ['User.Read', 'Sites.ReadWrite.All'],
};

export const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
