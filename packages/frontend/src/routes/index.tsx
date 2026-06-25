import React, {
  useState,
  useCallback,
  useRef,
  useContext,
  useEffect,
} from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useAuth } from 'react-oidc-context';
import { useRuntimeConfig } from '../hooks/useRuntimeConfig';
import { useOcrApi } from '../hooks/useOcrApi';
import { renderPdfToImage } from '../utils/pdfUtils';
import { generateCroppedImages } from '../utils/ocrHelpers';

import { AppLayoutContext } from '../components/AppLayout';
import { useDialog } from '../components/Dialog';
import { UploadStep } from '../components/OcrPage/UploadStep';
import { OptionsStep } from '../components/OcrPage/OptionsStep';
import { ResultStep } from '../components/OcrPage/ResultStep';
import { BlockPreviewModal } from '../components/OcrPage/BlockPreviewModal';

import {
  OcrModel,
  OcrRun,
  OcrBlock,
  OcrResultData,
  OcrStructureResultData,
  ResultViewTab,
  ModelOptions,
  FAMILY_INFO,
  getDefaultOptionsForModel,
  getFamilyForModel,
  isOcrV5Result,
  isStructureResult,
} from '../types/ocr';

export const Route = createFileRoute('/')({
  component: OcrPage,
});

type Step = 'upload' | 'options' | 'result';

// Max upload size: 100MB (files > 5MB go through a presigned URL). Module-level
// so it's referentially stable and doesn't need to be a hook dependency.
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// MIME types accepted by the uploader / drag-and-drop handler.
const SUPPORTED_FILE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/tiff',
  'application/pdf',
];

