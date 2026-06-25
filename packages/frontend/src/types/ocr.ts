// Model family types
export type OcrFamily = 'paddleocr' | 'unlimited-ocr' | 'glm-ocr';

// SageMaker endpoint power status (per family). `light` drives the UI dot:
//   green = ready, grey = off, yellow = transitioning.
export interface EndpointStatus {
  family: OcrFamily;
  endpointName: string;
  enabled: boolean; // autoscaling MinCapacity >= 1
  minCapacity: number;
  maxCapacity: number;
  currentInstanceCount: number;
  endpointStatus: string;
  light: 'green' | 'grey' | 'yellow';
}

// Model (variant) types
export type OcrModel =
  | 'pp-ocrv5'
  | 'pp-structurev3'
  | 'paddleocr-vl'
  | 'gundam'
  | 'base'
  | 'glm-ocr';

// Supported languages for PP-OCRv5 and PP-StructureV3
export type OcrLanguage =
  | 'ch'
  | 'en'
  | 'korean'
  | 'japan'
  | 'chinese_cht'
  | 'ta'
  | 'te'
  | 'ka'
  | 'latin'
  | 'arabic'
  | 'cyrillic'
  | 'devanagari'
  | 'ar'
  | 'hi'
  | 'ug'
  | 'fa'
  | 'ur'
  | 'rs_latin'
  | 'oc'
  | 'mr'
  | 'ne'
  | 'rs_cyrillic'
  | 'bg'
  | 'uk'
  | 'be'
  | 'te'
  | 'kn'
  | 'rsc'
  | 'pu'
  | 'french'
  | 'german'
  | 'it'
  | 'es'
  | 'pt'
  | 'ru'
  | 'vi'
  | 'ms'
  | 'per'
  | 'sa'
  | 'sq'
  | 'az'
  | 'bh'
  | 'bn'
  | 'bs'
  | 'ceb'
  | 'hr'
  | 'cs'
  | 'da'
  | 'nl'
  | 'et'
  | 'fi'
  | 'ga'
  | 'gl'
  | 'gu'
  | 'ha'
  | 'he'
  | 'hu'
  | 'id'
  | 'ig'
  | 'is'
  | 'jv'
  | 'ku'
  | 'ky'
  | 'la'
  | 'lt'
  | 'lv'
  | 'mg'
  | 'mi'
  | 'mk'
  | 'ml'
  | 'mn'
  | 'mt'
  | 'no'
  | 'or'
  | 'pa'
  | 'pl'
  | 'ro'
  | 'sk'
  | 'sl'
  | 'sn'
  | 'so'
  | 'sr'
  | 'su'
  | 'sw'
  | 'sv'
  | 'tg'
  | 'th'
  | 'tl'
  | 'tr'
  | 'tk'
  | 'uz'
  | 'xh'
  | 'yo'
  | 'zu';

