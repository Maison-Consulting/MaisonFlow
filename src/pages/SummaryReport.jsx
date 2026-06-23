import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { Card, CardHeader, CardContent, Button, Select } from '../components/ui/primitives.jsx';
import { Table } from '../components/ui/Dialog.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { RagBadge, SeverityPill, PaymentStatusPill, money, fmtDate } from '../components/pills.jsx';
import { LineChart } from '../components/charts/Charts.jsx';

const SEV_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export function SummaryReport() {
  const { projectId: routeId } = useParams();
  const { data } = useData();
  const [picked, setPicked] = useState('');
  const id = routeId || picked || data.Project[0]?.projectId || '';
  const project = data.Project.find((p) => p.projectId === id);

  const byProject = (e) => data[e].filter((r) => r.projectId === id);
  const resName = (rid) => data.Resource.find((r) => r.resourceId === rid)?.fullName || rid;

  const tracking = useMemo(() => byProject('ProjectTracking').slice().sort((a, b) => new Date(a.weekEnding) - new Date(b.weekEnding)), [data.ProjectTracking, id]);
  const latest = tracking[tracking.length - 1];
  const openRisks = byProject('ProjectRisk').filter((r) => r.status !== 'Closed').sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
  const meetings = byProject('SteeringMeeting').slice().sort((a, b) => new Date(b.meetingDate) - new Date(a.meetingDate)).slice(0, 3);
  const payments = byProject('ProjectPayment');
  const outstanding = payments.filter((p) => p.status !== 'Paid').reduce((s, p) => s + Number(p.amount || 0), 0);

  if (!project) return (
    <div>
      <PageHeader title="Summary Report" />
      <Card><CardContent>
        <Select value={picked} onChange={(e) => setPicked(e.target.value)} style={{ width: 240 }}>
          <option value="">Select a project…</option>
          {data.Project.map((p) => <option key={p._spId} value={p.projectId}>{p.projectName || p.name}</option>)}
        </Select>
      </CardContent></Card>
    </div>
  );

  const name = project.projectName || project.name;

  return (
    <div>
      <div className="no-print">
        <PageHeader title="Summary Report">
          {!routeId && (
            <Select value={id} onChange={(e) => setPicked(e.target.value)} style={{ width: 220 }}>
              {data.Project.map((p) => <option key={p._spId} value={p.projectId}>{p.projectName || p.name}</option>)}
            </Select>
          )}
          <Button onClick={() => window.print()}><Printer size={16} /> Print / Export PDF</Button>
        </PageHeader>
      </div>

      <Card style={{ marginBottom: 12 }}>
        <CardHeader><h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>{name}</h2></CardHeader>
        <CardContent>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', color: 'var(--muted-foreground)' }}>
            <span>{project.client}</span><span>{project.status}</span><RagBadge status={project.ragStatus} />
            <span>{fmtDate(project.startDate)} → {fmtDate(project.endDate)}</span><span>Budget {money(project.budget)}</span>
          </div>
          {project.description && <p style={{ marginTop: 10 }}>{project.description}</p>}
        </CardContent>
      </Card>

      <Section title="Assignments">
        <Table empty="No assignments."
          columns={[{ key: 'resourceId', label: 'Resource', render: (r) => resName(r.resourceId) }, { key: 'role', label: 'Role' }, { key: 'allocationPercent', label: 'Allocation', render: (r) => `${r.allocationPercent || 0}%` }]}
          rows={byProject('ProjectAssignment')} />
      </Section>

      <Section title="Latest tracking">
        {latest ? (
          <div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
              <span>Week {fmtDate(latest.weekEnding)}</span><RagBadge status={latest.ragStatus} /><span>{latest.percentComplete}% complete</span>
            </div>
            <p style={{ fontSize: '0.9rem' }}>{latest.narrative}</p>
            {tracking.length > 1 && <div style={{ marginTop: 12 }}><LineChart data={tracking.map((t) => ({ x: fmtDate(t.weekEnding).slice(5), y: Number(t.percentComplete) || 0 }))} /></div>}
          </div>
        ) : <Muted>No tracking entries.</Muted>}
      </Section>

      <Section title="Open risks (by severity)">
        <Table empty="No open risks."
          columns={[{ key: 'riskTitle', label: 'Title', render: (r) => r.riskTitle || r.title }, { key: 'severity', label: 'Severity', render: (r) => <SeverityPill level={r.severity} /> }, { key: 'owner', label: 'Owner' }, { key: 'status', label: 'Status' }]}
          rows={openRisks} />
      </Section>

      <Section title="Last 3 steering meetings">
        {meetings.length ? meetings.map((m) => (
          <div key={m._spId} style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--border)' }}>
            <strong>{fmtDate(m.meetingDate)}</strong>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>{m.decisions || m.agenda}</div>
          </div>
        )) : <Muted>No meetings.</Muted>}
      </Section>

      <Section title="Payments">
        <Table empty="No payments."
          columns={[{ key: 'milestone', label: 'Milestone' }, { key: 'amount', label: 'Amount', render: (r) => money(r.amount, r.currency) }, { key: 'status', label: 'Status', render: (r) => <PaymentStatusPill status={r.status} /> }]}
          rows={payments} />
        <div style={{ marginTop: 10, fontWeight: 700 }}>Outstanding total: {money(outstanding)}</div>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return <Card style={{ marginBottom: 12 }}><CardHeader><strong>{title}</strong></CardHeader><CardContent>{children}</CardContent></Card>;
}
function Muted({ children }) { return <div style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>{children}</div>; }
