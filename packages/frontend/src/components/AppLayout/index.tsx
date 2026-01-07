import { useAuth } from 'react-oidc-context';
import * as React from 'react';
import { createContext, useState, useCallback, useEffect } from 'react';
import { OcrJob } from '../../types/ocr';

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

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const AlertIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const LoaderIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className="animate-spin"
  >
    <line x1="12" y1="2" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
    <line x1="2" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="22" y2="12" />
    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export interface AppLayoutContext {
  jobs: OcrJob[];
  addJob: (job: OcrJob) => void;
  updateJob: (id: string, updates: Partial<OcrJob>) => void;
  removeJob: (id: string) => void;
  replaceJobId: (oldId: string, newId: string) => void;
  currentJobId: string | null;
  setCurrentJobId: (id: string | null) => void;
  onNewJob: () => void;
  setOnNewJob: (handler: () => void) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

export const AppLayoutContext = createContext<AppLayoutContext>({
  jobs: [],
  addJob: noop,
  updateJob: noop,
  removeJob: noop,
  replaceJobId: noop,
  currentJobId: null,
  setCurrentJobId: noop,
  onNewJob: noop,
  setOnNewJob: noop,
});

const STORAGE_KEY = 'ocr-vision-lab-jobs';

// Load jobs from localStorage
const loadJobsFromStorage = (): OcrJob[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Convert date strings back to Date objects
      return parsed.map((job: OcrJob) => ({
        ...job,
        createdAt: new Date(job.createdAt),
      }));
    }
  } catch (e) {
    console.error('Failed to load jobs from storage:', e);
  }
  return [];
};

// Save jobs to localStorage
const saveJobsToStorage = (jobs: OcrJob[]) => {
  try {
    // Limit to 10 most recent jobs to avoid storage limits
    const toSave = jobs.slice(0, 10);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.error('Failed to save jobs to storage:', e);
  }
};

const MAX_JOBS_IN_MEMORY = 20;

const AppLayout: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { user, removeUser, signoutRedirect, clearStaleState } = useAuth();
  const [jobs, setJobs] = useState<OcrJob[]>(() => loadJobsFromStorage());
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [onNewJobHandler, setOnNewJobHandler] = useState<() => void>(
    () => noop,
  );

  // Save jobs to localStorage whenever they change
  useEffect(() => {
    saveJobsToStorage(jobs);
  }, [jobs]);

  const addJob = useCallback((job: OcrJob) => {
    setJobs((prev) => {
      const newJobs = [job, ...prev];
      // Limit jobs in memory and clear imageData from old jobs
      return newJobs.slice(0, MAX_JOBS_IN_MEMORY).map((j, idx) => ({
        ...j,
        // Keep imageData only for 10 most recent jobs in memory
        imageData: idx < 10 ? j.imageData : undefined,
      }));
    });
    setCurrentJobId(job.id);
  }, []);

  const updateJob = useCallback((id: string, updates: Partial<OcrJob>) => {
    setJobs((prev) =>
      prev.map((job) => (job.id === id ? { ...job, ...updates } : job)),
    );
  }, []);

  const removeJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((job) => job.id !== id));
    setCurrentJobId((prev) => (prev === id ? null : prev));
  }, []);

  const replaceJobId = useCallback((oldId: string, newId: string) => {
    setJobs((prev) =>
      prev.map((job) => (job.id === oldId ? { ...job, id: newId } : job)),
    );
    setCurrentJobId((prev) => (prev === oldId ? newId : prev));
  }, []);

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
    setCurrentJobId(null);
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

  const getStatusIcon = (status: OcrJob['status']) => {
    switch (status) {
      case 'completed':
        return <CheckIcon />;
      case 'failed':
        return <AlertIcon />;
      default:
        return <LoaderIcon />;
    }
  };

  const userInitial = user?.profile?.email?.charAt(0).toUpperCase() || 'U';
  const userName = String(user?.profile?.['cognito:username'] || 'User');
  const userEmail = String(user?.profile?.email || '');

  return (
    <AppLayoutContext.Provider
      value={{
        jobs,
        addJob,
        updateJob,
        removeJob,
        replaceJobId,
        currentJobId,
        setCurrentJobId,
        onNewJob: handleNewJob,
        setOnNewJob: (handler) => setOnNewJobHandler(() => handler),
      }}
    >
      <div className="app-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <img
                src="/logo.png"
                alt="PaddleOCR Service"
                className="sidebar-logo-img"
              />
              <span>PaddleOCR Service</span>
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

            {/* Job History */}
            <div className="sidebar-section">
              <div className="sidebar-section-title">Recent Jobs</div>
              {jobs.length === 0 ? (
                <div
                  style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '13px',
                  }}
                >
                  No jobs yet
                </div>
              ) : (
                jobs.map((job) => (
                  <div
                    key={job.id}
                    className={`sidebar-item ${currentJobId === job.id ? 'active' : ''} ${!job.imageData ? 'no-image' : ''}`}
                    onClick={() => job.imageData && setCurrentJobId(job.id)}
                    style={{
                      cursor: job.imageData ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <span className="sidebar-item-icon">
                      {job.status === 'processing' ? (
                        <ClockIcon />
                      ) : (
                        <DocumentIcon />
                      )}
                    </span>
                    <span className="sidebar-item-text">{job.filename}</span>
                    <span className="sidebar-item-model">
                      {job.model === 'paddleocr-vl'
                        ? 'VL'
                        : job.model === 'pp-ocrv5'
                          ? 'v5'
                          : 'Struct'}
                    </span>
                    <span className="sidebar-item-time">
                      {formatTime(job.createdAt)}
                    </span>
                    <button
                      className="sidebar-item-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeJob(job.id);
                      }}
                      title="Delete"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Storage Notice */}
            <div className="sidebar-notice">
              Up to 10 recent jobs stored locally. Clearing browser cache will
              remove all history.
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
