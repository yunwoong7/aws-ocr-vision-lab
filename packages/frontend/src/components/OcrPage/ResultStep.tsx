import React from 'react';
import { ImagePanel } from './ImagePanel';
import { BlocksView } from './BlocksView';
import { V5BlocksView } from './V5BlocksView';
import { MarkdownView } from './MarkdownView';
import { JsonView } from './JsonView';
import { DocumentView } from './DocumentView';
import {
  OcrBlock,
  OcrJob,
  OcrDocument,
  OcrRun,
  OcrModel,
  OcrResultData,
  OcrV5ResultData,
  ResultViewTab,
  MODEL_INFO,
  isOcrV5Result,
  isStructureResult,
} from '../../types/ocr';

export interface ResultStepProps {
  resultData: OcrResultData;
  resultTab: ResultViewTab;
  setResultTab: (tab: ResultViewTab) => void;
  hoveredBlockId: number | null;
  setHoveredBlockId: (id: number | null) => void;
  setSelectedBlock: (block: OcrBlock | null) => void;
  // Image panel props
  previewUrl: string | null;
  loadedImageUrl: string | null;
  resultImageRef: React.RefObject<HTMLImageElement | null>;
  imageContainerRef: React.RefObject<HTMLDivElement | null>;
  showBbox: boolean;
  setShowBbox: (show: boolean) => void;
  zoomLevel: number;
  panPosition: { x: number; y: number };
  isPanning: boolean;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleZoomFit: () => void;
  handleWheel: (e: React.WheelEvent) => void;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleRunAnotherModel: () => void;
  handleNewDocument: () => void;
  currentPdfPage: number;
  totalPdfPages: number;
  handlePdfPageChange: (page: number) => void;
  setLoadedImageUrl: (url: string | null) => void;
  // Document + selected run (model tab)
  currentDocument: OcrDocument | undefined;
  selectedRun: OcrRun | undefined;
  currentModel: OcrModel | null;
  setCurrentModel: (model: OcrModel | null) => void;
  // Markdown
  isMarkdownEditMode: boolean;
  setIsMarkdownEditMode: (mode: boolean) => void;
  updateRun: (
    documentId: string,
    model: OcrModel,
    updates: Partial<OcrRun>,
  ) => void;
  copyToClipboard: (text: string) => void;
  // Document view
  croppedImagesMap: Map<number, string>;
  croppedImagesReady: boolean;
  setCroppedImagesMap: React.Dispatch<
    React.SetStateAction<Map<number, string>>
  >;
  setCroppedImagesReady: React.Dispatch<React.SetStateAction<boolean>>;
  lastProcessedBlocksRef: React.MutableRefObject<string>;
}

