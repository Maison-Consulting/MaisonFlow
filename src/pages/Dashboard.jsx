import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { LEAD_ROLES } from '../lib/permissions.js';
import { Card, CardHeader, CardContent, Button, Skeleton } from '../components/ui/primitives.jsx';
import { BarChart, DonutChart, ColumnChart } from '../components/charts/Charts.jsx';
import { fmtDate, money, isActiveOn } from '../components/pills.jsx';

const RAG_COLORS = { Green: 'var(--rag-green)', Amber: 'var(--rag-amber)', Red: 'var(--rag-red)' };
const PAY_COLORS = { Pending: 'var(--pay-pending)', Invoiced: 'var(--pay-invoiced)', Paid: 'var(--pay-paid)', Overdue: 'var(--pay-overdue)' };

function Kpi({ label, value, loading }) {
  return (
    <Card>
      <CardContent style={{ padding: '1rem 1.1rem' }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>{label}</div>
        {loading ? <Skeleton height={30} width={60} style={{ marginTop: 6 }} />
          : <div style={{ fontSize: '1.7rem', fontWeight: 800, marginTop: 2 }}>{value}</div>}
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const { data, loading } = useData();
  const { role } = useAuth();

  const { Project, Resource, ProjectAssignment, ProjectRisk, ProjectPayment, ProjectTracking, SteeringMeeting } = data;

  // For role-scoped users the "Resources" KPI means their team (distinct people
  // on the projects they can see), not the whole org directory.
  const scopedToTeam = LEAD_ROLES.includes(role);
  const resourceCount = scopedToTeam
    ? new Set(ProjectAssignment.map((a) => a.resourceId)).size
    : Resource.length;

  const util = useMemo(() => {
    // sum(allocationPercent) per resource, counting only assignments live today
    // (an assignment that has ended no longer consumes capacity).
    const byRes = {};
    ProjectAssignment.forEach((a) => {
      if (!isActiveOn(a.startDate, a.endDate)) return;
      byRes[a.resourceId] = (byRes[a.resourceId] || 0) + Number(a.allocationPercent || 0);
    });
    return Resource.map((r) => ({
      label: (r.fullName || '').split(' ')[0] || '—',
      value: byRes[r.resourceId] || 0,
    })).filter((d) => d.value > 0).slice(0, 6);
  }, [Resource, ProjectAssignment]);

  const avgUtil = util.length ? Math.round(util.reduce((s, d) => s + d.value, 0) / util.length) : 0;

  const ragDist = useMemo(() => {
    // latest tracking per project, fallback to Project.ragStatus
    const latest = {};
    ProjectTracking.forEach((t) => {
      const cur = latest[t.projectId];
      if (!cur || new Date(t.weekEnding) > new Date(cur.weekEnding)) latest[t.projectId] = t;
    });
    const counts = { Green: 0, Amber: 0, Red: 0 };
    Project.forEach((p) => {
      const rag = latest[p.projectId]?.ragStatus || p.ragStatus;
      if (counts[rag] != null) counts[rag] += 1;
    });
    return Object.entries(counts).map(([label, value]) => ({ label, value, color: RAG_COLORS[label] }))
      .filter((d) => d.value > 0);
  }, [Project, ProjectTracking]);

  const payDist = useMemo(() => {
    const counts = { Pending: 0, Invoiced: 0, Paid: 0, Overdue: 0 };
    ProjectPayment.forEach((p) => { if (counts[p.status] != null) counts[p.status] += 1; });
    return Object.entries(counts).map(([label, value]) => ({ label, value, color: PAY_COLORS[label] }));
  }, [ProjectPayment]);

  const overdueTotal = useMemo(() =>
    ProjectPayment.filter((p) => p.status === 'Overdue').reduce((s, p) => s + Number(p.amount || 0), 0),
    [ProjectPayment]);

  const openRisks = ProjectRisk.filter((r) => r.status !== 'Closed').length;

  const upcoming = useMemo(() => {
    const now = new Date(), in14 = new Date(); in14.setDate(now.getDate() + 14);
    return SteeringMeeting
      .filter((m) => { const d = new Date(m.meetingDate); return d >= now && d <= in14; })
      .sort((a, b) => new Date(a.meetingDate) - new Date(b.meetingDate));
  }, [SteeringMeeting]);

  const anyLoading = loading.Project || loading.Resource || loading.ProjectAssignment;

  return (
    <div>
      <div style={{
        background: 'linear-gradient(120deg, oklch(0.62 0.17 35 / 0.12), oklch(0.66 0.10 195 / 0.12))',
        borderRadius: 'var(--radius)', padding: '1.5rem', marginBottom: '1.25rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Welcome back 👋</h1>
          <p style={{ color: 'var(--muted-foreground)' }}>Staff smarter. Deliver calmer.</p>
        </div>
        <Button onClick={() => navigate('/projects')}><Plus size={16} /> New Project</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: '1.25rem' }}>
        <Kpi label={scopedToTeam ? 'My Projects' : 'Projects'} value={Project.length} loading={loading.Project} />
        <Kpi label={scopedToTeam ? 'Team Size' : 'Resources'} value={resourceCount} loading={loading.Resource} />
        <Kpi label="Avg Utilization" value={`${avgUtil}%`} loading={anyLoading} />
        <Kpi label="Open Risks" value={openRisks} loading={loading.ProjectRisk} />
        <Kpi label="Overdue" value={money(overdueTotal)} loading={loading.ProjectPayment} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <Card>
          <CardHeader><strong>Resource Utilization</strong></CardHeader>
          <CardContent>{anyLoading ? <Skeleton height={200} /> : util.length ? <BarChart data={util} /> : <Empty />}</CardContent>
        </Card>
        <Card>
          <CardHeader><strong>Project RAG Distribution</strong></CardHeader>
          <CardContent>{loading.Project ? <Skeleton height={200} /> : ragDist.length ? <DonutChart data={ragDist} /> : <Empty />}</CardContent>
        </Card>
        <Card>
          <CardHeader><strong>Payment Status</strong></CardHeader>
          <CardContent>{loading.ProjectPayment ? <Skeleton height={200} /> : payDist.some((d) => d.value) ? <ColumnChart data={payDist} /> : <Empty />}</CardContent>
        </Card>
        <Card>
          <CardHeader><strong>Upcoming Steering Meetings</strong> <span style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>(next 14 days)</span></CardHeader>
          <CardContent>
            {loading.SteeringMeeting ? <Skeleton height={120} /> : upcoming.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcoming.map((m) => (
                  <div key={m._spId} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.7rem', background: 'var(--muted)', borderRadius: 8, fontSize: '0.85rem' }}>
                    <span>{fmtDate(m.meetingDate)}</span>
                    <span style={{ color: 'var(--muted-foreground)' }}>{(m.attendees || '').split(',').length} attendees</span>
                  </div>
                ))}
              </div>
            ) : <Empty msg="No meetings in the next 14 days." />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Empty({ msg = 'No data yet.' }) {
  return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>{msg}</div>;
}
