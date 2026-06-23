import React from 'react';
import { Badge } from './ui/primitives.jsx';

const RAG = {
  Green: 'var(--rag-green)',
  Amber: 'var(--rag-amber)',
  Red: 'var(--rag-red)',
};

export function RagDot({ status }) {
  return (
    <span
      title={status}
      style={{
        display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
        background: RAG[status] || 'var(--muted)', verticalAlign: 'middle',
      }}
    />
  );
}

export function RagBadge({ status }) {
  return <Badge color={RAG[status]}>{status || '—'}</Badge>;
}

const RESOURCE_STATUS = {
  Active: 'var(--rag-green)',
  'On Leave': 'var(--rag-amber)',
  Inactive: 'var(--pay-pending)',
};
export function ResourceStatusPill({ status }) {
  return <Badge color={RESOURCE_STATUS[status]}>{status || '—'}</Badge>;
}

const PAYMENT_STATUS = {
  Pending: 'var(--pay-pending)',
  Invoiced: 'var(--pay-invoiced)',
  Paid: 'var(--pay-paid)',
  Overdue: 'var(--pay-overdue)',
};
export function PaymentStatusPill({ status }) {
  return <Badge color={PAYMENT_STATUS[status]}>{status || '—'}</Badge>;
}

const SEVERITY = {
  Low: 'var(--rag-green)',
  Medium: 'var(--rag-amber)',
  High: 'var(--rag-red)',
  Critical: 'var(--destructive)',
};
export function SeverityPill({ level }) {
  return <Badge color={SEVERITY[level]}>{level || '—'}</Badge>;
}

const TASK_PRIORITY = {
  Critical: 'var(--destructive)',
  High: 'var(--rag-red)',
  Medium: 'var(--rag-amber)',
  Low: 'var(--rag-green)',
};
export function PriorityPill({ level }) {
  return <Badge color={TASK_PRIORITY[level]}>{level || '—'}</Badge>;
}

export function money(amount, currency = 'USD') {
  if (amount == null || amount === '') return '—';
  const n = Number(amount);
  if (n >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${currency} ${(n / 1000).toFixed(1)}k`;
  return `${currency} ${n.toLocaleString()}`;
}

export function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date)) return d;
  return date.toISOString().slice(0, 10);
}

export function nextSunday() {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

// Is an assignment/date-range "live" on a given day (default: today)?
// Compared at date granularity, end-inclusive. A missing start means it has
// already begun; a missing end means it never expires (open-ended).
export function isActiveOn(start, end, on) {
  const today = (on ? new Date(on) : new Date()).toISOString().slice(0, 10);
  if (start && today < String(start).slice(0, 10)) return false; // not started yet
  if (end && today > String(end).slice(0, 10)) return false;     // ended/expired
  return true;
}

// True once the end date has passed (exclusive of the end day itself).
export function isExpired(end, on) {
  if (!end) return false;
  const today = (on ? new Date(on) : new Date()).toISOString().slice(0, 10);
  return today > String(end).slice(0, 10);
}