export const SUPPORTED_LANGUAGES: { code: OcrLanguage | ''; name: string }[] = [
  // Default option
  { code: '', name: 'Default (Not specified)' },

  // Primary languages
  { code: 'ch', name: 'Chinese & English (中英)' },
  { code: 'en', name: 'English' },
  { code: 'korean', name: 'Korean (한국어)' },
  { code: 'japan', name: 'Japanese (日本語)' },
  { code: 'chinese_cht', name: 'Chinese Traditional (繁體中文)' },

  // Major world languages
  { code: 'french', name: 'French (Français)' },
  { code: 'german', name: 'German (Deutsch)' },
  { code: 'it', name: 'Italian (Italiano)' },
  { code: 'es', name: 'Spanish (Español)' },
  { code: 'pt', name: 'Portuguese (Português)' },
  { code: 'ru', name: 'Russian (Русский)' },
  { code: 'ar', name: 'Arabic (العربية)' },
  { code: 'hi', name: 'Hindi (हिन्दी)' },
  { code: 'vi', name: 'Vietnamese (Tiếng Việt)' },
  { code: 'th', name: 'Thai (ไทย)' },
  { code: 'ms', name: 'Malay (Bahasa Melayu)' },
  { code: 'id', name: 'Indonesian (Bahasa Indonesia)' },
  { code: 'tr', name: 'Turkish (Türkçe)' },
  { code: 'pl', name: 'Polish (Polski)' },
  { code: 'nl', name: 'Dutch (Nederlands)' },

  // Multi-script support
  { code: 'latin', name: 'Latin (Multi-language)' },
  { code: 'arabic', name: 'Arabic Script (Multi-language)' },
  { code: 'cyrillic', name: 'Cyrillic Script (Multi-language)' },
  { code: 'devanagari', name: 'Devanagari Script (Multi-language)' },

  // South Asian languages
  { code: 'ta', name: 'Tamil (தமிழ்)' },
  { code: 'te', name: 'Telugu (తెలుగు)' },
  { code: 'ka', name: 'Kannada (ಕನ್ನಡ)' },
  { code: 'kn', name: 'Kannada (ಕನ್ನಡ)' },
  { code: 'ml', name: 'Malayalam (മലയാളം)' },
  { code: 'mr', name: 'Marathi (मराठी)' },
  { code: 'ne', name: 'Nepali (नेपाली)' },
  { code: 'bn', name: 'Bengali (বাংলা)' },
  { code: 'gu', name: 'Gujarati (ગુજરાતી)' },
  { code: 'pa', name: 'Punjabi (ਪੰਜਾਬੀ)' },
  { code: 'or', name: 'Oriya (ଓଡ଼ିଆ)' },
  { code: 'sa', name: 'Sanskrit (संस्कृतम्)' },
  { code: 'bh', name: 'Bihari (बिहारी)' },
  { code: 'pu', name: 'Punjabi (پنجابی)' },

  // Middle Eastern & Central Asian
  { code: 'fa', name: 'Persian (فارسی)' },
  { code: 'per', name: 'Persian (فارسی)' },
  { code: 'ur', name: 'Urdu (اردو)' },
  { code: 'ug', name: 'Uyghur (ئۇيغۇرچە)' },
  { code: 'he', name: 'Hebrew (עברית)' },
  { code: 'ku', name: 'Kurdish (کوردی)' },
  { code: 'az', name: 'Azerbaijani (Azərbaycan)' },
  { code: 'ky', name: 'Kyrgyz (Кыргызча)' },
  { code: 'tg', name: 'Tajik (Тоҷикӣ)' },
  { code: 'tk', name: 'Turkmen (Türkmençe)' },
  { code: 'uz', name: 'Uzbek (Oʻzbekcha)' },

  // European languages
  { code: 'uk', name: 'Ukrainian (Українська)' },
  { code: 'be', name: 'Belarusian (Беларуская)' },
  { code: 'bg', name: 'Bulgarian (Български)' },
  { code: 'mk', name: 'Macedonian (Македонски)' },
  { code: 'sr', name: 'Serbian (Српски)' },
  { code: 'rs_cyrillic', name: 'Serbian Cyrillic (Српски)' },
  { code: 'rs_latin', name: 'Serbian Latin (Srpski)' },
  { code: 'rsc', name: 'Serbian Cyrillic (Српски)' },
  { code: 'hr', name: 'Croatian (Hrvatski)' },
  { code: 'bs', name: 'Bosnian (Bosanski)' },
  { code: 'sl', name: 'Slovenian (Slovenščina)' },
  { code: 'sk', name: 'Slovak (Slovenčina)' },
  { code: 'cs', name: 'Czech (Čeština)' },
  { code: 'hu', name: 'Hungarian (Magyar)' },
  { code: 'ro', name: 'Romanian (Română)' },
  { code: 'sq', name: 'Albanian (Shqip)' },
  { code: 'et', name: 'Estonian (Eesti)' },
  { code: 'lt', name: 'Lithuanian (Lietuvių)' },
  { code: 'lv', name: 'Latvian (Latviešu)' },
  { code: 'fi', name: 'Finnish (Suomi)' },
  { code: 'sv', name: 'Swedish (Svenska)' },
  { code: 'no', name: 'Norwegian (Norsk)' },
  { code: 'da', name: 'Danish (Dansk)' },
  { code: 'is', name: 'Icelandic (Íslenska)' },
  { code: 'ga', name: 'Irish (Gaeilge)' },
  { code: 'gl', name: 'Galician (Galego)' },
  { code: 'oc', name: 'Occitan (Occitan)' },
  { code: 'la', name: 'Latin (Latina)' },
  { code: 'mt', name: 'Maltese (Malti)' },

  // Southeast Asian & Pacific
  { code: 'tl', name: 'Tagalog (Filipino)' },
  { code: 'ceb', name: 'Cebuano' },
  { code: 'jv', name: 'Javanese (Basa Jawa)' },
  { code: 'su', name: 'Sundanese (Basa Sunda)' },
  { code: 'mi', name: 'Maori (Te Reo Māori)' },
  { code: 'mg', name: 'Malagasy' },
  { code: 'mn', name: 'Mongolian (Монгол)' },

  // African languages
  { code: 'sw', name: 'Swahili (Kiswahili)' },
  { code: 'ha', name: 'Hausa (هَوُسَ)' },
  { code: 'yo', name: 'Yoruba (Yorùbá)' },
  { code: 'ig', name: 'Igbo (Asụsụ Igbo)' },
  { code: 'sn', name: 'Shona (chiShona)' },
  { code: 'so', name: 'Somali (Soomaali)' },
  { code: 'xh', name: 'Xhosa (isiXhosa)' },
  { code: 'zu', name: 'Zulu (isiZulu)' },
];

