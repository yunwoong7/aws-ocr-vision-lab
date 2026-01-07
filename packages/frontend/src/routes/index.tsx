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
import { AppLayoutContext } from '../components/AppLayout';
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
} from '../types/ocr';

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
    addJob,
    updateJob,
    replaceJobId,
    currentJobId,
    setCurrentJobId,
    setOnNewJob,
  } = useContext(AppLayoutContext);

  // UI State
  const [step, setStep] = useState<Step>('upload');
  const [isDragging, setIsDragging] = useState(false);

  // File State
  const [imageData, setImageData] = useState<{
    base64: string;
    filename: string;
  } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Reset to upload when "New Document" is clicked
  useEffect(() => {
    setOnNewJob(() => {
      setStep('upload');
      setImageData(null);
      setPreviewUrl(null);
      setSelectedModel('paddleocr-vl');
      setModelOptions(getDefaultOptionsForModel('paddleocr-vl'));
    });
  }, [setOnNewJob]);

  // Switch to result view when viewing a job from history
  useEffect(() => {
    if (currentJob) {
      // Update preview image from job
      if (currentJob.imageData) {
        setPreviewUrl(`data:image/jpeg;base64,${currentJob.imageData}`);
      }
      // Switch to result view if job has result
      if (currentJob.result) {
        setStep('result');
      }
      // Reset zoom and pan when switching jobs
      setZoomLevel(1);
      setPanPosition({ x: 0, y: 0 });
    }
  }, [currentJobId]);

  // Ensure previewUrl is set when step changes to result
  useEffect(() => {
    if (step === 'result' && !previewUrl) {
      const job = currentJob || jobs.find((j) => j.id === processingJobId);
      if (job?.imageData) {
        setPreviewUrl(`data:image/jpeg;base64,${job.imageData}`);
      }
    }
  }, [step, previewUrl, currentJob, jobs, processingJobId]);

  // File handling
  const handleFileSelect = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(',')[1];
      setImageData({ base64, filename: file.name });
      setPreviewUrl(e.target?.result as string);
      setStep('options');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
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
          updateJob(jobId, {
            status: 'completed',
            result: data.result,
          });
          setIsProcessing(false);
          setProcessingJobId(null);
          setStep('result');
        } else if (data.status === 'failed') {
          updateJob(jobId, {
            status: 'failed',
          });
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

  // Submit job
  const handleSubmit = useCallback(async () => {
    if (!imageData) return;

    setIsProcessing(true);

    const jobId = `job-${Date.now()}`;
    const newJob: OcrJob = {
      id: jobId,
      filename: imageData.filename,
      model: selectedModel,
      modelOptions: modelOptions,
      status: 'processing',
      createdAt: new Date(),
      imageData: imageData.base64,
    };

    addJob(newJob);

    try {
      const apiUrl = runtimeConfig.apiUrl || runtimeConfig.apis?.ocr;

      if (!apiUrl) {
        throw new Error('API URL not configured');
      }

      const response = await fetch(`${apiUrl}/ocr`, {
        method: 'POST',
        headers: {
          Authorization: auth.user?.id_token || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_base64: imageData.base64,
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

      // Replace the local job ID with the backend job_id
      replaceJobId(jobId, backendJobId);
      setProcessingJobId(backendJobId);

      // Start polling
      pollJobStatus(backendJobId);
    } catch (err) {
      console.error('Submit error:', err);
      updateJob(jobId, { status: 'failed' });
      setIsProcessing(false);
      alert('Failed to submit OCR request. Please try again.');
    }
  }, [
    imageData,
    selectedModel,
    modelOptions,
    auth.user?.id_token,
    runtimeConfig,
    addJob,
    updateJob,
    replaceJobId,
    pollJobStatus,
  ]);

  // Get result data
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

    // Format 2: { results: [{ res: {...} }] }
    if (result.results?.[0]) {
      const firstResult = result.results[0] as { res?: OcrResultData };
      if (firstResult.res) return firstResult.res;
      // Format 3: { results: [{...}] } (direct data)
      return result.results[0] as OcrResultData;
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
          accept="image/*"
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
          <div className="upload-zone-title">Drag and drop your image here</div>
          <div className="upload-zone-subtitle">
            or <span className="upload-zone-link">click to browse</span>
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
                <span className="page-indicator">Page 1</span>
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
                onClick={() => {
                  // Keep the image, go back to options
                  const job =
                    currentJob || jobs.find((j) => j.id === processingJobId);
                  if (job?.imageData) {
                    setImageData({
                      base64: job.imageData,
                      filename: job.filename,
                    });
                    setPreviewUrl(`data:image/jpeg;base64,${job.imageData}`);
                    setStep('options');
                    setCurrentJobId(null);
                  }
                }}
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
                      ref={resultImageRef}
                      src={previewUrl}
                      alt="Document"
                      className="result-image"
                    />
                    {/* Block overlays for Structure format */}
                    {showBbox &&
                      !isV5Format &&
                      blocks.map((block, idx) => {
                        const [x1, y1, x2, y2] = block.block_bbox;
                        const structData = resultData as OcrStructureResultData;
                        const imageEl = resultImageRef.current;
                        const scaleX = imageEl
                          ? imageEl.clientWidth / structData.width
                          : 1;
                        const scaleY = imageEl
                          ? imageEl.clientHeight / structData.height
                          : 1;

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
                      isV5Format &&
                      v5Data &&
                      v5Data.rec_boxes.map((box, idx) => {
                        const [x1, y1, x2, y2] = box;
                        const imageEl = resultImageRef.current;
                        // Use natural dimensions for scaling
                        const scaleX = imageEl
                          ? imageEl.clientWidth / imageEl.naturalWidth
                          : 1;
                        const scaleY = imageEl
                          ? imageEl.clientHeight / imageEl.naturalHeight
                          : 1;

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
                </div>
              );
            })()}
            <div className="result-tabs">
              {(['blocks', 'json', 'markdown'] as ResultViewTab[]).map(
                (tab) => (
                  <button
                    key={tab}
                    className={`result-tab ${resultTab === tab ? 'active' : ''}`}
                    onClick={() => setResultTab(tab)}
                  >
                    {tab === 'blocks'
                      ? 'Blocks'
                      : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ),
              )}
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
            </div>
          </div>
        </div>
      </div>
    );
  };

  // View renderers
  const renderBlocksView = (blocks: OcrBlock[]) => {
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

    // Helper function to render cropped image
    const renderCroppedImage = (block: OcrBlock) => {
      if (!previewUrl) return null;
      const [x1, y1, x2, y2] = block.block_bbox;
      const structData = resultData as OcrStructureResultData;
      if (!structData.width || !structData.height) return null;

      const cropWidth = x2 - x1;
      const cropHeight = y2 - y1;

      return (
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '300px',
            height: Math.min(200, (cropHeight / cropWidth) * 300),
            overflow: 'hidden',
            borderRadius: '8px',
            background: 'var(--bg-tertiary)',
          }}
        >
          <img
            src={previewUrl}
            alt={`${block.block_label} block`}
            style={{
              position: 'absolute',
              width: `${(structData.width / cropWidth) * 100}%`,
              height: 'auto',
              left: `${(-x1 / cropWidth) * 100}%`,
              top: `${(-y1 / cropHeight) * 100}%`,
              maxWidth: 'none',
            }}
          />
        </div>
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
              className={`block-item ${hoveredBlockId === block.block_id ? 'highlighted' : ''}`}
              onMouseEnter={() => setHoveredBlockId(block.block_id)}
              onMouseLeave={() => setHoveredBlockId(null)}
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
                ) : visualBlockTypes.includes(block.block_label) &&
                  (!block.block_content ||
                    block.block_content.trim() === '') ? (
                  renderCroppedImage(block)
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

  const renderJsonView = (data: OcrResultData) => (
    <div className="json-view">
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );

  const renderMarkdownView = (blocks: OcrBlock[]) => {
    const markdown = blocks
      .map((block) => {
        if (block.block_label === 'doc_title') {
          return `# ${block.block_content}`;
        }
        if (block.block_label === 'paragraph_title') {
          return `## ${block.block_content}`;
        }
        if (block.block_label === 'table') {
          return block.block_content;
        }
        return block.block_content;
      })
      .join('\n\n');

    return (
      <div className="rendered-view">
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
          {markdown}
        </pre>
      </div>
    );
  };

  // PP-OCRv5 specific renderers
  const renderV5BlocksView = (data: OcrV5ResultData) => {
    const texts = data.rec_texts || [];
    const scores = data.rec_scores || [];

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
              className={`block-item ${hoveredBlockId === idx ? 'highlighted' : ''}`}
              onMouseEnter={() => setHoveredBlockId(idx)}
              onMouseLeave={() => setHoveredBlockId(null)}
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
    const texts = data.rec_texts || [];
    const markdown = texts.join('\n');

    return (
      <div className="rendered-view">
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
          {markdown}
        </pre>
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
      </>
    );
  }

  // Render based on step
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
}
