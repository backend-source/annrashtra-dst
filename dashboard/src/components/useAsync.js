import { useState, useEffect, useCallback } from 'react';

// Small data-loading helper: returns { data, error, loading, reload }.
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    fn().then(
      (data) => setState({ data, error: '', loading: false }),
      (err) => setState({ data: null, error: err.message, loading: false }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return { ...state, reload: run };
}
