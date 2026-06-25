import { useAuth } from 'react-oidc-context';
import * as React from 'react';
import { createContext, useState, useCallback } from 'react';
import { OcrDocument, OcrRun, OcrModel, MODEL_INFO } from '../../types/ocr';
import { EndpointStatusPanel } from '../EndpointStatusPanel';

// Icons
const DocumentIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const PlusIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const LogOutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export interface AppLayoutContext {
  documents: OcrDocument[];
  setDocuments: (documents: OcrDocument[]) => void;
  addDocument: (document: OcrDocument) => void;
  updateDocument: (id: string, updates: Partial<OcrDocument>) => void;
  removeDocument: (id: string) => void;
  replaceDocumentId: (oldId: string, newId: string) => void;
  // Run helpers (a run = one model's OCR result on a document)
  upsertRun: (documentId: string, run: OcrRun) => void;
  updateRun: (
    documentId: string,
    model: OcrModel,
    updates: Partial<OcrRun>,
  ) => void;
  removeRun: (documentId: string, model: OcrModel) => void;
  currentDocumentId: string | null;
  setCurrentDocumentId: (id: string | null) => void;
  currentModel: OcrModel | null;
  setCurrentModel: (model: OcrModel | null) => void;
  onNewJob: () => void;
  setOnNewJob: (handler: () => void) => void;
  // Callback for deleting S3 files when a document/run is deleted
  onDeleteS3Files: (
    s3Key: string,
    documentId: string,
    model?: OcrModel,
  ) => Promise<void>;
  setOnDeleteS3Files: (
    handler: (
      s3Key: string,
      documentId: string,
      model?: OcrModel,
    ) => Promise<void>,
  ) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};
// eslint-disable-next-line @typescript-eslint/no-empty-function
const noopAsync = async () => {};

// eslint-disable-next-line no-redeclare -- intentional: interface + its context value share one name
export const AppLayoutContext = createContext<AppLayoutContext>({
  documents: [],
  setDocuments: noop,
  addDocument: noop,
  updateDocument: noop,
  removeDocument: noop,
  replaceDocumentId: noop,
  upsertRun: noop,
  updateRun: noop,
  removeRun: noop,
  currentDocumentId: null,
  setCurrentDocumentId: noop,
  currentModel: null,
  setCurrentModel: noop,
  onNewJob: noop,
  setOnNewJob: noop,
  onDeleteS3Files: noopAsync,
  setOnDeleteS3Files: noop,
});

