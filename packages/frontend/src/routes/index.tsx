import React, {
  useState,
  useCallback,
  useRef,
  useContext,
  useEffect,
} from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useAuth } from 'react-oidc-context';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import * as pdfjsLib from 'pdfjs-dist';
import { useRuntimeConfig } from '../hooks/useRuntimeConfig';
import { AppLayoutContext } from '../components/AppLayout';
import DocumentEditor from '../components/DocumentEditor';
import {
  OcrModel,
  OcrJob,
  OcrBlock,
  OcrResultData,
  OcrV5ResultData,
  OcrStructureResultData,
  ResultViewTab,
  MODEL_INFO,
  PP_OCRV5_OPTION_INFO,
  PP_STRUCTUREV3_OPTION_INFO,
  SUPPORTED_LANGUAGES,
  OcrLanguage,
  getDefaultOptionsForModel,
  ModelOptions,
  isOcrV5Result,
  isStructureResult,
  getV5Bbox,
} from '../types/ocr';

// Set up PDF.js worker - use CDN for reliability
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// Helper function to render PDF page to image
async function renderPdfToImage(
  arrayBuffer: ArrayBuffer,
  pageNumber: number = 1,
): Promise<{ dataUrl: string | null; totalPages: number }> {
  try {
    // Make a copy of the ArrayBuffer to avoid "detached ArrayBuffer" error
    const arrayBufferCopy = arrayBuffer.slice(0);
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBufferCopy),
    });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    // Ensure page number is valid
    const validPageNum = Math.max(1, Math.min(pageNumber, totalPages));
    const page = await pdf.getPage(validPageNum);

    // Use a reasonable scale for preview (2x for good quality)
    const scale = 2;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return { dataUrl: null, totalPages };

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext as Parameters<typeof page.render>[0])
      .promise;

    return { dataUrl: canvas.toDataURL('image/jpeg', 0.9), totalPages };
  } catch (error) {
    console.error('Failed to render PDF:', error);
    return { dataUrl: null, totalPages: 0 };
  }
}

export const Route = createFileRoute('/')({
  component: OcrPage,
});