function OcrPage() {
  const auth = useAuth();
  const runtimeConfig = useRuntimeConfig();
  const { confirm, alert: showAlert } = useDialog();
  const {
    documents,
    setDocuments,
    addDocument,
    updateDocument,
    upsertRun,
    updateRun,
    currentDocumentId,
    setCurrentDocumentId,
    currentModel,
    setCurrentModel,
    setOnNewJob,
    setOnDeleteS3Files,
  } = useContext(AppLayoutContext);

  // API URL for convenience
  const apiUrl = runtimeConfig.apiUrl || runtimeConfig.apis?.ocr;

  // API hooks
  const {
    fetchDocuments,
    deleteS3Files,
    fetchS3ImageUrl,
    fetchRunResult,
    fetchEndpointStatus,
    setEndpointPower,
  } = useOcrApi();

  // Fetch documents on mount when authenticated
  useEffect(() => {
    if (auth.isAuthenticated && apiUrl) {
      fetchDocuments().then((fetchedDocs) => {
        setDocuments(fetchedDocs);
      });
    }
  }, [auth.isAuthenticated, apiUrl, fetchDocuments, setDocuments]);

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

  // Processing State (true while submitting the very first run of a new file)
  const [isProcessing, setIsProcessing] = useState(false);

  // Seconds elapsed while waiting for the selected run's result (drives the
  // progress indicator on the result screen).
  const [waitElapsedSec, setWaitElapsedSec] = useState(0);

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

  // State for cropped images
  const [croppedImagesMap, setCroppedImagesMap] = useState<Map<number, string>>(
    new Map(),
  );
  const [croppedImagesReady, setCroppedImagesReady] = useState(false);
  const lastProcessedBlocksRef = useRef<string>('');

  // Current document + selected run (the model tab being viewed)
  const currentDocument = documents.find((d) => d.id === currentDocumentId);
  const selectedRun =
    currentDocument?.runs.find((r) => r.model === currentModel) ??
    currentDocument?.runs[0];

  // Content-only results (Unlimited-OCR) have no per-block structure, so the
  // blocks/document tabs are empty — default such runs to the markdown tab.
  const isContentOnlyResult =
    !!selectedRun?.result &&
    !(selectedRun.result.results && selectedRun.result.results.length > 0) &&
    !!selectedRun.result.content;
  useEffect(() => {
    if (
      isContentOnlyResult &&
      (resultTab === 'blocks' || resultTab === 'document')
    ) {
      setResultTab('markdown');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isContentOnlyResult, selectedRun?.model, currentDocumentId]);

  // Tick a 1s timer while the selected run is still processing (no result yet),
  // so the result screen can show elapsed time instead of a static "Loading...".
  const selectedRunWaiting =
    !!selectedRun && selectedRun.status === 'processing' && !selectedRun.result;
  useEffect(() => {
    if (!selectedRunWaiting) {
      setWaitElapsedSec(0);
      return;
    }
    setWaitElapsedSec(0);
    const id = setInterval(() => {
      setWaitElapsedSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [selectedRunWaiting, selectedRun?.model, currentDocumentId]);

  // Reset loadedImageUrl and cropped images when previewUrl changes
  useEffect(() => {
    setLoadedImageUrl(null);
    setCroppedImagesMap(new Map());
    setCroppedImagesReady(false);
    lastProcessedBlocksRef.current = '';
    // For data URLs, the image might already be complete, so check after a tick
    if (previewUrl?.startsWith('data:')) {
      const checkComplete = () => {
        if (
          resultImageRef.current?.complete &&
          resultImageRef.current.naturalWidth > 0
        ) {
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

  // When a document is selected from the sidebar, default the model tab to its
  // first run (so selectedRun resolves) and load the shared input image.
  useEffect(() => {
    if (!currentDocument) return;
    // Default the selected model tab to the document's first run.
    if (
      currentDocument.runs.length > 0 &&
      !currentDocument.runs.some((r) => r.model === currentModel)
    ) {
      setCurrentModel(currentDocument.runs[0].model);
    }

    // Immediately clear previous state so nothing stale is shown
    setPreviewUrl(null);
    setLoadedImageUrl(null);

    const s3Key = currentDocument.s3Key;
    if (s3Key) {
      (async () => {
        const imageUrl = await fetchS3ImageUrl(s3Key);
        if (!imageUrl) {
          updateDocument(currentDocument.id, { imageAvailable: false });
          setPreviewUrl(null);
          return;
        }
        if (currentDocument.imageAvailable !== true) {
          updateDocument(currentDocument.id, { imageAvailable: true });
        }

        if (currentDocument.filename.toLowerCase().endsWith('.pdf')) {
          try {
            const response = await fetch(imageUrl);
            const arrayBuffer = await response.arrayBuffer();
            pdfArrayBufferRef.current = arrayBuffer;
            const { dataUrl, totalPages } = await renderPdfToImage(
              arrayBuffer,
              1,
            );
            setTotalPdfPages(totalPages);
            setCurrentPdfPage(1);
            setPreviewUrl(dataUrl || null);
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

    setStep('result');
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
    setIsMarkdownEditMode(false);
    setCroppedImagesMap(new Map());
    setCroppedImagesReady(false);
    lastProcessedBlocksRef.current = '';
    // Depend on the document id + s3Key, not the object, to avoid re-running
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentDocumentId,
    currentDocument?.s3Key,
    fetchS3ImageUrl,
    updateDocument,
  ]);

  // Lazily fetch a run's result from S3 when its tab is selected but the result
  // hasn't been loaded yet (e.g. after a page reload).
  useEffect(() => {
    if (!currentDocument || !selectedRun) return;
    if (selectedRun.result || selectedRun.status !== 'completed') return;
    (async () => {
      const result = await fetchRunResult(
        currentDocument.id,
        selectedRun.model,
      );
      if (result) {
        updateRun(currentDocument.id, selectedRun.model, { result });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentDocumentId,
    selectedRun?.model,
    selectedRun?.status,
    selectedRun?.result,
    fetchRunResult,
    updateRun,
  ]);

  // Ensure previewUrl is set when step changes to result
  useEffect(() => {
    if (step === 'result' && !previewUrl) {
      const docS3Key = currentDocument?.s3Key;
      if (!currentDocument || !docS3Key) return;

      (async () => {
        const imageUrl = await fetchS3ImageUrl(docS3Key);
        if (!imageUrl) return;

        // Check if it's a PDF - render first page to image
        if (currentDocument.filename.toLowerCase().endsWith('.pdf')) {
          try {
            const response = await fetch(imageUrl);
            const arrayBuffer = await response.arrayBuffer();
            pdfArrayBufferRef.current = arrayBuffer;
            const { dataUrl, totalPages } = await renderPdfToImage(
              arrayBuffer,
              1,
            );
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
  }, [step, previewUrl, currentDocument, fetchS3ImageUrl]);

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

    if (selectedRun?.result?.results?.[0]) {
      const resultData = selectedRun.result.results[0];
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
  }, [selectedBlock, selectedRun]);

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

  // File handling
  const handleFileSelect = useCallback(
    async (file: File) => {
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        await showAlert({
          title: 'File too large',
          message: `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 100MB.`,
        });
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
          const { dataUrl: pdfPreviewUrl, totalPages } = await renderPdfToImage(
            arrayBufferCopy,
            1,
          );
          if (!pdfPreviewUrl) {
            await showAlert({
              title: 'PDF error',
              message: 'Failed to render PDF preview',
            });
            return;
          }

          setTotalPdfPages(totalPages);
          setCurrentPdfPage(1);
          setImageData({ base64, filename: file.name });
          setPreviewUrl(pdfPreviewUrl);
          setStep('options');
        } catch (error) {
          console.error('Failed to process PDF:', error);
          await showAlert({
            title: 'PDF error',
            message: 'Failed to process PDF file',
          });
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
    },
    [showAlert],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && SUPPORTED_FILE_TYPES.includes(file.type)) {
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
  const handlePdfPageChange = useCallback(
    async (newPage: number) => {
      if (!pdfArrayBufferRef.current || newPage < 1 || newPage > totalPdfPages)
        return;

      try {
        const { dataUrl } = await renderPdfToImage(
          pdfArrayBufferRef.current,
          newPage,
        );
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
    },
    [totalPdfPages],
  );

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

  // Polling for run status — Map keyed by `${documentId}::${model}` so multiple
  // model runs on one document can poll concurrently without cancelling each
  // other (single shared timer would only track the latest run).
  const pollTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const runStartTimesRef = useRef<Map<string, number>>(new Map());

  // Cleanup all polling on unmount
  useEffect(() => {
    const timers = pollTimersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const pollRun = useCallback(
    async (documentId: string, model: OcrModel) => {
      const apiUrl = runtimeConfig.apiUrl || runtimeConfig.apis?.ocr;
      if (!apiUrl) return;
      const key = `${documentId}::${model}`;

      try {
        const response = await fetch(`${apiUrl}/ocr/${documentId}/${model}`, {
          headers: {
            Authorization: auth.user?.id_token || '',
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) throw new Error('Failed to get status');

        const data = await response.json();

        if (data.status === 'completed') {
          const start = runStartTimesRef.current.get(key);
          const processingTimeMs = start ? Date.now() - start : undefined;
          updateRun(documentId, model, {
            status: 'completed',
            result: data.result,
            processingTimeMs,
          });
          runStartTimesRef.current.delete(key);
          pollTimersRef.current.delete(key);
          setIsProcessing(false);
        } else if (data.status === 'failed') {
          updateRun(documentId, model, { status: 'failed' });
          runStartTimesRef.current.delete(key);
          pollTimersRef.current.delete(key);
          setIsProcessing(false);
          void showAlert({
            title: 'Processing failed',
            message: data.error || 'OCR processing failed.',
          });
        } else {
          // Still processing, poll again
          pollTimersRef.current.set(
            key,
            setTimeout(() => pollRun(documentId, model), 3000),
          );
        }
      } catch (error) {
        console.error('Poll error:', error);
        pollTimersRef.current.set(
          key,
          setTimeout(() => pollRun(documentId, model), 5000),
        );
      }
    },
    [runtimeConfig, auth.user?.id_token, updateRun, showAlert],
  );

  // Helper: fire the OCR request for one (document, model) run and poll it.
  const startRun = useCallback(
    async (documentId: string, s3Key: string, filename: string) => {
      if (!apiUrl) throw new Error('API URL not configured');
      const key = `${documentId}::${selectedModel}`;
      runStartTimesRef.current.set(key, Date.now());

      const response = await fetch(`${apiUrl}/ocr`, {
        method: 'POST',
        headers: {
          Authorization: auth.user?.id_token || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          s3_key: s3Key,
          document_id: documentId,
          filename,
          model: selectedModel,
          family: getFamilyForModel(selectedModel),
          options: modelOptions,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.document_id as string;
    },
    [apiUrl, auth.user?.id_token, selectedModel, modelOptions],
  );

  // Ensure the selected model's GPU endpoint is powered on before submitting.
  // Endpoints default to off (cost 0); if off, confirm with the user, turn it
  // on, and let them proceed (the request queues until the instance is ready).
  // Returns true if OK to proceed, false if the user cancelled.
  const ensureEndpointOn = useCallback(async (): Promise<boolean> => {
    const family = getFamilyForModel(selectedModel);
    const statuses = await fetchEndpointStatus();
    const status = statuses.find((s) => s.family === family);
    // Proceed without prompting if status is unknown, already powered on
    // (MinCapacity>=1), or already serving (green). Only prompt when truly off.
    if (!status || status.enabled || status.light === 'green') return true;

    const familyTitle = FAMILY_INFO[family]?.title ?? family;
    const proceed = await confirm({
      title: `Turn on ${familyTitle}?`,
      message:
        `The "${familyTitle}" model is currently off to save GPU cost. ` +
        `Turn it on and run now? Powering up the GPU can take a few minutes ` +
        `before the result is ready.`,
      confirmLabel: 'Turn on & run',
    });
    if (!proceed) return false;
    await setEndpointPower(family, true);
    return true;
  }, [selectedModel, fetchEndpointStatus, setEndpointPower, confirm]);

  // Submit: first run (new file → upload) or additional run (reuse document).
  const handleSubmit = useCallback(async () => {
    // Gate on endpoint power (confirm + turn on if off).
    if (!(await ensureEndpointOn())) return;

    const newRun: OcrRun = {
      model: selectedModel,
      family: getFamilyForModel(selectedModel),
      modelOptions,
      status: 'processing',
      createdAt: new Date(),
    };

    // --- Additional run on an already-uploaded document (no re-upload) ---
    if (currentDocument?.s3Key) {
      const documentId = currentDocument.id;
      try {
        upsertRun(documentId, newRun);
        setCurrentModel(selectedModel);
        setStep('result');
        await startRun(
          documentId,
          currentDocument.s3Key,
          currentDocument.filename,
        );
        pollRun(documentId, selectedModel);
      } catch (err) {
        console.error('Submit error (additional run):', err);
        updateRun(documentId, selectedModel, { status: 'failed' });
        await showAlert({
          title: 'Submit failed',
          message: 'Failed to submit OCR request. Please try again.',
        });
      }
      return;
    }

    // --- First run: upload the file, create the document ---
    if (!imageData) return;
    setIsProcessing(true);
    let realDocumentId = '';

    try {
      if (!apiUrl) throw new Error('API URL not configured');

      // Upload to S3 via presigned URL
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
      // The presigned step issues the real document_id (input is stored under
      // it). Use it for the run so input + results share one folder.
      const { upload_url, s3_key } = uploadData;
      realDocumentId = uploadData.document_id;

      // Convert base64 to binary and PUT to S3
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

      // Create the document locally with its first run, keyed by the real
      // document_id from the presigned step (input + results share it).
      addDocument({
        id: realDocumentId,
        filename: imageData.filename,
        s3Key: s3_key,
        imageAvailable: true,
        createdAt: new Date(),
        runs: [newRun],
      });
      setCurrentModel(selectedModel);

      // Submit OCR request with the real document_id
      await startRun(realDocumentId, s3_key, imageData.filename);

      setIsProcessing(false);
      setStep('result');
      pollRun(realDocumentId, selectedModel);
    } catch (err) {
      console.error('Submit error:', err);
      if (realDocumentId) {
        updateRun(realDocumentId, selectedModel, { status: 'failed' });
      }
      setIsProcessing(false);
      await showAlert({
        title: 'Submit failed',
        message: 'Failed to submit OCR request. Please try again.',
      });
    }
  }, [
    currentDocument,
    imageData,
    selectedModel,
    modelOptions,
    auth.user?.id_token,
    apiUrl,
    addDocument,
    upsertRun,
    updateRun,
    setCurrentModel,
    startRun,
    pollRun,
    ensureEndpointOn,
    showAlert,
  ]);

  // "Run another model": keep the current document selected (so handleSubmit
  // reuses its uploaded input without re-uploading) and go to the options step
  // to pick a different model. Defaults to a model not yet run on this file.
  const handleRunAnotherModel = useCallback(() => {
    if (!currentDocument) return;
    const usedModels = new Set(currentDocument.runs.map((r) => r.model));
    const nextModel: OcrModel =
      (
        [
          'paddleocr-vl',
          'pp-ocrv5',
          'pp-structurev3',
          'gundam',
          'base',
        ] as OcrModel[]
      ).find((m) => !usedModels.has(m)) ?? 'paddleocr-vl';
    setSelectedModel(nextModel);
    setModelOptions(getDefaultOptionsForModel(nextModel));
    setStep('options');
  }, [currentDocument]);

  // Get result data for the selected run's current page
  const getResultData = (): OcrResultData | null => {
    if (!selectedRun?.result) return null;
    // Handle various response formats
    const result = selectedRun.result as {
      res?: OcrResultData;
      results?: Array<{ res?: OcrResultData } | OcrResultData>;
    };

    // Format with results array (multi-page or single)
    if (result.results && result.results.length > 0) {
      const pageIndex = currentPdfPage - 1;
      // Use page index if results have multiple pages, otherwise use first result
      const pageResult =
        result.results.length > 1
          ? result.results[pageIndex] || result.results[0]
          : result.results[0];
      const typedResult = pageResult as { res?: OcrResultData };
      if (typedResult.res) return typedResult.res;
      return pageResult as OcrResultData;
    }

    // Format: { res: {...} } (single result)
    if (result.res) return result.res;

    // Content-only result (e.g. Unlimited-OCR): no per-block structure, just
    // markdown `content`. Synthesise an empty structure result so the result
    // view renders (loading clears) and the markdown tab shows `content`.
    const contentResult = selectedRun.result as { content?: string };
    if (contentResult.content) {
      return {
        input_path: '',
        page_index: null,
        page_count: null,
        width: 0,
        height: 0,
        parsing_res_list: [],
      } as OcrStructureResultData;
    }

    return null;
  };

  const resultData = getResultData();

  // Generate cropped images for BlocksView when in blocks tab
  useEffect(() => {
    if (resultTab !== 'blocks' || !resultData || isOcrV5Result(resultData))
      return;
    if (!isStructureResult(resultData)) return;

    const structData = resultData as OcrStructureResultData;
    const blocks = structData.parsing_res_list;
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
        const croppedMap = generateCroppedImages(
          blocks,
          structData,
          imgElement,
        );
        if (croppedMap.size > 0) {
          setCroppedImagesMap(croppedMap);
        }
      } catch (error) {
        console.error('Failed to generate cropped images:', error);
      }
    }
  }, [resultTab, resultData, loadedImageUrl, previewUrl]);

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

  const handleBackToUpload = useCallback(() => {
    setStep('upload');
    setImageData(null);
    setPreviewUrl(null);
  }, []);

  // From the options step that was reached via "Run another model", return to
  // the existing results instead of discarding them (which "Change Document"
  // does). The previously viewed run is still selected, so it shows again.
  const handleBackToResult = useCallback(() => {
    setStep('result');
  }, []);

  const handleNewDocument = useCallback(() => {
    setStep('upload');
    setImageData(null);
    setPreviewUrl(null);
    setCurrentDocumentId(null);
    setCurrentModel(null);
  }, [setCurrentDocumentId, setCurrentModel]);

  // Toast component
  const renderToast = () =>
    toastMessage && <div className="toast">{toastMessage}</div>;

  // Processing overlay
  if (isProcessing) {
    return (
      <>
        {step === 'options' && (
          <OptionsStep
            previewUrl={previewUrl}
            imageFilename={imageData?.filename}
            selectedModel={selectedModel}
            modelOptions={modelOptions}
            isProcessing={isProcessing}
            handleModelChange={handleModelChange}
            handleOptionToggle={handleOptionToggle}
            setModelOptions={setModelOptions}
            handleSubmit={handleSubmit}
            onBack={handleBackToUpload}
          />
        )}
        <div className="processing-overlay">
          <div className="processing-spinner" />
          <div className="processing-text">Processing your document</div>
          <div className="processing-subtext">
            This may take a few moments...
          </div>
        </div>
        <BlockPreviewModal
          selectedBlock={selectedBlock}
          selectedBlockImage={selectedBlockImage}
          previewUrl={previewUrl}
          onClose={() => setSelectedBlock(null)}
        />
        {renderToast()}
      </>
    );
  }

  // Render based on step
  const renderContent = () => {
    switch (step) {
      case 'upload':
        return (
          <UploadStep
            fileInputRef={fileInputRef}
            handleFileInputChange={handleFileInputChange}
            isDragging={isDragging}
            handleDrop={handleDrop}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            selectedModel={selectedModel}
            handleModelChange={handleModelChange}
          />
        );
      case 'options':
        return (
          <OptionsStep
            previewUrl={previewUrl}
            imageFilename={imageData?.filename ?? currentDocument?.filename}
            selectedModel={selectedModel}
            modelOptions={modelOptions}
            isProcessing={isProcessing}
            handleModelChange={handleModelChange}
            handleOptionToggle={handleOptionToggle}
            setModelOptions={setModelOptions}
            handleSubmit={handleSubmit}
            onBack={handleBackToUpload}
            canGoBackToResult={(currentDocument?.runs.length ?? 0) > 0}
            onBackToResult={handleBackToResult}
          />
        );
      case 'result': {
        // Show the loading overlay only until the OCR result arrives. The
        // result (esp. markdown text) must not depend on the preview image
        // finishing/ succeeding to load — image readiness is handled inside
        // ImagePanel (bbox overlays gate on loadedImageUrl separately).
        const imageLoading = !resultData;
        return (
          <div
            style={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              minHeight: 0,
            }}
          >
            {imageLoading && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0, 0, 0, 0.85)',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <div className="processing-spinner" />
                <div className="processing-text">
                  {selectedRunWaiting
                    ? `Running ${selectedRun?.model ?? 'model'}...`
                    : 'Loading...'}
                </div>
                {selectedRunWaiting && (
                  <div className="processing-subtext">
                    {waitElapsedSec}s elapsed — this model can take a while
                  </div>
                )}
              </div>
            )}
            {resultData && (
              <ResultStep
                resultData={resultData}
                resultTab={resultTab}
                setResultTab={setResultTab}
                hoveredBlockId={hoveredBlockId}
                setHoveredBlockId={setHoveredBlockId}
                setSelectedBlock={setSelectedBlock}
                previewUrl={previewUrl}
                loadedImageUrl={loadedImageUrl}
                resultImageRef={resultImageRef}
                imageContainerRef={imageContainerRef}
                showBbox={showBbox}
                setShowBbox={setShowBbox}
                zoomLevel={zoomLevel}
                panPosition={panPosition}
                isPanning={isPanning}
                handleZoomIn={handleZoomIn}
                handleZoomOut={handleZoomOut}
                handleZoomFit={handleZoomFit}
                handleWheel={handleWheel}
                handleMouseDown={handleMouseDown}
                handleRunAnotherModel={handleRunAnotherModel}
                handleNewDocument={handleNewDocument}
                currentPdfPage={currentPdfPage}
                totalPdfPages={totalPdfPages}
                handlePdfPageChange={handlePdfPageChange}
                setLoadedImageUrl={setLoadedImageUrl}
                currentDocument={currentDocument}
                selectedRun={selectedRun}
                currentModel={currentModel}
                setCurrentModel={setCurrentModel}
                isMarkdownEditMode={isMarkdownEditMode}
                setIsMarkdownEditMode={setIsMarkdownEditMode}
                updateRun={updateRun}
                copyToClipboard={copyToClipboard}
                croppedImagesMap={croppedImagesMap}
                croppedImagesReady={croppedImagesReady}
                setCroppedImagesMap={setCroppedImagesMap}
                setCroppedImagesReady={setCroppedImagesReady}
                lastProcessedBlocksRef={lastProcessedBlocksRef}
              />
            )}
          </div>
        );
      }
      default:
        return (
          <UploadStep
            fileInputRef={fileInputRef}
            handleFileInputChange={handleFileInputChange}
            isDragging={isDragging}
            handleDrop={handleDrop}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            selectedModel={selectedModel}
            handleModelChange={handleModelChange}
          />
        );
    }
  };

  return (
    <>
      {renderContent()}
      <BlockPreviewModal
        selectedBlock={selectedBlock}
        selectedBlockImage={selectedBlockImage}
        previewUrl={previewUrl}
        onClose={() => setSelectedBlock(null)}
      />
      {renderToast()}
    </>
  );
}