const AppLayout: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { user, removeUser, signoutRedirect, clearStaleState } = useAuth();
  const [documents, setDocumentsState] = useState<OcrDocument[]>([]);
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(
    null,
  );
  const [currentModel, setCurrentModel] = useState<OcrModel | null>(null);
  const [onNewJobHandler, setOnNewJobHandler] = useState<() => void>(
    () => noop,
  );
  const [onDeleteS3FilesHandler, setOnDeleteS3FilesHandler] = useState<
    (s3Key: string, documentId: string, model?: OcrModel) => Promise<void>
  >(() => noopAsync);

  // Wrapper to set documents from API
  const setDocuments = useCallback((newDocs: OcrDocument[]) => {
    setDocumentsState(newDocs);
  }, []);

  const addDocument = useCallback((doc: OcrDocument) => {
    setDocumentsState((prev) => [doc, ...prev]);
    setCurrentDocumentId(doc.id);
  }, []);

  const updateDocument = useCallback(
    (id: string, updates: Partial<OcrDocument>) => {
      setDocumentsState((prev) =>
        prev.map((doc) => (doc.id === id ? { ...doc, ...updates } : doc)),
      );
    },
    [],
  );

  const removeDocument = useCallback(
    (id: string) => {
      const doc = documents.find((d) => d.id === id);
      if (doc?.s3Key) {
        // Delete the whole document tree (input + all runs) in S3.
        onDeleteS3FilesHandler(doc.s3Key, doc.id).catch((err) => {
          console.error('Failed to delete S3 files:', err);
        });
      }
      setDocumentsState((prev) => prev.filter((doc) => doc.id !== id));
      setCurrentDocumentId((prev) => (prev === id ? null : prev));
    },
    [documents, onDeleteS3FilesHandler],
  );

  const replaceDocumentId = useCallback((oldId: string, newId: string) => {
    setDocumentsState((prev) =>
      prev.map((doc) => (doc.id === oldId ? { ...doc, id: newId } : doc)),
    );
    setCurrentDocumentId((prev) => (prev === oldId ? newId : prev));
  }, []);

  // Add or replace a run (by model) on a document.
  const upsertRun = useCallback((documentId: string, run: OcrRun) => {
    setDocumentsState((prev) =>
      prev.map((doc) =>
        doc.id === documentId
          ? {
              ...doc,
              runs: [...doc.runs.filter((r) => r.model !== run.model), run],
            }
          : doc,
      ),
    );
  }, []);

  const updateRun = useCallback(
    (documentId: string, model: OcrModel, updates: Partial<OcrRun>) => {
      setDocumentsState((prev) =>
        prev.map((doc) =>
          doc.id === documentId
            ? {
                ...doc,
                runs: doc.runs.map((r) =>
                  r.model === model ? { ...r, ...updates } : r,
                ),
              }
            : doc,
        ),
      );
    },
    [],
  );

  const removeRun = useCallback(
    (documentId: string, model: OcrModel) => {
      const doc = documents.find((d) => d.id === documentId);
      if (doc?.s3Key) {
        onDeleteS3FilesHandler(doc.s3Key, documentId, model).catch((err) => {
          console.error('Failed to delete run files:', err);
        });
      }
      setDocumentsState((prev) =>
        prev.map((doc) =>
          doc.id === documentId
            ? { ...doc, runs: doc.runs.filter((r) => r.model !== model) }
            : doc,
        ),
      );
    },
    [documents, onDeleteS3FilesHandler],
  );

  const handleSignOut = () => {
    removeUser();
    signoutRedirect({
      post_logout_redirect_uri: window.location.origin,
      extraQueryParams: {
        redirect_uri: window.location.origin,
        response_type: 'code',
      },
    });
    clearStaleState();
  };

  const handleNewJob = () => {
    setCurrentDocumentId(null);
    setCurrentModel(null);
    onNewJobHandler();
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const userInitial = user?.profile?.email?.charAt(0).toUpperCase() || 'U';
  const userName = String(user?.profile?.['cognito:username'] || 'User');
  const userEmail = String(user?.profile?.email || '');

  return (
    <AppLayoutContext.Provider
      value={{
        documents,
        setDocuments,
        addDocument,
        updateDocument,
        removeDocument,
        replaceDocumentId,
        upsertRun,
        updateRun,
        removeRun,
        currentDocumentId,
        setCurrentDocumentId,
        currentModel,
        setCurrentModel,
        onNewJob: handleNewJob,
        setOnNewJob: (handler) => setOnNewJobHandler(() => handler),
        onDeleteS3Files: onDeleteS3FilesHandler,
        setOnDeleteS3Files: (handler) =>
          setOnDeleteS3FilesHandler(() => handler),
      }}
    >
      <div className="app-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <img
                src="/logo.png"
                alt="AWS OCR Lab"
                className="sidebar-logo-img"
              />
              <span>AWS OCR Lab</span>
            </div>
          </div>

          <div className="sidebar-content">
            {/* New Job Button */}
            <div style={{ padding: '8px 0 16px' }}>
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={handleNewJob}
              >
                <PlusIcon />
                New Document
              </button>
            </div>

            {/* Model endpoint power (GPU on/off + status lights) */}
            <EndpointStatusPanel />

            {/* Document History */}
            <div className="sidebar-section">
              <div className="sidebar-section-title">Recent Files</div>
              {documents.length === 0 ? (
                <div
                  style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '13px',
                  }}
                >
                  No files yet
                </div>
              ) : (
                documents.map((doc) => {
                  const isAccessible =
                    doc.s3Key && doc.imageAvailable !== false;
                  const anyProcessing = doc.runs.some(
                    (r) => r.status === 'processing',
                  );
                  return (
                    <div
                      key={doc.id}
                      className={`sidebar-item ${currentDocumentId === doc.id ? 'active' : ''} ${!isAccessible ? 'no-image' : ''}`}
                      onClick={() =>
                        isAccessible && setCurrentDocumentId(doc.id)
                      }
                      style={{
                        cursor: isAccessible ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <span className="sidebar-item-icon">
                        {anyProcessing ? <ClockIcon /> : <DocumentIcon />}
                      </span>
                      <span className="sidebar-item-text">{doc.filename}</span>
                      <span className="sidebar-item-model">
                        {doc.runs.length > 0
                          ? doc.runs
                              .map(
                                (r) =>
                                  MODEL_INFO[r.model]?.shortLabel ?? r.model,
                              )
                              .join(', ')
                          : '—'}
                      </span>
                      <span className="sidebar-item-time">
                        {formatTime(doc.createdAt)}
                      </span>
                      <button
                        className="sidebar-item-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeDocument(doc.id);
                        }}
                        title="Delete"
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Storage Notice */}
            <div className="sidebar-notice">
              Files stored in cloud. Images and results expire after 30 days.
            </div>
          </div>

          {/* User Footer */}
          <div className="sidebar-footer">
            <div className="user-info" onClick={handleSignOut} title="Sign out">
              <div className="user-avatar">{userInitial}</div>
              <div className="user-details">
                <div className="user-name">{userName}</div>
                <div className="user-email">{userEmail}</div>
              </div>
              <span
                style={{
                  color: 'var(--text-muted)',
                  width: '18px',
                  height: '18px',
                }}
              >
                <LogOutIcon />
              </span>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="main-content">
          {children}
          <footer className="app-footer">
            Powered by <span className="footer-team">Korean PACE Team</span>
          </footer>
        </main>
      </div>
    </AppLayoutContext.Provider>
  );
};

export default AppLayout;