// Icons
const UploadIcon = () => (
  <svg
    className="upload-zone-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const CheckIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const PlayIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const ZoomInIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const ZoomOutIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const FitIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);

const RetryIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

type Step = 'upload' | 'options' | 'result';

function OcrPage() {
  const auth = useAuth();
  const runtimeConfig = useRuntimeConfig();
  const {
    jobs,
    setJobs,
    addJob,
    updateJob,
    replaceJobId,
    currentJobId,
    setCurrentJobId,
    setOnNewJob,
    setOnDeleteS3Files,
  } = useContext(AppLayoutContext);

  // API URL for convenience
  const apiUrl = runtimeConfig.apiUrl || runtimeConfig.apis?.ocr;

  // Fetch jobs from API
  const fetchJobs = useCallback(async () => {
    if (!apiUrl || !auth.user?.id_token) return;
    try {
      const response = await fetch(`${apiUrl}/jobs`, {
        method: 'GET',
        headers: {
          Authorization: auth.user.id_token,
        },
      });
      if (!response.ok) {
        console.error('Failed to fetch jobs:', response.statusText);
        return;
      }
      const data = await response.json();
      // Convert API response to OcrJob format
      const fetchedJobs: OcrJob[] = data.jobs.map((job: {
        id: string;
        filename: string;
        s3Key: string;
        createdAt: string;
        model: string;
        modelOptions: ModelOptions;
        status: string;
      }) => ({
        id: job.id,
        filename: job.filename,
        s3Key: job.s3Key,
        createdAt: new Date(job.createdAt),
        model: job.model as OcrModel,
        modelOptions: job.modelOptions,
        status: job.status as OcrJob['status'],
        imageAvailable: true, // Assume available, will be checked when loading
      }));
      setJobs(fetchedJobs);
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    }
  }, [apiUrl, auth.user?.id_token, setJobs]);

  // Fetch jobs on mount when authenticated
  useEffect(() => {
    if (auth.isAuthenticated && apiUrl) {
      fetchJobs();
    }
  }, [auth.isAuthenticated, apiUrl, fetchJobs]);

  // Delete S3 files function
  const deleteS3Files = useCallback(
    async (s3Key: string, jobId: string) => {
      if (!apiUrl || !auth.user?.id_token) return;
      try {
        // Encode each path segment to handle Korean filenames and special characters
        const encodedS3Key = s3Key
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/');
        // Pass jobId as query parameter for output deletion
        const response = await fetch(`${apiUrl}/image/${encodedS3Key}?job_id=${jobId}`, {
          method: 'DELETE',
          headers: {
            Authorization: auth.user.id_token,
          },
        });
        if (!response.ok) {
          console.error('Failed to delete S3 files:', response.statusText);
        }
      } catch (error) {
        console.error('Failed to delete S3 files:', error);
      }
    },
    [apiUrl, auth.user?.id_token],
  );

  // Fetch presigned URL for S3 image
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

  // Fetch job result from API (polling endpoint)
  const fetchJobResult = useCallback(
    async (jobId: string): Promise<OcrJob['result'] | null> => {
      if (!apiUrl || !auth.user?.id_token) return null;
      try {
        const response = await fetch(`${apiUrl}/ocr/${jobId}`, {
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
        console.error('Failed to fetch job result:', error);
        return null;
      }
    },
    [apiUrl, auth.user?.id_token],
  );

  // Set delete S3 files handler for AppLayout
  useEffect(() => {
    setOnDeleteS3Files(deleteS3Files);
  }, [deleteS3Files, setOnDeleteS3Files]);

  // UI State
  const [step, setStep] = useState<Step>('upload');
  const [isDragging, setIsDragging] = useState(false);

  // File State
  const [imageData, setImageData] = useState<{
    base64: string;
    filename: string;
  } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PDF Page State
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [totalPdfPages, setTotalPdfPages] = useState(1);
  const pdfArrayBufferRef = useRef<ArrayBuffer | null>(null);

  // Options State
  const [selectedModel, setSelectedModel] = useState<OcrModel>('paddleocr-vl');
  const [modelOptions, setModelOptions] = useState<ModelOptions>(
    getDefaultOptionsForModel('paddleocr-vl'),
  );

  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);

  // Result State
  const [resultTab, setResultTab] = useState<ResultViewTab>('blocks');
  const [hoveredBlockId, setHoveredBlockId] = useState<number | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<OcrBlock | null>(null);
  const [selectedBlockImage, setSelectedBlockImage] = useState<string | null>(
    null,
  );
  const [isMarkdownEditMode, setIsMarkdownEditMode] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Zoom & Pan State
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showBbox, setShowBbox] = useState(true);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const resultImageRef = useRef<HTMLImageElement>(null);

  // Current job (from history)
  const currentJob = jobs.find((j) => j.id === currentJobId);

  // Reset loadedImageUrl when previewUrl changes
  useEffect(() => {
    setLoadedImageUrl(null);
    // For data URLs, the image might already be complete, so check after a tick
    if (previewUrl?.startsWith('data:')) {
      const checkComplete = () => {
        if (resultImageRef.current?.complete && resultImageRef.current.naturalWidth > 0) {
          setLoadedImageUrl(previewUrl);
        }
      };
      // Check immediately and after a short delay
      requestAnimationFrame(checkComplete);
    }
  }, [previewUrl]);

  // Reset to upload when "New Document" is clicked
  useEffect(() => {
    setOnNewJob(() => {
      setStep('upload');
      setImageData(null);
      setPreviewUrl(null);
      setSelectedModel('paddleocr-vl');
      setModelOptions(getDefaultOptionsForModel('paddleocr-vl'));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch to result view when viewing a job from history
  useEffect(() => {
    if (currentJob) {
      // Load image from S3
      if (currentJob.s3Key) {
        (async () => {
          const imageUrl = await fetchS3ImageUrl(currentJob.s3Key!);
          if (!imageUrl) {
            // Image not found in S3, mark as unavailable
            updateJob(currentJob.id, { imageAvailable: false });
            setPreviewUrl(null);
            return;
          }
          // Mark as available
          if (currentJob.imageAvailable !== true) {
            updateJob(currentJob.id, { imageAvailable: true });
          }

          // Check if it's a PDF - render first page to image
          if (currentJob.filename.toLowerCase().endsWith('.pdf')) {
            try {
              const response = await fetch(imageUrl);
              const arrayBuffer = await response.arrayBuffer();
              pdfArrayBufferRef.current = arrayBuffer;
              const { dataUrl, totalPages } = await renderPdfToImage(arrayBuffer, 1);
              setTotalPdfPages(totalPages);
              setCurrentPdfPage(1);
              if (dataUrl) {
                setPreviewUrl(dataUrl);
              } else {
                setPreviewUrl(null);
              }
            } catch (error) {
              console.error('Failed to render PDF:', error);
              setPreviewUrl(null);
            }
          } else {
            pdfArrayBufferRef.current = null;
            setTotalPdfPages(1);
            setCurrentPdfPage(1);
            setPreviewUrl(imageUrl);
          }
        })();
      }

      // Fetch result from S3 if not already loaded
      if (!currentJob.result && currentJob.status === 'completed') {
        (async () => {
          const result = await fetchJobResult(currentJob.id);
          if (result) {
            updateJob(currentJob.id, { result });
            setStep('result');
          }
        })();
      } else if (currentJob.result) {
        // Switch to result view if job has result
        setStep('result');
      }

      // Reset zoom and pan when switching jobs
      setZoomLevel(1);
      setPanPosition({ x: 0, y: 0 });
      // Reset edit mode when switching jobs
      setIsMarkdownEditMode(false);
      // Reset cropped images when switching jobs
      setCroppedImagesMap(new Map());
      setCroppedImagesReady(false);
      lastProcessedBlocksRef.current = '';
    }
  }, [currentJobId, currentJob?.s3Key, currentJob?.status, currentJob?.result, fetchS3ImageUrl, fetchJobResult, updateJob]);

  // Ensure previewUrl is set when step changes to result
  useEffect(() => {
    if (step === 'result' && !previewUrl) {
      const job = currentJob || jobs.find((j) => j.id === processingJobId);
      if (!job?.s3Key) return;

      (async () => {
        const imageUrl = await fetchS3ImageUrl(job.s3Key!);
        if (!imageUrl) return;

        // Check if it's a PDF - render first page to image
        if (job.filename.toLowerCase().endsWith('.pdf')) {
          try {
            const response = await fetch(imageUrl);
            const arrayBuffer = await response.arrayBuffer();
            pdfArrayBufferRef.current = arrayBuffer;
            const { dataUrl, totalPages } = await renderPdfToImage(arrayBuffer, 1);
            setTotalPdfPages(totalPages);
            setCurrentPdfPage(1);
            if (dataUrl) {
              setPreviewUrl(dataUrl);
            }
          } catch (error) {
            console.error('Failed to render PDF:', error);
          }
        } else {
          pdfArrayBufferRef.current = null;
          setTotalPdfPages(1);
          setCurrentPdfPage(1);
          setPreviewUrl(imageUrl);
        }
      })();
    }
  }, [step, previewUrl, currentJob, jobs, processingJobId, fetchS3ImageUrl]);

  // Generate cropped image for selected block modal
  useEffect(() => {
    if (!selectedBlock) {
      setSelectedBlockImage(null);
      return;
    }

    // Use already loaded image from resultImageRef
    const img = resultImageRef.current;
    if (!img || !img.complete || img.naturalWidth === 0) {
      setSelectedBlockImage(null);
      return;
    }

    // Get structure data for dimensions
    let structWidth = 0;
    let structHeight = 0;

    if (currentJob?.result?.results?.[0]) {
      const resultData = currentJob.result.results[0];
      if ('width' in resultData && 'height' in resultData) {
        const structData = resultData as OcrStructureResultData;
        structWidth = structData.width;
        structHeight = structData.height;
      }
    }

    try {
      const [x1, y1, x2, y2] = selectedBlock.block_bbox;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setSelectedBlockImage(null);
        return;
      }

      // Use structure data dimensions or fall back to natural image dimensions
      const baseWidth = structWidth || img.naturalWidth;
      const baseHeight = structHeight || img.naturalHeight;

      const scaleX = img.naturalWidth / baseWidth;
      const scaleY = img.naturalHeight / baseHeight;

      const cropX = Math.max(0, x1 * scaleX);
      const cropY = Math.max(0, y1 * scaleY);
      const cropW = Math.min((x2 - x1) * scaleX, img.naturalWidth - cropX);
      const cropH = Math.min((y2 - y1) * scaleY, img.naturalHeight - cropY);

      if (cropW <= 0 || cropH <= 0) {
        setSelectedBlockImage(null);
        return;
      }

      canvas.width = cropW;
      canvas.height = cropH;

      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      const dataUrl = canvas.toDataURL('image/png');
      setSelectedBlockImage(dataUrl);
    } catch (e) {
      console.error('Failed to crop image for preview:', e);
      setSelectedBlockImage(null);
    }
  }, [selectedBlock, currentJob]);

  // Close modal on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedBlock) {
        setSelectedBlock(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBlock]);

  // Max file size: 100MB (using presigned URL for files > 5MB)
  const MAX_FILE_SIZE = 100 * 1024 * 1024;

  // File handling
  const handleFileSelect = useCallback(async (file: File) => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      alert(
        `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 100MB.`,
      );
      return;
    }

    // Check if file is a PDF
    if (file.type === 'application/pdf') {
      try {
        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();

        // Convert to base64 first (before ArrayBuffer gets detached)
        const uint8Array = new Uint8Array(arrayBuffer);
        let binaryString = '';
        uint8Array.forEach((byte) => {
          binaryString += String.fromCharCode(byte);
        });
        const base64 = btoa(binaryString);

        // Create a copy of the ArrayBuffer for PDF rendering
        const arrayBufferCopy = uint8Array.buffer.slice(0);

        // Render PDF first page to image for preview
        pdfArrayBufferRef.current = arrayBufferCopy;
        const { dataUrl: pdfPreviewUrl, totalPages } = await renderPdfToImage(arrayBufferCopy, 1);
        if (!pdfPreviewUrl) {
          alert('Failed to render PDF preview');
          return;
        }

        setTotalPdfPages(totalPages);
        setCurrentPdfPage(1);
        setImageData({ base64, filename: file.name });
        setPreviewUrl(pdfPreviewUrl);
        setStep('options');
      } catch (error) {
        console.error('Failed to process PDF:', error);
        alert('Failed to process PDF file');
      }
    } else {
      // Handle image files as before
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        setImageData({ base64, filename: file.name });
        setPreviewUrl(e.target?.result as string);
        setStep('options');
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // Supported file types
  const supportedTypes = [
    'image/png',
    'image/jpeg',
    'image/tiff',
    'application/pdf',
  ];

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && supportedTypes.includes(file.type)) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => Math.max(prev - 0.25, 0.25));
  }, []);

  const handleZoomFit = useCallback(() => {
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  }, []);

  // PDF page navigation
  const handlePdfPageChange = useCallback(async (newPage: number) => {
    if (!pdfArrayBufferRef.current || newPage < 1 || newPage > totalPdfPages) return;

    try {
      const { dataUrl } = await renderPdfToImage(pdfArrayBufferRef.current, newPage);
      if (dataUrl) {
        setCurrentPdfPage(newPage);
        setPreviewUrl(dataUrl);
        // Reset cropped images for new page
        setCroppedImagesMap(new Map());
        setCroppedImagesReady(false);
        lastProcessedBlocksRef.current = '';
      }
    } catch (error) {
      console.error('Error rendering PDF page:', error);
    }
  }, [totalPdfPages]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoomLevel((prev) => Math.min(Math.max(prev + delta, 0.25), 3));
    }
  }, []);

  // Pan handlers - use document events to capture mouse release outside container
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // Left click only
      e.preventDefault();
      setIsPanning(true);
      setDragStart({
        x: e.clientX - panPosition.x,
        y: e.clientY - panPosition.y,
      });
    },
    [panPosition],
  );

  useEffect(() => {
    if (!isPanning) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPanPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    };

    const handleMouseUp = () => {
      setIsPanning(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning, dragStart]);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect],
  );

  // Model selection
  const handleModelChange = useCallback((model: OcrModel) => {
    setSelectedModel(model);
    setModelOptions(getDefaultOptionsForModel(model));
  }, []);

  // Option toggle
  const handleOptionToggle = useCallback((key: string) => {
    setModelOptions(
      (prev) =>
        ({
          ...prev,
          [key]: !(prev as Record<string, boolean>)[key],
        }) as ModelOptions,
    );
  }, []);

  // Polling for job status
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobStartTimeRef = useRef<number | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, []);

  const pollJobStatus = useCallback(
    async (jobId: string) => {
      const apiUrl = runtimeConfig.apiUrl || runtimeConfig.apis?.ocr;
      if (!apiUrl) return;

      try {
        const response = await fetch(`${apiUrl}/ocr/${jobId}`, {
          headers: {
            Authorization: auth.user?.id_token || '',
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) throw new Error('Failed to get status');

        const data = await response.json();

        if (data.status === 'completed') {
          const processingTimeMs = jobStartTimeRef.current
            ? Date.now() - jobStartTimeRef.current
            : undefined;
          updateJob(jobId, {
            status: 'completed',
            result: data.result,
            processingTimeMs,
          });
          jobStartTimeRef.current = null;
          setIsProcessing(false);
          setProcessingJobId(null);
          setStep('result');
        } else if (data.status === 'failed') {
          updateJob(jobId, {
            status: 'failed',
          });
          jobStartTimeRef.current = null;
          setIsProcessing(false);
          setProcessingJobId(null);
          alert(data.error || 'Processing failed');
        } else {
          // Still processing, poll again (with cleanup support)
          pollTimeoutRef.current = setTimeout(() => pollJobStatus(jobId), 3000);
        }
      } catch (error) {
        console.error('Poll error:', error);
        pollTimeoutRef.current = setTimeout(() => pollJobStatus(jobId), 5000);
      }
    },
    [runtimeConfig, auth.user?.id_token, updateJob],
  );

  // Submit job - always upload to S3
  const handleSubmit = useCallback(async () => {
    if (!imageData) return;

    setIsProcessing(true);
    jobStartTimeRef.current = Date.now();

    const jobId = `job-${Date.now()}`;

    try {
      if (!apiUrl) {
        throw new Error('API URL not configured');
      }

      // Always upload to S3 first
      const uploadResponse = await fetch(`${apiUrl}/upload`, {
        method: 'POST',
        headers: {
          Authorization: auth.user?.id_token || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: imageData.filename,
          content_type: imageData.filename.toLowerCase().endsWith('.pdf')
            ? 'application/pdf'
            : 'image/jpeg',
        }),
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const uploadData = await uploadResponse.json();
      const { upload_url, s3_key } = uploadData;

      // Convert base64 to binary and upload to S3
      const binaryString = atob(imageData.base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const s3UploadResponse = await fetch(upload_url, {
        method: 'PUT',
        body: bytes,
        headers: {
          'Content-Type': imageData.filename.toLowerCase().endsWith('.pdf')
            ? 'application/pdf'
            : 'image/jpeg',
        },
      });

      if (!s3UploadResponse.ok) {
        throw new Error('Failed to upload file to S3');
      }

      // Create job with s3Key (not imageData)
      const newJob: OcrJob = {
        id: jobId,
        filename: imageData.filename,
        model: selectedModel,
        modelOptions: modelOptions,
        status: 'processing',
        createdAt: new Date(),
        s3Key: s3_key,
        imageAvailable: true,
      };

      addJob(newJob);

      // Submit OCR request with s3_key
      const response = await fetch(`${apiUrl}/ocr`, {
        method: 'POST',
        headers: {
          Authorization: auth.user?.id_token || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          s3_key: s3_key,
          filename: imageData.filename,
          model: selectedModel,
          options: modelOptions,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const backendJobId = data.job_id;

      // Replace the local job ID with the backend job_id and update s3Key
      replaceJobId(jobId, backendJobId);
      updateJob(backendJobId, { s3Key: s3_key });
      setProcessingJobId(backendJobId);

      // Start polling
      pollJobStatus(backendJobId);
    } catch (err) {
      console.error('Submit error:', err);
      // If job was added, mark as failed
      updateJob(jobId, { status: 'failed' });
      setIsProcessing(false);
      alert('Failed to submit OCR request. Please try again.');
    }
  }, [
    imageData,
    selectedModel,
    modelOptions,
    auth.user?.id_token,
    apiUrl,
    addJob,
    updateJob,
    replaceJobId,
    pollJobStatus,
  ]);

  // Retry: Load image from S3 and go to preview step
  const handleRetry = useCallback(async () => {
    if (!currentJob?.s3Key) return;

    try {
      // Fetch presigned URL for the image
      const imageUrl = await fetchS3ImageUrl(currentJob.s3Key);
      if (!imageUrl) {
        alert('Failed to load image from S3');
        return;
      }

      // Fetch file from S3
      const response = await fetch(imageUrl);
      const blob = await response.blob();

      // Check if it's a PDF
      const isPdf = currentJob.filename.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        // For PDF: convert to base64 and render first page for preview
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        let binaryString = '';
        for (let i = 0; i < uint8Array.length; i++) {
          binaryString += String.fromCharCode(uint8Array[i]);
        }
        const base64 = btoa(binaryString);

        // Render PDF first page for preview
        pdfArrayBufferRef.current = arrayBuffer;
        const { dataUrl: pdfPreviewUrl, totalPages } = await renderPdfToImage(arrayBuffer, 1);
        if (!pdfPreviewUrl) {
          alert('Failed to render PDF preview');
          return;
        }

        setTotalPdfPages(totalPages);
        setCurrentPdfPage(1);
        setImageData({ base64, filename: currentJob.filename });
        setPreviewUrl(pdfPreviewUrl);

        // Restore previous model and options
        setSelectedModel(currentJob.model);
        if (currentJob.modelOptions) {
          setModelOptions(currentJob.modelOptions);
        }

        setCurrentJobId(null);
        setStep('options');
      } else {
        // For images: use FileReader
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(',')[1];

          setImageData({ base64, filename: currentJob.filename });
          setPreviewUrl(dataUrl);

          // Restore previous model and options
          setSelectedModel(currentJob.model);
          if (currentJob.modelOptions) {
            setModelOptions(currentJob.modelOptions);
          }

          setCurrentJobId(null);
          setStep('options');
        };
        reader.readAsDataURL(blob);
      }
    } catch (err) {
      console.error('Retry error:', err);
      alert('Failed to load image for retry');
    }
  }, [currentJob, fetchS3ImageUrl, setCurrentJobId]);

  // Get result data for current page
  const getResultData = (): OcrResultData | null => {
    // Try multiple ways to find the job
    let job = currentJob;
    if (!job && processingJobId) {
      job = jobs.find((j) => j.id === processingJobId);
    }
    if (!job && currentJobId) {
      job = jobs.find((j) => j.id === currentJobId);
    }

    if (!job?.result) return null;
    // Handle various response formats
    const result = job.result as {
      res?: OcrResultData;
      results?: Array<{ res?: OcrResultData } | OcrResultData>;
    };
    // Format 1: { res: {...} }
    if (result.res) return result.res;

    // Format 2 & 3: { results: [...] } - use currentPdfPage for multi-page PDFs
    const pageIndex = currentPdfPage - 1;
    if (result.results && result.results.length > 0) {
      // Get the result for current page, or first page if index out of bounds
      const pageResult = result.results[pageIndex] || result.results[0];
      const typedResult = pageResult as { res?: OcrResultData };
      if (typedResult.res) return typedResult.res;
      // Format 3: { results: [{...}] } (direct data)
      return pageResult as OcrResultData;
    }

    return null;
  };

  const resultData = getResultData();

  // Render upload step
  const renderUploadStep = () => (
    <div
      className="page-container"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ maxWidth: '700px', width: '100%' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.tiff,.tif,.pdf,image/png,image/jpeg,image/tiff,application/pdf"
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />
        <div
          className={`upload-zone ${isDragging ? 'drag-over' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadIcon />
          <div className="upload-zone-title">Drag and drop your file here</div>
          <div className="upload-zone-subtitle">
            or <span className="upload-zone-link">click to browse</span>
          </div>
          <div className="upload-zone-formats">
            <div className="formats-title">Supported formats</div>
            <div className="formats-list">
              <span className="format-tag">PNG</span>
              <span className="format-tag">JPEG</span>
              <span className="format-tag">TIFF</span>
              <span className="format-tag">PDF</span>
            </div>
            <div className="formats-limit">Maximum file size: 100MB</div>
          </div>
        </div>

        <p className="app-description">
          This is not a production solution — it's a playground for testing
          PaddleOCR models on AWS infrastructure. Explore and compare different
          OCR capabilities before implementing in your own projects.
        </p>

        {/* Model Selection */}
        <div className="model-selection-section">
          <div className="model-selection-label">Select OCR Model</div>
          <div className="model-cards-horizontal">
            {(Object.keys(MODEL_INFO) as OcrModel[]).map((model) => (
              <div
                key={model}
                className={`model-card-compact ${selectedModel === model ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleModelChange(model);
                }}
              >
                <div className="model-card-compact-radio" />
                <div className="model-card-compact-content">
                  <span className="model-card-compact-title">
                    {MODEL_INFO[model].title}
                  </span>
                  <span className="model-card-compact-desc">
                    {MODEL_INFO[model].description}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // Render options step
  const renderOptionsStep = () => {
    const optionInfo =
      selectedModel === 'pp-ocrv5'
        ? PP_OCRV5_OPTION_INFO
        : selectedModel === 'pp-structurev3'
          ? PP_STRUCTUREV3_OPTION_INFO
          : [];

    return (
      <div className="page-container">
        <div className="options-panel">
          {/* Image Preview */}
          <div className="options-preview">
            <div className="preview-container">
              {previewUrl && (
                <img src={previewUrl} alt="Preview" className="preview-image" />
              )}
            </div>
            <div className="preview-filename">{imageData?.filename}</div>
            <div
              className="change-file-btn"
              onClick={() => {
                setStep('upload');
                setImageData(null);
                setPreviewUrl(null);
              }}
            >
              Change Document
            </div>
          </div>

          {/* Options Config */}
          <div className="options-config">
            {/* Model Selection */}
            <div className="option-section">
              <div className="option-label">Select Model</div>
              <div className="model-cards">
                {(Object.keys(MODEL_INFO) as OcrModel[]).map((model) => (
                  <div
                    key={model}
                    className={`model-card ${selectedModel === model ? 'selected' : ''}`}
                    onClick={() => handleModelChange(model)}
                  >
                    <div className="model-card-header">
                      <span className="model-card-title">
                        {MODEL_INFO[model].title}
                      </span>
                      <span className="model-card-radio" />
                    </div>
                    <div className="model-card-desc">
                      {MODEL_INFO[model].description}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Language Selection - only for PP-OCRv5 and PP-StructureV3 */}
            {(selectedModel === 'pp-ocrv5' ||
              selectedModel === 'pp-structurev3') && (
              <div className="option-section">
                <div className="option-label">Language</div>
                <select
                  className="lang-select"
                  value={
                    (modelOptions as { lang?: OcrLanguage | '' }).lang ?? ''
                  }
                  onChange={(e) => {
                    setModelOptions({
                      ...(modelOptions as Record<string, unknown>),
                      lang: e.target.value as OcrLanguage | '',
                    } as typeof modelOptions);
                  }}
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Model-specific Options */}
            {optionInfo.length > 0 && (
              <div className="option-section">
                <div className="option-label">Options</div>
                <div className="toggle-options">
                  {optionInfo.map((opt) => {
                    const isChecked =
                      (modelOptions as Record<string, boolean>)[opt.key] ||
                      false;
                    return (
                      <div
                        key={opt.key}
                        className={`toggle-option ${isChecked ? 'checked' : ''}`}
                        onClick={() => handleOptionToggle(opt.key)}
                      >
                        <div className="toggle-checkbox">
                          {isChecked && <CheckIcon />}
                        </div>
                        <div className="toggle-content">
                          <div className="toggle-title">{opt.title}</div>
                          <div className="toggle-desc">{opt.description}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                marginTop: 'auto',
                paddingTop: '24px',
              }}
            >
              <button
                className="btn btn-outline"
                onClick={() => {
                  setStep('upload');
                  setImageData(null);
                  setPreviewUrl(null);
                }}
              >
                <ArrowLeftIcon /> Back
              </button>
              <button
                className="btn btn-primary btn-lg"
                style={{ flex: 1 }}
                onClick={handleSubmit}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>Processing...</>
                ) : (
                  <>
                    <PlayIcon /> Process Document
                  </>
                )}
              </button>
            </div>
            <p
              style={{
                fontSize: '12px',
                color: '#666',
                textAlign: 'center',
                marginTop: '8px',
              }}
            >
              Note: First request may be slower due to model initialization.
            </p>
          </div>
        </div>
      </div>
    );
  };

  // Render result step
  const renderResultStep = () => {
    if (!resultData) {
      return (
        <div className="page-container">
          <div className="empty-state">
            <div className="empty-state-title">No result available</div>
            <div className="empty-state-desc">
              Process a document to see results
            </div>
          </div>
        </div>
      );
    }

    // Check result format
    const isV5Format = isOcrV5Result(resultData);
    const blocks = isStructureResult(resultData)
      ? resultData.parsing_res_list
      : [];
    const v5Data = isV5Format ? (resultData as OcrV5ResultData) : null;

    return (
      <div className="page-container">
        <div className="result-panel">
          {/* Image Panel */}
          <div className="result-image-panel">
            <div className="result-image-header">
              <div className="result-image-nav">
                {totalPdfPages > 1 ? (
                  <>
                    <button
                      className="page-nav-btn"
                      onClick={() => handlePdfPageChange(currentPdfPage - 1)}
                      disabled={currentPdfPage <= 1}
                      title="Previous Page"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </button>
                    <span className="page-indicator">
                      Page {currentPdfPage} / {totalPdfPages}
                    </span>
                    <button
                      className="page-nav-btn"
                      onClick={() => handlePdfPageChange(currentPdfPage + 1)}
                      disabled={currentPdfPage >= totalPdfPages}
                      title="Next Page"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <span className="page-indicator">Page 1</span>
                )}
              </div>
              <div className="zoom-controls">
                <button
                  className="zoom-btn"
                  onClick={handleZoomOut}
                  title="Zoom Out"
                >
                  <ZoomOutIcon />
                </button>
                <span className="zoom-level">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  className="zoom-btn"
                  onClick={handleZoomIn}
                  title="Zoom In"
                >
                  <ZoomInIcon />
                </button>
                <button
                  className="zoom-btn"
                  onClick={handleZoomFit}
                  title="Fit to Screen"
                >
                  <FitIcon />
                </button>
                <span className="zoom-divider" />
                <label
                  className="overlay-toggle"
                  title="Show/Hide Detection Overlay"
                >
                  <input
                    type="checkbox"
                    checked={showBbox}
                    onChange={(e) => setShowBbox(e.target.checked)}
                  />
                  <span>Overlay</span>
                </label>
              </div>
              <button
                className="btn btn-sm btn-outline"
                onClick={handleRetry}
                disabled={!currentJob?.s3Key}
                title="Load image and retry with different options"
              >
                <RetryIcon /> Retry
              </button>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => {
                  setStep('upload');
                  setCurrentJobId(null);
                }}
              >
                New Document
              </button>
            </div>
            <div
              className={`result-image-container ${isPanning ? 'dragging' : ''}`}
              ref={imageContainerRef}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
            >
              <div
                className="result-image-wrapper"
                style={{
                  transform: `translate(calc(-50% + ${panPosition.x}px), calc(-50% + ${panPosition.y}px)) scale(${zoomLevel})`,
                }}
              >
                {previewUrl && (
                  <>
                    <img
                      key={previewUrl}
                      ref={resultImageRef}
                      src={previewUrl}
                      alt="Document"
                      className="result-image"
                      crossOrigin={previewUrl?.startsWith('data:') ? undefined : 'anonymous'}
                      onLoad={() => setLoadedImageUrl(previewUrl)}
                    />
                    {/* Block overlays for Structure format */}
                    {showBbox &&
                      loadedImageUrl === previewUrl &&
                      !isV5Format &&
                      resultImageRef.current &&
                      blocks.map((block, idx) => {
                        const [x1, y1, x2, y2] = block.block_bbox;
                        const structData = resultData as OcrStructureResultData;
                        const imageEl = resultImageRef.current!;
                        if (!imageEl || !structData.width || !structData.height) return null;
                        const scaleX = imageEl.clientWidth / structData.width;
                        const scaleY = imageEl.clientHeight / structData.height;

                        const isHighlighted = hoveredBlockId === block.block_id;
                        return (
                          <div
                            key={idx}
                            className={`block-overlay ${block.block_label} ${isHighlighted ? 'highlighted' : ''}`}
                            style={{
                              left: x1 * scaleX,
                              top: y1 * scaleY,
                              width: (x2 - x1) * scaleX,
                              height: (y2 - y1) * scaleY,
                            }}
                          />
                        );
                      })}
                    {/* Block overlays for PP-OCRv5 format */}
                    {showBbox &&
                      loadedImageUrl === previewUrl &&
                      isV5Format &&
                      v5Data &&
                      resultImageRef.current &&
                      v5Data.rec_texts.map((_, idx) => {
                        const [x1, y1, x2, y2] = getV5Bbox(v5Data, idx);
                        if (x1 === 0 && y1 === 0 && x2 === 0 && y2 === 0)
                          return null;
                        const imageEl = resultImageRef.current;
                        if (!imageEl || !imageEl.naturalWidth || !imageEl.naturalHeight) return null;
                        // Use natural dimensions for scaling
                        const scaleX = imageEl.clientWidth / imageEl.naturalWidth;
                        const scaleY = imageEl.clientHeight / imageEl.naturalHeight;

                        const isHighlighted = hoveredBlockId === idx;
                        return (
                          <div
                            key={idx}
                            className={`block-overlay text ${isHighlighted ? 'highlighted' : ''}`}
                            style={{
                              left: x1 * scaleX,
                              top: y1 * scaleY,
                              width: (x2 - x1) * scaleX,
                              height: (y2 - y1) * scaleY,
                            }}
                          />
                        );
                      })}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Content Panel */}
          <div className="result-content-panel">
            {/* Model Settings Info */}
            {(() => {
              const job =
                currentJob || jobs.find((j) => j.id === processingJobId);
              if (!job) return null;
              const modelInfo = MODEL_INFO[job.model];
              const options = job.modelOptions as
                | Record<string, unknown>
                | undefined;
              const langCode = options?.lang as string | undefined;
              const langInfo = langCode
                ? SUPPORTED_LANGUAGES.find((l) => l.code === langCode)
                : null;

              return (
                <div className="model-settings-info">
                  <div className="model-settings-item">
                    <span className="model-settings-label">Model</span>
                    <span className="model-settings-value">
                      {modelInfo?.title || job.model}
                    </span>
                  </div>
                  {langInfo && (
                    <div className="model-settings-item">
                      <span className="model-settings-label">Language</span>
                      <span className="model-settings-value">
                        {langInfo.name}
                      </span>
                    </div>
                  )}
                  {options &&
                    Object.entries(options).map(([key, value]) => {
                      if (key === 'lang' || value === false) return null;
                      const optionLabel = key
                        .replace(/^use_/, '')
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, (c) => c.toUpperCase());
                      return (
                        <div key={key} className="model-settings-item">
                          <span className="model-settings-label">
                            {optionLabel}
                          </span>
                          <span className="model-settings-value model-settings-enabled">
                            Enabled
                          </span>
                        </div>
                      );
                    })}
                  {job.processingTimeMs && (
                    <div className="model-settings-item">
                      <span className="model-settings-label">Time</span>
                      <span className="model-settings-value model-settings-time">
                        {job.processingTimeMs >= 1000
                          ? `${(job.processingTimeMs / 1000).toFixed(1)}s`
                          : `${job.processingTimeMs}ms`}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="result-tabs">
              {(
                ['blocks', 'json', 'markdown', 'document'] as ResultViewTab[]
              ).map((tab) => (
                <button
                  key={tab}
                  className={`result-tab ${resultTab === tab ? 'active' : ''}`}
                  onClick={() => setResultTab(tab)}
                >
                  {tab === 'blocks'
                    ? 'Blocks'
                    : tab === 'document'
                      ? 'Document'
                      : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div className="result-content">
              {resultTab === 'blocks' &&
                (isV5Format
                  ? renderV5BlocksView(resultData as OcrV5ResultData)
                  : renderBlocksView(blocks))}
              {resultTab === 'json' && renderJsonView(resultData)}
              {resultTab === 'markdown' &&
                (isV5Format
                  ? renderV5MarkdownView(resultData as OcrV5ResultData)
                  : renderMarkdownView(blocks))}
              {resultTab === 'document' &&
                (isV5Format
                  ? renderV5DocumentView(resultData as OcrV5ResultData)
                  : renderDocumentView(
                      blocks,
                      resultData as OcrStructureResultData,
                    ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // View renderers
  const renderBlocksView = (blocks: OcrBlock[]) => {
    // Generate cropped images if needed (same logic as Document view)
    const structData = resultData as OcrStructureResultData;
    const imgElement = resultImageRef.current;
    const blocksKey = `${loadedImageUrl}:${blocks.map((b) => b.block_id).join(',')}`;
    const imageIsReady =
      imgElement &&
      imgElement.complete &&
      imgElement.naturalWidth > 0 &&
      loadedImageUrl === previewUrl;

    if (
      blocksKey !== lastProcessedBlocksRef.current &&
      imageIsReady &&
      structData?.width &&
      structData?.height
    ) {
      lastProcessedBlocksRef.current = blocksKey;
      try {
        const croppedMap = generateCroppedImages(blocks, structData, imgElement);
        if (croppedMap.size > 0) {
          setTimeout(() => setCroppedImagesMap(croppedMap), 0);
        }
      } catch (error) {
        console.error('Failed to generate cropped images:', error);
      }
    }

    // Process blocks to distribute multi-line content to empty blocks in same group
    const processedBlocks = [...blocks];

    // Group blocks by group_id
    const groupMap = new Map<number, number[]>();
    blocks.forEach((block, idx) => {
      const groupId = block.group_id;
      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, []);
      }
      groupMap.get(groupId)!.push(idx);
    });

    // For each group, distribute multi-line content to empty blocks
    groupMap.forEach((indices) => {
      if (indices.length <= 1) return;

      // Find the block with content (usually the first one)
      const blockWithContent = indices.find(
        (idx) =>
          processedBlocks[idx].block_content &&
          processedBlocks[idx].block_content.trim() !== '',
      );

      if (blockWithContent === undefined) return;

      const contentBlock = processedBlocks[blockWithContent];
      const lines = contentBlock.block_content
        .split('\n')
        .filter((l) => l.trim());

      // If we have more lines than just one, and there are empty blocks following
      if (lines.length > 1) {
        const emptyIndices = indices.filter(
          (idx) =>
            idx !== blockWithContent &&
            (!processedBlocks[idx].block_content ||
              processedBlocks[idx].block_content.trim() === ''),
        );

        // Distribute lines: first line stays in original, rest go to empty blocks
        if (emptyIndices.length > 0) {
          processedBlocks[blockWithContent] = {
            ...contentBlock,
            block_content: lines[0],
          };

          lines.slice(1).forEach((line, i) => {
            if (i < emptyIndices.length) {
              processedBlocks[emptyIndices[i]] = {
                ...processedBlocks[emptyIndices[i]],
                block_content: line,
              };
            }
          });
        }
      }
    });

    // Filter out empty blocks, but keep visual blocks (image, chart, seal, etc.) even without content
    const visualBlockTypes = [
      'image',
      'picture',
      'figure',
      'chart',
      'seal',
      'stamp',
    ];
    const filteredBlocks = processedBlocks.filter(
      (block) =>
        (block.block_content && block.block_content.trim() !== '') ||
        visualBlockTypes.includes(block.block_label),
    );

    // Helper function to render cropped image using croppedImagesMap
    const renderCroppedImage = (block: OcrBlock) => {
      const croppedSrc = croppedImagesMap.get(block.block_id);
      if (!croppedSrc) {
        // Fallback: show placeholder while image is being generated
        const [x1, y1, x2, y2] = block.block_bbox;
        const cropWidth = x2 - x1;
        const cropHeight = y2 - y1;
        return (
          <div
            style={{
              width: Math.min(cropWidth, 300),
              height: Math.min(cropHeight, 200),
              background: 'var(--bg-tertiary)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: '12px',
            }}
          >
            Loading image...
          </div>
        );
      }

      const [x1, , x2] = block.block_bbox;
      const cropWidth = x2 - x1;

      return (
        <img
          src={croppedSrc}
          alt={`${block.block_label} block`}
          style={{
            width: Math.min(cropWidth, 300),
            maxWidth: '100%',
            height: 'auto',
            borderRadius: '8px',
            background: 'var(--bg-tertiary)',
          }}
        />
      );
    };

    return (
      <div className="blocks-list">
        {filteredBlocks.length === 0 ? (
          <div
            style={{
              padding: '40px',
              textAlign: 'center',
              color: 'var(--text-muted)',
            }}
          >
            No blocks detected
          </div>
        ) : (
          filteredBlocks.map((block, idx) => (
            <div
              key={idx}
              className={`block-item ${block.block_label} ${hoveredBlockId === block.block_id ? 'highlighted' : ''}`}
              onMouseEnter={() => setHoveredBlockId(block.block_id)}
              onMouseLeave={() => setHoveredBlockId(null)}
              onClick={() => setSelectedBlock(block)}
              style={{ cursor: 'pointer' }}
            >
              <div className="block-header">
                <span className={`block-label ${block.block_label}`}>
                  {block.block_label}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Block #{block.block_id} | Group #{block.group_id}
                </span>
              </div>
              <div className="block-body">
                {block.block_label === 'table' ? (
                  <div
                    className="block-content"
                    dangerouslySetInnerHTML={{ __html: block.block_content }}
                  />
                ) : visualBlockTypes.includes(block.block_label) ? (
                  <>
                    {renderCroppedImage(block)}
                    {block.block_content?.trim() && (
                      <div
                        className="block-content"
                        style={{ whiteSpace: 'pre-wrap', marginTop: '12px' }}
                      >
                        {block.block_content}
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    className="block-content"
                    style={{ whiteSpace: 'pre-wrap' }}
                  >
                    {block.block_content}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  // Download helper
  const downloadFile = useCallback(
    (content: string, filename: string, mimeType: string) => {
      const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [],
  );

  // Show toast helper
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2000);
  }, []);

  // Copy to clipboard helper
  const copyToClipboard = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        showToast('Copied!');
      } catch (err) {
        console.error('Failed to copy:', err);
        showToast('Failed to copy');
      }
    },
    [showToast],
  );

  const renderJsonView = (data: OcrResultData) => {
    const job = currentJob || jobs.find((j) => j.id === processingJobId);
    const filename = job?.filename?.replace(/\.[^/.]+$/, '') || 'ocr_result';
    const jsonString = JSON.stringify(data, null, 2);

    return (
      <div className="view-with-toolbar">
        <div className="view-toolbar">
          <button
            className="btn btn-sm btn-outline"
            onClick={() => copyToClipboard(jsonString)}
          >
            Copy
          </button>
          <button
            className="btn btn-sm btn-outline"
            onClick={() =>
              downloadFile(jsonString, `${filename}.json`, 'application/json')
            }
          >
            Download
          </button>
        </div>
        <div className="json-view">
          <pre>{jsonString}</pre>
        </div>
      </div>
    );
  };

  // Generate markdown from blocks
  const generateMarkdown = useCallback((blocks: OcrBlock[]): string => {
    return blocks
      .map((block) => {
        // Trim whitespace and newlines from content
        const content = (block.block_content || '').replace(
          /^[\s\n]+|[\s\n]+$/g,
          '',
        );
        if (!content) return '';

        if (block.block_label === 'doc_title') {
          return `# ${content}`;
        }
        if (block.block_label === 'paragraph_title') {
          return `## ${content}`;
        }
        if (block.block_label === 'header') {
          return `**${content}**`;
        }
        if (block.block_label === 'table') {
          return block.block_content; // Keep table HTML as-is
        }
        return content;
      })
      .filter((line) => line) // Remove empty lines
      .join('\n\n');
  }, []);

  // Generate markdown from V5 data
  const generateV5Markdown = useCallback((data: OcrV5ResultData): string => {
    const texts = data.rec_texts || [];
    return texts.join('\n\n');
  }, []);

  const renderMarkdownView = (blocks: OcrBlock[]) => {
    const job = currentJob || jobs.find((j) => j.id === processingJobId);
    const filename = job?.filename?.replace(/\.[^/.]+$/, '') || 'ocr_result';

    // Use edited markdown from job if available, otherwise generate
    const generatedMarkdown = generateMarkdown(blocks);
    const displayContent = job?.editedMarkdown || generatedMarkdown;

    const handleMarkdownChange = (content: string) => {
      if (job) {
        updateJob(job.id, { editedMarkdown: content });
      }
    };

    return (
      <div className="view-with-toolbar">
        <div className="view-toolbar">
          <button
            className={`btn btn-sm ${isMarkdownEditMode ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setIsMarkdownEditMode(!isMarkdownEditMode)}
          >
            {isMarkdownEditMode ? 'Preview' : 'Edit'}
          </button>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => copyToClipboard(displayContent)}
          >
            Copy
          </button>
          <button
            className="btn btn-sm btn-outline"
            onClick={() =>
              downloadFile(displayContent, `${filename}.md`, 'text/markdown')
            }
          >
            Download
          </button>
        </div>
        {isMarkdownEditMode ? (
          <textarea
            className="markdown-editor"
            value={displayContent}
            onChange={(e) => handleMarkdownChange(e.target.value)}
            spellCheck={false}
          />
        ) : (
          <div className="markdown-view">
            <ReactMarkdown
              remarkPlugins={[remarkBreaks]}
              rehypePlugins={[rehypeRaw]}
            >
              {displayContent}
            </ReactMarkdown>
          </div>
        )}
      </div>
    );
  };

  // PP-OCRv5 specific renderers
  const renderV5BlocksView = (data: OcrV5ResultData) => {
    const texts = data.rec_texts || [];
    const scores = data.rec_scores || [];

    const handleV5BlockClick = (idx: number) => {
      const bbox = getV5Bbox(data, idx);
      if (bbox[0] === 0 && bbox[1] === 0 && bbox[2] === 0 && bbox[3] === 0)
        return;

      // Create synthetic OcrBlock for the modal
      const syntheticBlock: OcrBlock = {
        block_id: idx,
        block_label: 'text',
        block_content: texts[idx] || '',
        block_bbox: bbox,
        block_order: idx,
        group_id: 0,
      };
      setSelectedBlock(syntheticBlock);
    };

    return (
      <div className="blocks-list">
        {texts.length === 0 ? (
          <div
            style={{
              padding: '40px',
              textAlign: 'center',
              color: 'var(--text-muted)',
            }}
          >
            No text detected
          </div>
        ) : (
          texts.map((text, idx) => (
            <div
              key={idx}
              className={`block-item text ${hoveredBlockId === idx ? 'highlighted' : ''}`}
              onMouseEnter={() => setHoveredBlockId(idx)}
              onMouseLeave={() => setHoveredBlockId(null)}
              onClick={() => handleV5BlockClick(idx)}
              style={{ cursor: 'pointer' }}
            >
              <div className="block-header">
                <span className="block-label text">text</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  #{idx + 1} | Confidence: {(scores[idx] * 100).toFixed(1)}%
                </span>
              </div>
              <div className="block-body">
                <div
                  className="block-content"
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {text}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  const renderV5MarkdownView = (data: OcrV5ResultData) => {
    const job = currentJob || jobs.find((j) => j.id === processingJobId);
    const filename = job?.filename?.replace(/\.[^/.]+$/, '') || 'ocr_result';

    // Use edited markdown from job if available, otherwise generate
    const generatedMarkdown = generateV5Markdown(data);
    const displayContent = job?.editedMarkdown || generatedMarkdown;

    const handleMarkdownChange = (content: string) => {
      if (job) {
        updateJob(job.id, { editedMarkdown: content });
      }
    };

    return (
      <div className="view-with-toolbar">
        <div className="view-toolbar">
          <button
            className={`btn btn-sm ${isMarkdownEditMode ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setIsMarkdownEditMode(!isMarkdownEditMode)}
          >
            {isMarkdownEditMode ? 'Preview' : 'Edit'}
          </button>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => copyToClipboard(displayContent)}
          >
            Copy
          </button>
          <button
            className="btn btn-sm btn-outline"
            onClick={() =>
              downloadFile(displayContent, `${filename}.md`, 'text/markdown')
            }
          >
            Download
          </button>
        </div>
        {isMarkdownEditMode ? (
          <textarea
            className="markdown-editor"
            value={displayContent}
            onChange={(e) => handleMarkdownChange(e.target.value)}
            spellCheck={false}
          />
        ) : (
          <div className="markdown-view">
            <ReactMarkdown
              remarkPlugins={[remarkBreaks]}
              rehypePlugins={[rehypeRaw]}
            >
              {displayContent}
            </ReactMarkdown>
          </div>
        )}
      </div>
    );
  };

  // Helper to convert \n to <br> for HTML rendering
  const nl2br = (text: string): string => {
    return text.replace(/\n/g, '<br>');
  };

  // Generate HTML content from blocks for TipTap
  const generateDocumentHTML = useCallback(
    (
      blocks: OcrBlock[],
      structData: OcrStructureResultData,
      croppedImages: Map<number, string>,
    ): string => {
      const visualBlockTypes = [
        'image',
        'picture',
        'figure',
        'chart',
        'seal',
        'stamp',
      ];

      return blocks
        .map((block) => {
          // Skip empty non-visual blocks
          if (
            !block.block_content?.trim() &&
            !visualBlockTypes.includes(block.block_label)
          ) {
            return '';
          }

          // Visual blocks - always insert cropped image with original bbox size
          if (visualBlockTypes.includes(block.block_label)) {
            const croppedSrc = croppedImages.get(block.block_id);
            if (croppedSrc) {
              const [x1, , x2] = block.block_bbox;
              const width = x2 - x1;
              const caption = block.block_content?.trim();
              // Use img with width attribute (CustomImage extension preserves this)
              let html = `<img src="${croppedSrc}" alt="${block.block_label} #${block.block_id}" width="${width}" />`;
              if (caption) {
                html += `<p><em>${nl2br(caption)}</em></p>`;
              }
              return html;
            }
            return `<p><em>[${block.block_label.toUpperCase()}: Block #${block.block_id}]</em></p>`;
          }

          const content = block.block_content;

          // Render by block type
          switch (block.block_label) {
            case 'doc_title':
              return `<h1>${nl2br(content)}</h1>`;
            case 'paragraph_title':
              return `<h2>${nl2br(content)}</h2>`;
            case 'table':
              return content; // Already HTML
            case 'formula':
            case 'formula_number':
              return `<blockquote><code>${nl2br(content)}</code></blockquote>`;
            case 'header':
              return `<p><strong>${nl2br(content)}</strong></p>`;
            case 'footer':
              return `<p><small>${nl2br(content)}</small></p>`;
            case 'footnotes':
            case 'references':
              return `<blockquote>${nl2br(content)}</blockquote>`;
            default:
              return `<p>${nl2br(content)}</p>`;
          }
        })
        .filter((content) => content)
        .join('');
    },
    [],
  );

  // Generate HTML content from V5 data for TipTap
  const generateV5DocumentHTML = useCallback(
    (data: OcrV5ResultData): string => {
      const texts = data.rec_texts || [];
      if (texts.length === 0) {
        return '<p><em>No text detected</em></p>';
      }
      return texts.map((text) => `<p>${nl2br(text)}</p>`).join('');
    },
    [],
  );

  // State for cropped images
  const [croppedImagesMap, setCroppedImagesMap] = useState<Map<number, string>>(
    new Map(),
  );
  const [croppedImagesReady, setCroppedImagesReady] = useState(false);
  const lastProcessedBlocksRef = useRef<string>('');

  // Generate cropped images from blocks
  const generateCroppedImages = useCallback(
    (
      blocks: OcrBlock[],
      structData: OcrStructureResultData,
      imgElement: HTMLImageElement | null,
    ): Map<number, string> => {
      const visualBlockTypes = [
        'image',
        'picture',
        'figure',
        'chart',
        'seal',
        'stamp',
      ];

      if (!imgElement || !imgElement.complete || imgElement.naturalWidth === 0) {
        return new Map();
      }

      if (!structData.width || !structData.height) {
        return new Map();
      }

      const visualBlocks = blocks.filter((block) =>
        visualBlockTypes.includes(block.block_label),
      );

      if (visualBlocks.length === 0) {
        return new Map();
      }

      const result = new Map<number, string>();

      visualBlocks.forEach((block) => {
        try {
          const [x1, y1, x2, y2] = block.block_bbox;
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          // Scale factor from original image dimensions
          const scaleX = imgElement.naturalWidth / structData.width;
          const scaleY = imgElement.naturalHeight / structData.height;

          // Crop dimensions
          const cropX = x1 * scaleX;
          const cropY = y1 * scaleY;
          const cropW = (x2 - x1) * scaleX;
          const cropH = (y2 - y1) * scaleY;

          canvas.width = cropW;
          canvas.height = cropH;

          ctx.drawImage(
            imgElement,
            cropX,
            cropY,
            cropW,
            cropH,
            0,
            0,
            cropW,
            cropH,
          );

          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          result.set(block.block_id, dataUrl);
        } catch (e) {
          console.error(
            'Failed to crop image for block',
            block.block_id,
            e,
          );
        }
      });

      return result;
    },
    [],
  );

  // Document view for Structure/VL format
  const renderDocumentView = (
    blocks: OcrBlock[],
    structData: OcrStructureResultData,
  ) => {
    const job = currentJob || jobs.find((j) => j.id === processingJobId);
    const filename = job?.filename || 'document';

    // Check if there are visual blocks that need cropping
    const visualBlockTypes = [
      'image',
      'picture',
      'figure',
      'chart',
      'seal',
      'stamp',
    ];
    const hasVisualBlocks = blocks.some((block) =>
      visualBlockTypes.includes(block.block_label),
    );

    // Generate cropped images if not already done for these blocks + image
    const blocksKey = `${loadedImageUrl}:${blocks.map((b) => b.block_id).join(',')}`;
    const imgElement = resultImageRef.current;
    const imageIsReady =
      imgElement &&
      imgElement.complete &&
      imgElement.naturalWidth > 0 &&
      loadedImageUrl === previewUrl;

    if (
      hasVisualBlocks &&
      imageIsReady &&
      structData.width &&
      structData.height &&
      blocksKey !== lastProcessedBlocksRef.current
    ) {
      lastProcessedBlocksRef.current = blocksKey;
      // Use setTimeout to avoid setState during render
      setTimeout(() => {
        try {
          const croppedMap = generateCroppedImages(blocks, structData, imgElement);
          setCroppedImagesMap(croppedMap);
          setCroppedImagesReady(true);
        } catch (error) {
          console.error('Failed to generate cropped images:', error);
          // Still mark as ready so we don't block forever
          setCroppedImagesReady(true);
        }
      }, 0);
    }

    // If no visual blocks, mark as ready immediately
    if (!hasVisualBlocks && !croppedImagesReady) {
      setTimeout(() => setCroppedImagesReady(true), 0);
    }

    // Use edited content if available, otherwise generate from result
    const savedHtml = job?.editedDocumentHtml;
    const savedHtmlHasPlaceholder =
      savedHtml && savedHtml.includes('[IMAGE:') && hasVisualBlocks;

    // Use edited content if available and valid, otherwise generate from result
    const htmlContent =
      savedHtml && !savedHtmlHasPlaceholder
        ? savedHtml
        : generateDocumentHTML(blocks, structData, croppedImagesMap);

    const handleDocumentChange = (content: string) => {
      if (job) {
        updateJob(job.id, { editedDocumentHtml: content });
      }
    };

    return (
      <div className="document-view">
        <DocumentEditor
          initialContent={htmlContent}
          filename={filename}
          onContentChange={handleDocumentChange}
        />
      </div>
    );
  };

  // Document view for PP-OCRv5 format
  const renderV5DocumentView = (data: OcrV5ResultData) => {
    const job = currentJob || jobs.find((j) => j.id === processingJobId);
    const filename = job?.filename || 'document';

    // Use edited content if available, otherwise generate from result
    const htmlContent = job?.editedDocumentHtml || generateV5DocumentHTML(data);

    const handleDocumentChange = (content: string) => {
      if (job) {
        updateJob(job.id, { editedDocumentHtml: content });
      }
    };

    return (
      <div className="document-view">
        <DocumentEditor
          initialContent={htmlContent}
          filename={filename}
          onContentChange={handleDocumentChange}
        />
      </div>
    );
  };

  // Toast component
  const renderToast = () =>
    toastMessage && <div className="toast">{toastMessage}</div>;

  // Block preview modal
  const renderBlockPreviewModal = () => {
    if (!selectedBlock || !previewUrl) return null;

    const [x1, y1, x2, y2] = selectedBlock.block_bbox;
    const cropWidth = x2 - x1;
    const cropHeight = y2 - y1;

    return (
      <div
        className="block-preview-overlay"
        onClick={() => setSelectedBlock(null)}
      >
        <div
          className="block-preview-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="block-preview-header">
            <span className={`block-label ${selectedBlock.block_label}`}>
              {selectedBlock.block_label}
            </span>
            <span className="block-preview-info">
              Block #{selectedBlock.block_id} | {cropWidth}×{cropHeight}px
            </span>
            <button
              className="block-preview-close"
              onClick={() => setSelectedBlock(null)}
            >
              ×
            </button>
          </div>
          <div className="block-preview-body">
            <div className="block-preview-image-section">
              <div className="block-preview-section-label">Original Image</div>
              <div className="block-preview-image-container">
                {selectedBlockImage ? (
                  <img
                    src={selectedBlockImage}
                    alt={`${selectedBlock.block_label} block preview`}
                    className="block-preview-image"
                  />
                ) : (
                  <div className="block-preview-loading">Loading image...</div>
                )}
              </div>
            </div>
            <div className="block-preview-text-section">
              <div className="block-preview-section-label">OCR Result</div>
              <div className="block-preview-text-content">
                {selectedBlock.block_content?.trim() ? (
                  selectedBlock.block_label === 'table' ? (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: selectedBlock.block_content,
                      }}
                    />
                  ) : (
                    <pre>{selectedBlock.block_content}</pre>
                  )
                ) : (
                  <div className="block-preview-no-text">No text content</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Processing overlay
  if (isProcessing) {
    return (
      <>
        {step === 'options' && renderOptionsStep()}
        <div className="processing-overlay">
          <div className="processing-spinner" />
          <div className="processing-text">Processing your document</div>
          <div className="processing-subtext">
            This may take a few moments...
          </div>
        </div>
        {renderBlockPreviewModal()}
        {renderToast()}
      </>
    );
  }

  // Render based on step
  const renderContent = () => {
    switch (step) {
      case 'upload':
        return renderUploadStep();
      case 'options':
        return renderOptionsStep();
      case 'result':
        return renderResultStep();
      default:
        return renderUploadStep();
    }
  };

  return (
    <>
      {renderContent()}
      {renderBlockPreviewModal()}
      {renderToast()}
    </>
  );
}