export const ResultStep: React.FC<ResultStepProps> = ({
  resultData,
  resultTab,
  setResultTab,
  hoveredBlockId,
  setHoveredBlockId,
  setSelectedBlock,
  previewUrl,
  loadedImageUrl,
  resultImageRef,
  imageContainerRef,
  showBbox,
  setShowBbox,
  zoomLevel,
  panPosition,
  isPanning,
  handleZoomIn,
  handleZoomOut,
  handleZoomFit,
  handleWheel,
  handleMouseDown,
  handleRunAnotherModel,
  handleNewDocument,
  currentPdfPage,
  totalPdfPages,
  handlePdfPageChange,
  setLoadedImageUrl,
  currentDocument,
  selectedRun,
  currentModel,
  setCurrentModel,
  isMarkdownEditMode,
  setIsMarkdownEditMode,
  updateRun,
  copyToClipboard,
  croppedImagesMap,
  croppedImagesReady,
  setCroppedImagesMap,
  setCroppedImagesReady,
  lastProcessedBlocksRef,
}) => {
  const isV5Format = isOcrV5Result(resultData);
  const blocks = isStructureResult(resultData)
    ? resultData.parsing_res_list
    : [];
  const v5Data = isV5Format ? (resultData as OcrV5ResultData) : null;
  const structData = isStructureResult(resultData) ? resultData : null;

  const filename = currentDocument?.filename || 'document';
  const runs = currentDocument?.runs ?? [];

  // Adapter: MarkdownView/DocumentView still take a `job` + `updateJob`. We
  // expose the selected run as a job-like object (id = document id) and route
  // edits back to the run via updateRun, so those views need no changes.
  const runAsJob: OcrJob | undefined =
    currentDocument && selectedRun
      ? {
          id: currentDocument.id,
          filename: currentDocument.filename,
          model: selectedRun.model,
          modelOptions: selectedRun.modelOptions,
          status: selectedRun.status,
          createdAt: selectedRun.createdAt,
          result: selectedRun.result,
          s3Key: currentDocument.s3Key,
          processingTimeMs: selectedRun.processingTimeMs,
          editedDocumentHtml: selectedRun.editedDocumentHtml,
          editedMarkdown: selectedRun.editedMarkdown,
        }
      : undefined;

  const updateJobAdapter = (_id: string, updates: Partial<OcrJob>) => {
    if (!currentDocument || !selectedRun) return;
    updateRun(
      currentDocument.id,
      selectedRun.model,
      updates as Partial<OcrRun>,
    );
  };

  return (
    <div className="page-container">
      <div className="result-top-bar">
        <div className="result-top-bar-left">
          {/* Model run tabs — switch which model's result is shown */}
          <div className="result-run-tabs">
            {runs.map((run) => {
              const info = MODEL_INFO[run.model];
              const isActive =
                (currentModel ?? selectedRun?.model) === run.model;
              return (
                <button
                  key={run.model}
                  className={`result-run-tab ${isActive ? 'active' : ''}`}
                  onClick={() => setCurrentModel(run.model)}
                  title={info?.title || run.model}
                >
                  {info?.title || run.model}
                  {run.status === 'processing' && (
                    <span className="result-run-tab-spinner" />
                  )}
                  {run.status === 'failed' && (
                    <span className="result-run-tab-error">!</span>
                  )}
                  {run.status === 'completed' && run.processingTimeMs && (
                    <span className="result-top-bar-time">
                      {run.processingTimeMs >= 1000
                        ? `${(run.processingTimeMs / 1000).toFixed(1)}s`
                        : `${run.processingTimeMs}ms`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="result-top-bar-right">
          <button
            className="btn btn-sm btn-outline"
            onClick={handleRunAnotherModel}
            disabled={!currentDocument?.s3Key}
            title="Run another OCR model on this file"
          >
            + Run another model
          </button>
          <button
            className="btn btn-sm btn-outline"
            onClick={handleNewDocument}
          >
            New Document
          </button>
        </div>
      </div>
      <div className="result-panel">
        {/* Image Panel */}
        <ImagePanel
          previewUrl={previewUrl}
          loadedImageUrl={loadedImageUrl}
          resultImageRef={resultImageRef}
          imageContainerRef={imageContainerRef}
          resultData={resultData}
          hoveredBlockId={hoveredBlockId}
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
          currentPdfPage={currentPdfPage}
          totalPdfPages={totalPdfPages}
          handlePdfPageChange={handlePdfPageChange}
          setLoadedImageUrl={setLoadedImageUrl}
        />

        {/* Content Panel */}
        <div className="result-content-panel">
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
              (isV5Format && v5Data ? (
                <V5BlocksView
                  data={v5Data}
                  hoveredBlockId={hoveredBlockId}
                  setHoveredBlockId={setHoveredBlockId}
                  setSelectedBlock={setSelectedBlock}
                />
              ) : (
                <BlocksView
                  blocks={blocks}
                  hoveredBlockId={hoveredBlockId}
                  setHoveredBlockId={setHoveredBlockId}
                  setSelectedBlock={setSelectedBlock}
                  croppedImagesMap={croppedImagesMap}
                />
              ))}
            {resultTab === 'json' && (
              <JsonView
                data={resultData}
                filename={filename}
                copyToClipboard={copyToClipboard}
              />
            )}
            {resultTab === 'markdown' && (
              <MarkdownView
                blocks={isV5Format ? null : blocks}
                v5Data={v5Data}
                content={selectedRun?.result?.content}
                job={runAsJob}
                currentPdfPage={currentPdfPage}
                isMarkdownEditMode={isMarkdownEditMode}
                setIsMarkdownEditMode={setIsMarkdownEditMode}
                updateJob={updateJobAdapter}
                copyToClipboard={copyToClipboard}
              />
            )}
            {resultTab === 'document' && (
              <DocumentView
                blocks={isV5Format ? null : blocks}
                structData={structData}
                v5Data={v5Data}
                job={runAsJob}
                currentPdfPage={currentPdfPage}
                updateJob={updateJobAdapter}
                croppedImagesMap={croppedImagesMap}
                croppedImagesReady={croppedImagesReady}
                setCroppedImagesMap={setCroppedImagesMap}
                setCroppedImagesReady={setCroppedImagesReady}
                lastProcessedBlocksRef={lastProcessedBlocksRef}
                loadedImageUrl={loadedImageUrl}
                previewUrl={previewUrl}
                resultImageRef={resultImageRef}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
