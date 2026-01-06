import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from 'react-oidc-context';
import { useRuntimeConfig } from './useRuntimeConfig';
import { OcrStatusResponse } from '../types/ocr';

interface UseOcrResultOptions {
  pollingInterval?: number;
  maxRetries?: number;
}

interface UseOcrResultReturn {
  status: 'idle' | 'polling' | 'completed' | 'failed';
  result: OcrStatusResponse | null;
  error: string | null;
  startPolling: (jobId: string) => void;
  stopPolling: () => void;
}

export const useOcrResult = (
  options: UseOcrResultOptions = {},
): UseOcrResultReturn => {
  const { pollingInterval = 3000, maxRetries = 60 } = options;
  const auth = useAuth();
  const { apiUrl } = useRuntimeConfig();

  const [status, setStatus] = useState<
    'idle' | 'polling' | 'completed' | 'failed'
  >('idle');
  const [result, setResult] = useState<OcrStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retriesRef = useRef(0);
  const jobIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    retriesRef.current = 0;
    jobIdRef.current = null;
  }, []);

  const pollStatus = useCallback(async () => {
    if (!jobIdRef.current || !apiUrl) return;

    try {
      const response = await fetch(`${apiUrl}/ocr/${jobIdRef.current}`, {
        headers: {
          Authorization: auth.user?.id_token || '',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: OcrStatusResponse = await response.json();

      if (data.status === 'completed') {
        setResult(data);
        setStatus('completed');
        stopPolling();
      } else if (data.status === 'failed') {
        setError(data.error || 'OCR processing failed');
        setStatus('failed');
        stopPolling();
      } else {
        retriesRef.current += 1;
        if (retriesRef.current >= maxRetries) {
          setError('Polling timeout: OCR processing took too long');
          setStatus('failed');
          stopPolling();
        }
      }
    } catch (err) {
      console.error('Polling error:', err);
      retriesRef.current += 1;
      if (retriesRef.current >= maxRetries) {
        setError('Failed to get OCR result after multiple attempts');
        setStatus('failed');
        stopPolling();
      }
    }
  }, [apiUrl, auth.user?.id_token, maxRetries, stopPolling]);

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();

      jobIdRef.current = jobId;
      retriesRef.current = 0;
      setStatus('polling');
      setResult(null);
      setError(null);

      pollStatus();
      intervalRef.current = setInterval(pollStatus, pollingInterval);
    },
    [pollStatus, pollingInterval, stopPolling],
  );

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    status,
    result,
    error,
    startPolling,
    stopPolling,
  };
};
