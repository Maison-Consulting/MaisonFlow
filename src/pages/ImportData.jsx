import React, { useState } from 'react';
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { Card, CardHeader, CardContent, Button } from '../components/ui/primitives.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { SCHEMA } from '../lib/schema.js';

// Minimal CSV parser (handles quoted fields, commas, CRLF). For production-grade
// edge cases (embedded newlines in quotes) swap in papaparse.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Validate parsed rows against a list's declared columns.
function validate(def, rows) {
  if (!rows.length) return { ok: false, error: 'File is empty.' };
  const header = rows[0].map((h) => h.trim());
  const known = new Set(def.columns.map((c) => c.name));
  const idField = def.columns[0].name;
  const unknown = header.filter((h) => !known.has(h));
  const records = rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => { if (known.has(h)) obj[h] = (r[i] ?? '').trim(); });
    return obj;
  });
  const errors = [];
  records.forEach((rec, idx) => {
    const natural = def.columns[1]?.name;
    if (natural && !rec[natural] && !rec[idField]) errors.push(`Row ${idx + 2}: missing ${natural}`);
  });
  return { ok: errors.length === 0, header, unknown, records, errors, idField };
}

export function ImportData() {
  const { create } = useData();
  const [state, setState] = useState({}); // listName -> { parsed, committing, done }

  function onFile(def, file) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = validate(def, parseCsv(reader.result));
      setState((s) => ({ ...s, [def.name]: { parsed, done: false } }));
    };
    reader.readAsText(file);
  }

  async function commit(def) {
    const entry = state[def.name];
    if (!entry?.parsed?.ok) return;
    setState((s) => ({ ...s, [def.name]: { ...s[def.name], committing: true } }));
    for (const rec of entry.parsed.records) {
      // eslint-disable-next-line no-await-in-loop
      await create(def.name, rec).catch(() => {});
    }
    setState((s) => ({ ...s, [def.name]: { ...s[def.name], committing: false, done: true } }));
  }

  return (
    <div>
      <PageHeader title="Import Data" />
      <p style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', marginBottom: '1rem' }}>
        Drop a CSV per list. The first row must be column headers matching the schema field names.
        Records are validated before you commit; committing writes through to SharePoint.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {SCHEMA.map((def) => {
          const entry = state[def.name];
          const p = entry?.parsed;
          return (
            <Card key={def.name}>
              <CardHeader><strong>{def.name}</strong> <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>({def.columns.map((c) => c.name).join(', ')})</span></CardHeader>
              <CardContent>
                <label
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(def, f); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '1.1rem', border: '1.5px dashed var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}
                >
                  <Upload size={18} />
                  <span>Drop CSV or click to browse</span>
                  <input type="file" accept=".csv,text/csv" style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files[0]; if (f) onFile(def, f); }} />
                </label>

                {p && (
                  <div style={{ marginTop: 10, fontSize: '0.8rem' }}>
                    {p.error ? <Msg bad>{p.error}</Msg> : <>
                      <div>{p.records.length} record(s) parsed.</div>
                      {p.unknown.length > 0 && <Msg bad>Ignored unknown columns: {p.unknown.join(', ')}</Msg>}
                      {p.errors.slice(0, 5).map((e, i) => <Msg key={i} bad>{e}</Msg>)}
                      {p.ok && !entry.done && <Msg>Looks valid — ready to commit.</Msg>}
                      {entry.done && <Msg>Imported.</Msg>}
                      {p.ok && !entry.done && (
                        <Button size="sm" style={{ marginTop: 8 }} disabled={entry.committing} onClick={() => commit(def)}>
                          {entry.committing ? 'Importing…' : `Commit ${p.records.length}`}
                        </Button>
                      )}
                    </>}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Msg({ children, bad }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, color: bad ? 'var(--destructive)' : 'var(--rag-green)' }}>
      {bad ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />} {children}
    </div>
  );
}
