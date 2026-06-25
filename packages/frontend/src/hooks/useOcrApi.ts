import { useCallback } from 'react';
import { useAuth } from 'react-oidc-context';
import { useRuntimeConfig } from './useRuntimeConfig';
import {
  OcrDocument,
  OcrRun,
  OcrModel,
  OcrFamily,
  EndpointFamily,
  ModelOptions,
  EndpointStatus,
} from '../types/ocr';

export interface UseOcrApiReturn {
  fetchDocuments: () => Promise<OcrDocument[]>;
  deleteS3Files: (
    s3Key: string,
    documentId: string,
    model?: OcrModel,
  ) => Promise<void>;
  fetchS3ImageUrl: (s3Key: string) => Promise<string | null>;
  fetchRunResult: (
    documentId: string,
    model: OcrModel,
  ) => Promise<OcrRun['result'] | null>;
  fetchEndpointStatus: () => Promise<EndpointStatus[]>;
  setEndpointPower: (
    family: EndpointFamily,
    enabled: boolean,
  ) => Promise<EndpointStatus | null>;
}

export function useOcrApi(): UseOcrApiReturn {
  const auth = useAuth();
  const runtimeConfig = useRuntimeConfig();
  const apiUrl = runtimeConfig.apiUrl || runtimeConfig.apis?.ocr;

  const fetchDocuments = useCallback(async (): Promise<OcrDocument[]> => {
    if (!apiUrl || !auth.user?.id_token) return [];
    try {
      const response = await fetch(`${apiUrl}/documents`, {
        method: 'GET',
        headers: {
          Authorization: auth.user.id_token,
        },
      });
      if (!response.ok) {
        console.error('Failed to fetch documents:', response.statusText);
        return [];
      }
      const data = await response.json();
      const fetchedDocs: OcrDocument[] = (data.documents ?? []).map(
        (doc: {
          id: string;
          filename: string;
          s3Key: string;
          createdAt: string;
          runs?: Array<{
            model: string;
            family: string;
            modelOptions?: ModelOptions;
            model_options?: ModelOptions;
            status: string;
            createdAt?: string;
            created_at?: string;
            processingTimeMs?: number;
            processing_time_ms?: number;
          }>;
        }) => ({
          id: doc.id,
          filename: doc.filename,
          s3Key: doc.s3Key,
          createdAt: new Date(doc.createdAt),
          imageAvailable: true,
          runs: (doc.runs ?? []).map((r) => ({
            model: r.model as OcrModel,
            family: r.family as OcrFamily,
            modelOptions: r.modelOptions ?? r.model_options,
            status: r.status as OcrRun['status'],
            createdAt: new Date(r.createdAt ?? r.created_at ?? doc.createdAt),
            processingTimeMs: r.processingTimeMs ?? r.processing_time_ms,
          })),
        }),
      );
      return fetchedDocs;
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      return [];
    }
  }, [apiUrl, auth.user?.id_token]);

  const deleteS3Files = useCallback(
    async (s3Key: string, documentId: string, model?: OcrModel) => {
      if (!apiUrl || !auth.user?.id_token) return;
      try {
        // Encode each path segment to handle Korean filenames and special characters
        const encodedS3Key = s3Key
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/');
        // document_id deletes the whole document; adding model deletes one run.
        const query = model
          ? `?document_id=${documentId}&model=${model}`
          : `?document_id=${documentId}`;
        const response = await fetch(
          `${apiUrl}/image/${encodedS3Key}${query}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: auth.user.id_token,
            },
          },
        );
        if (!response.ok) {
          console.error('Failed to delete S3 files:', response.statusText);
        }
      } catch (error) {
        console.error('Failed to delete S3 files:', error);
      }
    },
    [apiUrl, auth.user?.id_token],
  );

  const fetchS3ImageUrl = useCallback(
    async (s3Key: string): Promise<string | null> => {
      if (!apiUrl || !auth.user?.id_token) return null;
      try {
        // Encode each path segment to handle Korean filenames and special characters
        const encodedS3Key = s3Key
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/');
        const response = await fetch(`${apiUrl}/image/${encodedS3Key}`, {
          method: 'GET',
          headers: {
            Authorization: auth.user.id_token,
          },
        });
        if (!response.ok) {
          if (response.status === 404) {
            return null; // Image not found
          }
          throw new Error(`Failed to fetch image URL: ${response.statusText}`);
        }
        const data = await response.json();
        return data.url;
      } catch (error) {
        console.error('Failed to fetch S3 image URL:', error);
        return null;
      }
    },
    [apiUrl, auth.user?.id_token],
  );

  const fetchRunResult = useCallback(
    async (
      documentId: string,
      model: OcrModel,
    ): Promise<OcrRun['result'] | null> => {
      if (!apiUrl || !auth.user?.id_token) return null;
      try {
        const response = await fetch(`${apiUrl}/ocr/${documentId}/${model}`, {
          method: 'GET',
          headers: {
            Authorization: auth.user.id_token,
          },
        });
        if (!response.ok) {
          return null;
        }
        const data = await response.json();
        if (data.status === 'completed' && data.result) {
          return data.result;
        }
        return null;
      } catch (error) {
        console.error('Failed to fetch run result:', error);
        return null;
      }
    },
    [apiUrl, auth.user?.id_token],
  );

  const fetchEndpointStatus = useCallback(async (): Promise<
    EndpointStatus[]
  > => {
    if (!apiUrl || !auth.user?.id_token) return [];
    try {
      const response = await fetch(`${apiUrl}/endpoints`, {
        method: 'GET',
        headers: { Authorization: auth.user.id_token },
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.endpoints ?? []) as EndpointStatus[];
    } catch (error) {
      console.error('Failed to fetch endpoint status:', error);
      return [];
    }
  }, [apiUrl, auth.user?.id_token]);

  const setEndpointPower = useCallback(
    async (
      family: EndpointFamily,
      enabled: boolean,
    ): Promise<EndpointStatus | null> => {
      if (!apiUrl || !auth.user?.id_token) return null;
      try {
        const response = await fetch(`${apiUrl}/endpoints/${family}`, {
          method: 'POST',
          headers: {
            Authorization: auth.user.id_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ enabled }),
        });
        if (!response.ok) return null;
        const data = await response.json();
        return (data.endpoint ?? null) as EndpointStatus | null;
      } catch (error) {
        console.error('Failed to set endpoint power:', error);
        return null;
      }
    },
    [apiUrl, auth.user?.id_token],
  );

  return {
    fetchDocuments,
    deleteS3Files,
    fetchS3ImageUrl,
    fetchRunResult,
    fetchEndpointStatus,
    setEndpointPower,
  };
}
