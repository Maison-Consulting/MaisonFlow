import React from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { loginRequest, AZURE_CLIENT_ID } from './lib/authConfig.js';
import { Button } from './components/ui/primitives.jsx';
import { DataProvider, useData } from './context/DataContext.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { moduleForPath, firstAllowedPath } from './lib/permissions.js';
import { Layout } from './components/Layout.jsx';
import { LoadingScreen } from './components/LoadingScreen.jsx';

import { Dashboard } from './pages/Dashboard.jsx';
import { Resources } from './pages/Resources.jsx';
import { Skills } from './pages/Skills.jsx';
import { ResourceSkills } from './pages/ResourceSkills.jsx';
import { Projects } from './pages/Projects.jsx';
import { ProjectDetail } from './pages/ProjectDetail.jsx';
import { ProjectSkills } from './pages/ProjectSkills.jsx';
import { Assignments } from './pages/Assignments.jsx';
import { Tracking } from './pages/Tracking.jsx';
import { Tasks } from './pages/Tasks.jsx';
import { Risks } from './pages/Risks.jsx';
import { Meetings } from './pages/Meetings.jsx';
import { Payments } from './pages/Payments.jsx';
import { SmartSuggest } from './pages/SmartSuggest.jsx';
import { SummaryReport } from './pages/SummaryReport.jsx';
import { ImportData } from './pages/ImportData.jsx';

function SignIn() {
  const { instance } = useMsal();
  const unconfigured = AZURE_CLIENT_ID.startsWith('00000000');
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>Maison Flow</h1>
        <p style={{ color: 'var(--muted-foreground)', marginBottom: '1.5rem' }}>
          Staff smarter. Deliver calmer.
        </p>
        {unconfigured && (
          <div style={{
            marginBottom: '1.25rem', padding: '0.85rem 1rem', borderRadius: 'var(--radius)', fontSize: '0.82rem',
            background: 'oklch(0.82 0.16 80 / 0.18)', border: '1px solid var(--secondary)', textAlign: 'left',
          }}>
            Azure config is still placeholder. Fill in <code>src/lib/authConfig.js</code> (client ID,
            tenant ID, site path) before sign-in will work.
          </div>
        )}
        <Button onClick={() => instance.loginPopup(loginRequest).catch(() => {})}>
          Sign in with Microsoft
        </Button>
      </div>
    </div>
  );
}

// Blocks access to a route the current role can't view (direct-URL defense).
function GuardedOutlet() {
  const { canView, ready, role } = useAuth();
  const location = useLocation();
  if (!ready) return null;
  return canView(moduleForPath(location.pathname)) ? <Outlet /> : <Navigate to={firstAllowedPath(role)} replace />;
}

// Holds the splash until identity/role is resolved AND the first data load
// finishes, then renders the routed app.
function AppShell() {
  const { ready } = useAuth();
  const { initialLoading } = useData();
  if (!ready) return <LoadingScreen message="Signing you in…" />;
  if (initialLoading) return <LoadingScreen message="Loading your workspace…" />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route element={<GuardedOutlet />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/resource-skills" element={<ResourceSkills />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/project-skills" element={<ProjectSkills />} />
          <Route path="/assignments" element={<Assignments />} />
          <Route path="/tracking" element={<Tracking />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/risks" element={<Risks />} />
          <Route path="/meetings" element={<Meetings />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/smart-suggest" element={<SmartSuggest />} />
          <Route path="/report" element={<SummaryReport />} />
          <Route path="/report/:projectId" element={<SummaryReport />} />
          <Route path="/import" element={<ImportData />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

export function App() {
  const isAuthed = useIsAuthenticated();
  if (!isAuthed) return <SignIn />;
  return (
    <AuthProvider>
      <DataProvider>
        <AppShell />
      </DataProvider>
    </AuthProvider>
  );
}
