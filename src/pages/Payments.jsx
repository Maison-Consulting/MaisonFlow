import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, CardContent, Button, Input, Select, Field, Skeleton } from '../components/ui/primitives.jsx';
import { Dialog, Table } from '../components/ui/Dialog.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { PaymentStatusPill, money, fmtDate, isPaymentOverdue, effectivePaymentStatus } from '../components/pills.jsx';

const FILTERS = ['All', 'Pending', 'Invoiced', 'Partial', 'Paid', 'Overdue'];
const iconBtnStyle = { display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4, borderRadius: 6 };

export function Payments() {
  const { data, loading, create, update, remove } = useData();
  const { canWrite } = useAuth();
  const canEdit = canWrite('ProjectPayment');
  const [filter, setFilter] = useState('All');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const flagged = useRef(false);

  const projectName = (pid) => { const p = data.Project.find((x) => x.projectId === pid); return p?.projectName || p?.name || pid; };

  // Auto-flag overdue: dueDate passed and status in {Pending, Invoiced} (spec §6.11).
  // Display already derives Overdue live (effectivePaymentStatus); this persists
  // it back so totals/filters/reports stay consistent for write-capable users.
  useEffect(() => {
    if (flagged.current || loading.ProjectPayment || !canEdit) return;
    const toFlag = data.ProjectPayment.filter((p) => isPaymentOverdue(p.status, p.dueDate));
    if (toFlag.length) {
      flagged.current = true;
      toFlag.forEach((p) => update('ProjectPayment', p._spId, { status: 'Overdue' }).catch(() => {}));
    }
  }, [data.ProjectPayment, loading.ProjectPayment, update]);

  const rows = useMemo(() =>
    data.ProjectPayment.filter((p) => filter === 'All' || effectivePaymentStatus(p) === filter),
    [data.ProjectPayment, filter]);

  const totals = useMemo(() => {
    const t = { Paid: 0, Outstanding: 0, Overdue: 0 };
    data.ProjectPayment.forEach((p) => {
      const amt = Number(p.amount || 0);
      const status = effectivePaymentStatus(p);
      if (status === 'Paid') t.Paid += amt;
      else if (status === 'Overdue') t.Overdue += amt;
      else t.Outstanding += amt;
    });
    return t;
  }, [data.ProjectPayment]);

  function openNew() {
    setForm({ projectId: data.Project[0]?.projectId || '', milestone: '', amount: 0, currency: 'USD', dueDate: '', invoiceNumber: '', invoiceDate: '', paymentDate: '', status: 'Pending' });
    setOpen(true);
  }
  function openEdit(row) {
    setForm({ _spId: row._spId, projectId: row.projectId, milestone: row.milestone || '', amount: row.amount ?? 0, currency: row.currency || 'USD', dueDate: row.dueDate ? String(row.dueDate).slice(0, 10) : '', invoiceNumber: row.invoiceNumber || '', invoiceDate: row.invoiceDate ? String(row.invoiceDate).slice(0, 10) : '', paymentDate: row.paymentDate ? String(row.paymentDate).slice(0, 10) : '', status: row.status || 'Pending' });
    setOpen(true);
  }
  async function save() {
    const { _spId, ...rest } = form;
    const payload = { ...rest, amount: Number(rest.amount) || 0 };
    if (_spId) await update('ProjectPayment', _spId, payload);
    else await create('ProjectPayment', payload);
    setOpen(false);
  }
  function del(row) {
    if (window.confirm('Delete this payment?')) remove('ProjectPayment', row._spId);
  }

  return (
    <div>
      <PageHeader title="Payments">
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 140 }}>
          {FILTERS.map((f) => <option key={f}>{f}</option>)}
        </Select>
        {canEdit && <Button onClick={openNew}><Plus size={16} /> Add</Button>}
      </PageHeader>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 12 }}>
        <Totals label="Σ Paid" value={money(totals.Paid)} color="var(--pay-paid)" />
        <Totals label="Σ Outstanding" value={money(totals.Outstanding)} color="var(--pay-invoiced)" />
        <Totals label="Σ Overdue" value={money(totals.Overdue)} color="var(--pay-overdue)" />
      </div>

      <Card>
        {loading.ProjectPayment ? <CardContent><Skeleton height={120} /></CardContent>
          : <Table empty="No payments yet."
              columns={[
                { key: 'projectId', label: 'Project', render: (r) => projectName(r.projectId) },
                { key: 'milestone', label: 'Milestone' },
                { key: 'amount', label: 'Amount', render: (r) => money(r.amount, r.currency) },
                { key: 'dueDate', label: 'Due Date', render: (r) => fmtDate(r.dueDate) },
                { key: 'invoiceDate', label: 'Invoiced', render: (r) => fmtDate(r.invoiceDate) },
                { key: 'status', label: 'Status', render: (r) => <PaymentStatusPill status={effectivePaymentStatus(r)} /> },
                ...(canEdit ? [{ key: '_actions', label: '', sortable: false, width: 80, render: (r) => (
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button onClick={() => openEdit(r)} aria-label="Edit" title="Edit" style={iconBtnStyle}><Pencil size={15} /></button>
                    <button onClick={() => del(r)} aria-label="Delete" title="Delete" style={{ ...iconBtnStyle, color: 'var(--destructive)' }}><Trash2 size={15} /></button>
                  </div>
                ) }] : []),
              ]} rows={rows} />}
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} title={form?._spId ? 'Edit payment' : 'Add payment'}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>{form?._spId ? 'Save' : 'Add'}</Button></>}>
        {form && <>
          <Field label="Project">
            <Select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              {data.Project.map((p) => <option key={p._spId} value={p.projectId}>{p.projectName || p.name}</option>)}
            </Select>
          </Field>
          <Field label="Milestone"><Input value={form.milestone} onChange={(e) => setForm({ ...form, milestone: e.target.value })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <Field label="Amount"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="Currency">
              <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <option>PKR</option><option>USD</option><option>EUR</option>
              </Select>
            </Field>
          </div>
          <Field label="Due date"><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
          <Field label="Invoice number (optional)"><Input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} /></Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option>Pending</option><option>Invoiced</option><option>Partial</option><option>Paid</option><option>Overdue</option>
            </Select>
          </Field>
          {['Invoiced', 'Partial', 'Paid'].includes(form.status) && (
            <Field label="Invoice date"><Input type="date" value={form.invoiceDate || ''} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} /></Field>
          )}
          {['Partial', 'Paid'].includes(form.status) && (
            <Field label="Payment date"><Input type="date" value={form.paymentDate || ''} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} /></Field>
          )}
        </>}
      </Dialog>
    </div>
  );
}

function Totals({ label, value, color }) {
  return (
    <Card><CardContent style={{ padding: '0.9rem 1.1rem' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </CardContent></Card>
  );
}
