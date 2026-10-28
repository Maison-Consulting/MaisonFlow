import { useState, useRef, useCallback } from 'react';

// Guards a save/create action against double submission.
//   const [busy, guard] = useSubmitGuard();
//   <Button onClick={guard(save)} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
// The ref blocks a second click that lands before React re-renders the
// disabled button; `busy` drives the UI. A thrown error (create/update already
// toast it) is swallowed so the form simply stays open for a retry.
export function useSubmitGuard() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const guard = useCallback((fn) => async (...args) => {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true);
    try {
      return await fn(...args);
    } catch {
      return undefined;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return [busy, guard];
}