// Model-specific options
export interface PpOcrV5Options {
  lang: OcrLanguage | '';
  use_doc_orientation_classify: boolean;
  use_doc_unwarping: boolean;
  use_textline_orientation: boolean;
}

export interface PpStructureV3Options {
  lang: OcrLanguage | '';
  use_doc_orientation_classify: boolean;
  use_doc_unwarping: boolean;
}

// VL model has no additional options
export type PaddleOcrVlOptions = Record<string, never>;

// Unlimited-OCR variants (gundam/base) have no user-facing options;
// the sizing preset is implied by the selected variant.
export type UnlimitedOcrOptions = Record<string, never>;

// GLM-OCR has no user-facing options (fixed document-parsing prompt).
export type GlmOcrOptions = Record<string, never>;

export type ModelOptions =
  | PpOcrV5Options
  | PpStructureV3Options
  | PaddleOcrVlOptions
  | UnlimitedOcrOptions
  | GlmOcrOptions;

// Combined OCR options
export interface OcrOptions {
  model: OcrModel;
  modelOptions: ModelOptions;
}

// Request types
export interface OcrRequest {
  image_base64: string;
  filename: string;
  model: OcrModel;
  options: ModelOptions;
}

export interface OcrJobResponse {
  job_id: string;
  status: 'processing' | 'completed' | 'failed';
  output_key: string;
}

// Result types - Block structure from PaddleOCR (PP-StructureV3, PaddleOCR-VL)
export interface OcrBlock {
  block_label: string;
  block_content: string;
  block_bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  block_id: number;
  block_order: number | null;
  group_id: number;
}

// PP-OCRv5 result format
export interface OcrV5ResultData {
  input_path: string;
  page_index: number | null;
  rec_texts: string[];
  rec_boxes?: number[][]; // [[x1, y1, x2, y2], ...] - simple bbox format
  rec_polys?: number[][][]; // [[[x1, y1], [x2, y2], [x3, y3], [x4, y4]], ...] - polygon format
  rec_scores: number[];
  model_settings?: Record<string, unknown>;
}

