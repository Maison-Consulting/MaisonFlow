// Allocation / utilization helpers for assignments.

// Would adding (or updating) `candidate` push its resource past 100% allocation
// at any point during the candidate's date window? Peak concurrent allocation
// changes only at segment boundaries, so we check the running total at each
// overlapping assignment's start within the window.
//
// `assignments` is the caller's visible set (scoping may limit it). Dates are
// compared as 'YYYY-MM-DD'; empty start/end are treated as open-ended.
export function assignmentExceeds100(assignments, candidate) {
  const today = new Date().toISOString().slice(0, 10);
  const s = (candidate.startDate || '1900-01-01').slice(0, 10);
  const e = (candidate.endDate || '2999-12-31').slice(0, 10);
  const alloc = Number(candidate.allocationPercent) || 0;

  const segments = [{ start: s, end: e, alloc }];
  (assignments || []).forEach((a) => {
    if (a.resourceId !== candidate.resourceId) return;
    if (candidate._spId && a._spId === candidate._spId) return; // exclude self when editing
    const as = (a.startDate || '1900-01-01').slice(0, 10);
    const ae = (a.endDate || '2999-12-31').slice(0, 10);
    if (ae < today) return; // ended assignment — no longer consumes capacity
    if (as > e || ae < s) return; // no overlap with candidate window
    segments.push({ start: as, end: ae, alloc: Number(a.allocationPercent) || 0 });
  });

  const points = segments.map((x) => x.start).filter((p) => p >= s && p <= e);
  points.push(s);
  let peak = 0;
  for (const p of points) {
    const sum = segments
      .filter((x) => x.start <= p && x.end >= p)
      .reduce((t, x) => t + x.alloc, 0);
    if (sum > peak) peak = sum;
  }
  return peak > 100;
}
