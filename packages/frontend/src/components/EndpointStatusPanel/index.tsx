import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useOcrApi } from '../../hooks/useOcrApi';
import { EndpointStatus, OcrFamily, FAMILY_INFO } from '../../types/ocr';

// Poll endpoint status every 10s, and faster (3s) while any endpoint is
// transitioning, so the light flips to green shortly after it comes up.
const IDLE_POLL_MS = 10000;
const BUSY_POLL_MS = 3000;

const LIGHT_COLOR: Record<EndpointStatus['light'], string> = {
  green: '#22c55e',
  yellow: '#eab308',
  grey: '#6b7280',
};

const LIGHT_LABEL: Record<EndpointStatus['light'], string> = {
  green: 'Ready',
  yellow: 'Starting…',
  grey: 'Off',
};

/**
 * Sidebar panel showing each model family's SageMaker endpoint power state.
 * Click a row to toggle it on/off (autoscaling MinCapacity 1<->0). A dot shows
 * green (ready) / yellow (transitioning) / grey (off).
 */
export const EndpointStatusPanel: React.FC = () => {
  const { fetchEndpointStatus, setEndpointPower } = useOcrApi();
  const [statuses, setStatuses] = useState<EndpointStatus[]>([]);
  const [pending, setPending] = useState<Set<OcrFamily>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const next = await fetchEndpointStatus();
    if (next.length > 0) setStatuses(next);
    return next;
  }, [fetchEndpointStatus]);

  // Adaptive polling: schedule the next tick based on whether anything is busy.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const next = await refresh();
      if (cancelled) return;
      const busy = next.some((s) => s.light === 'yellow');
      timerRef.current = setTimeout(tick, busy ? BUSY_POLL_MS : IDLE_POLL_MS);
    };
    tick();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [refresh]);

  const handleToggle = useCallback(
    async (status: EndpointStatus) => {
      if (pending.has(status.family)) return;
      // Block toggling mid-transition: RegisterScalableTarget only works while
      // the endpoint is InService (Creating/Updating would 409).
      if (status.endpointStatus !== 'InService') return;
      setPending((prev) => new Set(prev).add(status.family));
      try {
        const updated = await setEndpointPower(status.family, !status.enabled);
        if (updated) {
          setStatuses((prev) =>
            prev.map((s) => (s.family === updated.family ? updated : s)),
          );
        }
        await refresh();
      } finally {
        setPending((prev) => {
          const n = new Set(prev);
          n.delete(status.family);
          return n;
        });
      }
    },
    [pending, setEndpointPower, refresh],
  );

  if (statuses.length === 0) return null;

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-title">Models (GPU)</div>
      <div className="endpoint-status-list">
        {statuses.map((status) => {
          const familyTitle =
            FAMILY_INFO[status.family]?.title ?? status.family;
          const isPending = pending.has(status.family);
          const isTransitioning = status.endpointStatus !== 'InService';
          const isBusy = isPending || isTransitioning;
          const light = isPending ? 'yellow' : status.light;
          return (
            <button
              key={status.family}
              type="button"
              className="endpoint-status-row"
              onClick={() => handleToggle(status)}
              disabled={isBusy}
              title={
                isTransitioning
                  ? `${familyTitle} is ${status.endpointStatus}… please wait`
                  : status.enabled
                    ? `${familyTitle} is ${LIGHT_LABEL[light]} — click to turn off`
                    : `${familyTitle} is off — click to turn on`
              }
            >
              <span
                className="endpoint-status-dot"
                style={{ background: LIGHT_COLOR[light] }}
              />
              <span className="endpoint-status-name">{familyTitle}</span>
              <span className="endpoint-status-state">
                {isPending ? '…' : LIGHT_LABEL[status.light]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