// Helper to convert polygon to bbox [x1, y1, x2, y2]
export function polygonToBbox(
  poly: number[][],
): [number, number, number, number] {
  if (!poly || poly.length !== 4) {
    return [0, 0, 0, 0];
  }
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// Helper to get bbox from V5 data (handles both rec_boxes and rec_polys)
export function getV5Bbox(
  data: OcrV5ResultData,
  idx: number,
): [number, number, number, number] {
  // Try rec_polys first (4-point polygon format)
  if (data.rec_polys && data.rec_polys[idx]) {
    return polygonToBbox(data.rec_polys[idx]);
  }
  // Fall back to rec_boxes (simple bbox or 8-point format)
  if (data.rec_boxes && data.rec_boxes[idx]) {
    const box = data.rec_boxes[idx];
    if (box.length === 4) {
      return box as [number, number, number, number];
    } else if (box.length === 8) {
      // 8-point format [x1,y1,x2,y2,x3,y3,x4,y4]
      const xs = [box[0], box[2], box[4], box[6]];
      const ys = [box[1], box[3], box[5], box[7]];
      return [
        Math.min(...xs),
        Math.min(...ys),
        Math.max(...xs),
        Math.max(...ys),
      ];
    }
  }
  return [0, 0, 0, 0];
}

// PP-StructureV3, PaddleOCR-VL result format
export interface OcrStructureResultData {
  input_path: string;
  page_index: number | null;
  page_count: number | null;
  width: number;
  height: number;
  model_settings?: Record<string, unknown>;
  parsing_res_list: OcrBlock[];
}

// Union type for all result formats
export type OcrResultData = OcrV5ResultData | OcrStructureResultData;

// Type guard to check if result is PP-OCRv5 format
export function isOcrV5Result(data: OcrResultData): data is OcrV5ResultData {
  return 'rec_texts' in data && Array.isArray(data.rec_texts);
}

// Type guard to check if result is Structure format
export function isStructureResult(
  data: OcrResultData,
): data is OcrStructureResultData {
  return 'parsing_res_list' in data && Array.isArray(data.parsing_res_list);
}

export interface OcrResult {
  success: boolean;
  format: string;
  content: string;
  results?: OcrResultData[];
  raw?: unknown;
}

export interface OcrStatusResponse {
  status: 'processing' | 'completed' | 'failed';
  result?: OcrResult;
  error?: string;
}

// A single model's OCR result on a document. One document has N runs.
export interface OcrRun {
  model: OcrModel;
  family: OcrFamily;
  modelOptions?: ModelOptions;
  status: 'processing' | 'completed' | 'failed';
  createdAt: Date;
  result?: OcrResult;
  processingTimeMs?: number; // Time taken to process in milliseconds
  editedDocumentHtml?: Record<number, string>; // User-edited document HTML per page
  editedMarkdown?: Record<number, string>; // User-edited markdown content per page
}

// An uploaded file. Its input image is shared across all runs.
export interface OcrDocument {
  id: string;
  filename: string;
  s3Key?: string; // S3 key for the shared input image
  imageAvailable?: boolean; // Whether the image is available in S3
  createdAt: Date;
  runs: OcrRun[];
}

// Flattened document+run view passed to MarkdownView/DocumentView (which only
// need id + edit state + model). ResultStep builds this from the selected run.
export interface OcrJob {
  id: string;
  filename: string;
  model: OcrModel;
  modelOptions?: ModelOptions;
  status: 'processing' | 'completed' | 'failed';
  createdAt: Date;
  result?: OcrResult;
  s3Key?: string;
  processingTimeMs?: number;
  editedDocumentHtml?: Record<number, string>;
  editedMarkdown?: Record<number, string>;
}

// View types for result display
export type ResultViewTab = 'blocks' | 'json' | 'markdown' | 'document';

// Default options by model
export const DEFAULT_PP_OCRV5_OPTIONS: PpOcrV5Options = {
  lang: '',
  use_doc_orientation_classify: false,
  use_doc_unwarping: false,
  use_textline_orientation: false,
};

export const DEFAULT_PP_STRUCTUREV3_OPTIONS: PpStructureV3Options = {
  lang: '',
  use_doc_orientation_classify: false,
  use_doc_unwarping: false,
};

export const DEFAULT_PADDLEOCR_VL_OPTIONS: PaddleOcrVlOptions = {};
export const DEFAULT_UNLIMITED_OCR_OPTIONS: UnlimitedOcrOptions = {};
export const DEFAULT_GLM_OCR_OPTIONS: GlmOcrOptions = {};

// Option info for UI
export interface OptionInfo {
  key: string;
  title: string;
  description: string;
}

const ORIENTATION_OPTION: OptionInfo = {
  key: 'use_doc_orientation_classify',
  title: 'Document Orientation Classification',
  description: 'Automatically detect and correct document orientation',
};
const UNWARPING_OPTION: OptionInfo = {
  key: 'use_doc_unwarping',
  title: 'Document Unwarping',
  description: 'Correct perspective distortion and warping in documents',
};
const TEXTLINE_OPTION: OptionInfo = {
  key: 'use_textline_orientation',
  title: 'Textline Orientation',
  description: 'Detect and handle rotated text lines',
};

export const PP_OCRV5_OPTION_INFO: OptionInfo[] = [
  ORIENTATION_OPTION,
  UNWARPING_OPTION,
  TEXTLINE_OPTION,
];

export const PP_STRUCTUREV3_OPTION_INFO: OptionInfo[] = [
  ORIENTATION_OPTION,
  UNWARPING_OPTION,
];

// ---------------------------------------------------------------------------
// Data-driven model metadata.
//
// To add a new model: add its id to OcrModel, then add one MODEL_INFO entry
// and list it under its family in FAMILY_INFO. The UI (family/variant cards,
// option toggles, language selector, sidebar label) is fully data-driven off
// these tables — no per-model `if` branches anywhere.
// ---------------------------------------------------------------------------
export interface ModelMeta {
  family: OcrFamily;
  title: string;
  description: string;
  /** Short badge label shown in the job sidebar (e.g. v5, VL) */
  shortLabel: string;
  /** Toggle options shown for this model (empty = no options section) */
  optionInfo: OptionInfo[];
  /** Whether the language selector applies to this model */
  supportsLanguage: boolean;
  /** Default options applied when this model is selected */
  defaultOptions: ModelOptions;
}

export interface FamilyMeta {
  id: OcrFamily;
  title: string;
  description: string;
  models: OcrModel[];
}

export const MODEL_INFO: Record<OcrModel, ModelMeta> = {
  'pp-ocrv5': {
    family: 'paddleocr',
    title: 'PP-OCRv5',
    description: 'General-purpose OCR with high accuracy for text extraction',
    shortLabel: 'v5',
    optionInfo: PP_OCRV5_OPTION_INFO,
    supportsLanguage: true,
    defaultOptions: DEFAULT_PP_OCRV5_OPTIONS,
  },
  'pp-structurev3': {
    family: 'paddleocr',
    title: 'PP-StructureV3',
    description: 'Document structure analysis with table and layout detection',
    shortLabel: 'Struct',
    optionInfo: PP_STRUCTUREV3_OPTION_INFO,
    supportsLanguage: true,
    defaultOptions: DEFAULT_PP_STRUCTUREV3_OPTIONS,
  },
  'paddleocr-vl': {
    family: 'paddleocr',
    title: 'PaddleOCR-VL',
    description: 'Vision-language model for complex document understanding',
    shortLabel: 'VL',
    optionInfo: [],
    supportsLanguage: false,
    defaultOptions: DEFAULT_PADDLEOCR_VL_OPTIONS,
  },
  gundam: {
    family: 'unlimited-ocr',
    title: 'Gundam',
    description:
      'High-detail single-image parsing (crops the image for fine text)',
    shortLabel: 'GD',
    optionInfo: [],
    supportsLanguage: false,
    defaultOptions: DEFAULT_UNLIMITED_OCR_OPTIONS,
  },
  base: {
    family: 'unlimited-ocr',
    title: 'Base',
    description: 'Balanced single-image and multi-page (PDF) document parsing',
    shortLabel: 'Base',
    optionInfo: [],
    supportsLanguage: false,
    defaultOptions: DEFAULT_UNLIMITED_OCR_OPTIONS,
  },
  'glm-ocr': {
    family: 'glm-ocr',
    title: 'GLM-OCR',
    description:
      'Zhipu GLM-OCR — compact 0.9B multimodal OCR for documents and PDFs',
    shortLabel: 'GLM',
    optionInfo: [],
    supportsLanguage: false,
    defaultOptions: DEFAULT_GLM_OCR_OPTIONS,
  },
};

export const FAMILY_INFO: Record<OcrFamily, FamilyMeta> = {
  paddleocr: {
    id: 'paddleocr',
    title: 'PaddleOCR',
    description:
      'PaddlePaddle OCR models — text, structure, and vision-language',
    models: ['pp-ocrv5', 'pp-structurev3', 'paddleocr-vl'],
  },
  'unlimited-ocr': {
    id: 'unlimited-ocr',
    title: 'Unlimited-OCR',
    description:
      'Baidu Unlimited-OCR — long-document parsing vision-language model',
    models: ['gundam', 'base'],
  },
  'glm-ocr': {
    id: 'glm-ocr',
    title: 'GLM-OCR',
    description: 'Zhipu GLM-OCR — compact 0.9B multimodal OCR model',
    models: ['glm-ocr'],
  },
};

export const FAMILY_LIST: FamilyMeta[] = Object.values(FAMILY_INFO);

export function getFamilyForModel(model: OcrModel): OcrFamily {
  return MODEL_INFO[model].family;
}

export function getDefaultOptionsForModel(model: OcrModel): ModelOptions {
  return { ...MODEL_INFO[model].defaultOptions };
}
