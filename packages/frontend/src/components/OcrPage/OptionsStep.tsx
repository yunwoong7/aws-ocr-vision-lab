import React from 'react';
import { CheckIcon, PlayIcon } from './Icons';
import {
  OcrModel,
  OcrLanguage,
  ModelOptions,
  MODEL_INFO,
  FAMILY_LIST,
  FAMILY_INFO,
  SUPPORTED_LANGUAGES,
} from '../../types/ocr';

export interface OptionsStepProps {
  previewUrl: string | null;
  imageFilename: string | undefined;
  selectedModel: OcrModel;
  modelOptions: ModelOptions;
  isProcessing: boolean;
  handleModelChange: (model: OcrModel) => void;
  handleOptionToggle: (key: string) => void;
  setModelOptions: React.Dispatch<React.SetStateAction<ModelOptions>>;
  handleSubmit: () => void;
  onBack: () => void;
  /** True when this step was reached via "Run another model" (existing results
   *  to return to). Shows a "Back to results" action alongside the title. */
  canGoBackToResult?: boolean;
  onBackToResult?: () => void;
}

export const OptionsStep: React.FC<OptionsStepProps> = ({
  previewUrl,
  imageFilename,
  selectedModel,
  modelOptions,
  isProcessing,
  handleModelChange,
  handleOptionToggle,
  setModelOptions,
  handleSubmit,
  onBack,
  canGoBackToResult = false,
  onBackToResult,
}) => {
  const meta = MODEL_INFO[selectedModel];
  const selectedFamily = meta.family;
  const optionInfo = meta.optionInfo;
  const familyModels = FAMILY_INFO[selectedFamily].models;

  // Selecting a family switches to its first variant.
  const handleFamilyChange = (family: typeof selectedFamily) => {
    if (family === selectedFamily) return;
    handleModelChange(FAMILY_INFO[family].models[0]);
  };

  return (
    <div className="page-container">
      <div className="result-top-bar">
        <div className="result-top-bar-left">
          {canGoBackToResult && onBackToResult && (
            <button className="btn btn-sm btn-outline" onClick={onBackToResult}>
              ← Back to results
            </button>
          )}
          <span className="result-top-bar-model">{imageFilename}</span>
        </div>
        <div className="result-top-bar-right">
          <button className="btn btn-sm btn-outline" onClick={onBack}>
            Change Document
          </button>
        </div>
      </div>
      <div className="options-panel">
        {/* Image Preview */}
        <div className="options-preview">
          <div className="preview-container">
            {previewUrl && (
              <img src={previewUrl} alt="Preview" className="preview-image" />
            )}
          </div>
        </div>

        {/* Options Config */}
        <div className="options-config">
          {/* Step 1: Model Family Selection */}
          <div className="option-section">
            <div className="option-label">Select Model Family</div>
            <div className="model-cards">
              {FAMILY_LIST.map((family) => (
                <div
                  key={family.id}
                  className={`model-card ${selectedFamily === family.id ? 'selected' : ''}`}
                  onClick={() => handleFamilyChange(family.id)}
                >
                  <div className="model-card-header">
                    <span className="model-card-title">{family.title}</span>
                    <span className="model-card-radio" />
                  </div>
                  <div className="model-card-desc">{family.description}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Step 2: Variant Selection within the chosen family */}
          <div className="option-section">
            <div className="option-label">Select Model</div>
            <div className="model-cards">
              {familyModels.map((model) => (
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

          {/* Language Selection - only for models that support it */}
          {meta.supportsLanguage && (
            <div className="option-section">
              <div className="option-label">Language</div>
              <select
                className="lang-select"
                value={(modelOptions as { lang?: OcrLanguage | '' }).lang ?? ''}
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
                    (modelOptions as Record<string, boolean>)[opt.key] || false;
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

          {/* Process Button */}
          <div style={{ marginTop: 'auto', paddingTop: '24px' }}>
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
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
    </div>
  );
};
