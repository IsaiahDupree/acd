'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface PanelDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

export function usePanelData<T = any>(
  endpoint: string | undefined,
  refreshInterval = 10000,
): PanelDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!endpoint);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [prevEndpoint, setPrevEndpoint] = useState(endpoint);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync loading flag to the endpoint during render (avoids setState-in-effect).
  if (endpoint !== prevEndpoint) {
    setPrevEndpoint(endpoint);
    setLoading(!!endpoint);
  }

  const fetchData = useCallback(async () => {
    if (!endpoint) return;
    try {
      const res = await fetch(endpoint, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.message || 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    if (!endpoint) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async-poll: setState runs post-await, not synchronously
    fetchData();
    timerRef.current = setInterval(fetchData, refreshInterval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [endpoint, refreshInterval, fetchData]);

  return { data, loading, error, lastUpdated, refresh: fetchData };
}

export function getNestedValue(obj: any, key: string): any {
  return key.split('.').reduce((acc, k) => acc?.[k], obj);
}
