// Core types for the Export to Kajabi pipeline

export interface ExportProject {
  id: string;
  name: string;
  sourceProjectId: string;
  sourceProjectName: string;
  baseTheme: 'streamlined-home' | string;
  page: string;
  notes?: string;
  createdAt: string;
  status: 'new' | 'extracting' | 'extracted' | 'mapping' | 'mapped' | 'exporting' | 'exported' | 'error';
}

export interface ExtractedDesign {
  colors: ExtractedColor[];
  headingFont: string;
  bodyFont: string;
  logo?: string;
  buttonStyle: {
    backgroundColor: string;
    textColor: string;
    borderRadius: string;
    style: 'solid' | 'outline' | 'ghost';
  };
  header: {
    backgroundColor: string;
    textColor: string;
    navItems: Array<{ name: string; url: string }>;
    logoText?: string;
    logoImage?: string;
    sticky: boolean;
  };
  hero?: {
    heading: string;
    subheading?: string;
    ctaText?: string;
    ctaUrl?: string;
    backgroundImage?: string;
    backgroundColor?: string;
    textColor?: string;
  };
  sections: ExtractedSection[];
  footer: {
    backgroundColor: string;
    textColor: string;
    columns: number;
    copyright?: string;
    socialLinks?: Array<{ platform: string; url: string }>;
    linkGroups?: Record<string, Array<{ name: string; url: string }>>;
  };
  assets: ExtractedAsset[];
}

export interface ExtractedColor {
  name: string;
  value: string;
  usage: 'primary' | 'secondary' | 'background' | 'text' | 'accent' | 'other';
}

export type SectionIntent =
  | 'hero'
  | 'stats'
  | 'feature_grid'
  | 'program_cards'
  | 'testimonial_band'
  | 'cta_band'
  | 'content_media_split'
  | 'heading_divider'
  | 'faq'
  | 'footer_like'
  | 'unknown';

export type MediaIntent =
  | 'background_image'
  | 'foreground_image'
  | 'repeated_card_images'
  | 'decorative_image'
  | 'no_media';

export type ImageTargetRole =
  | 'hero_bg'
  | 'hero_fg'
  | 'card_image'
  | 'content_image'
  | 'testimonial_avatar'
  | 'decorative';

export interface ImageTarget {
  role: ImageTargetRole;
  sourcePath?: string;
  url?: string;
  itemIndex?: number;
}

export interface ExtractedSection {
  id: string;
  type: 'hero' | 'features' | 'testimonials' | 'cta' | 'content' | 'gallery' | 'pricing' | 'faq' | 'contact' | 'custom';
  heading?: string;
  body?: string;
  ctaText?: string;
  ctaUrl?: string;
  image?: string;
  backgroundImage?: string;
  backgroundColor?: string;
  items?: Array<{
    heading?: string;
    body?: string;
    image?: string;
    icon?: string;
    value?: string;
    price?: string;
    quote?: string;
    name?: string;
    role?: string;
    ctaText?: string;
    ctaUrl?: string;
  }>;
  // Semantic extraction metadata
  intent: SectionIntent;
  confidence: number; // 0-1
  evidence: string[];
  sourceFile?: string;
  repeatedItemCount: number;
  hasHeading: boolean;
  hasBody: boolean;
  hasButtons: boolean;
  hasImages: boolean;
  hasStats: boolean;
  hasTestimonials: boolean;
  hasPricing: boolean;
  hasRepeatedCards: boolean;
  // Media intent metadata
  mediaIntent: MediaIntent;
  mediaConfidence: number;
  mediaEvidence: string[];
  imageTargets: ImageTarget[];
}

export interface ExtractionWarning {
  sectionId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface ExtractedAsset {
  sourcePath: string;
  fileName: string;
  type: 'image' | 'font' | 'other';
  data?: ArrayBuffer;
  url?: string;
}

// Kajabi theme types

export interface KajabiThemeData {
  settingsData: KajabiSettingsData;
  files: Record<string, string>; // path -> content
  assets: Record<string, ArrayBuffer>; // path -> binary
  rootPrefix: string; // original root folder prefix (e.g. "theme-export/")
}

export interface KajabiSettingsData {
  current: Record<string, any>;
}

export interface KajabiSection {
  type: string;
  name: string;
  hidden: string | boolean;
  settings: Record<string, any>;
  block_order: string[];
  blocks: Record<string, KajabiBlock>;
}

export interface KajabiBlock {
  type: string;
  settings: Record<string, any>;
  hidden?: string | boolean;
}

// Transformation plan

export interface TransformationPlan {
  sourceProjectId: string;
  sourceProjectName: string;
  sourcePage: string;
  baseThemeId: string;
  extractedDesign: ExtractedDesign;
  operations: TransformationOperation[];
  validationWarnings: ValidationWarning[];
}

export type TransformationOperation =
  | { type: 'replaceLogo'; asset: string; fileName: string }
  | { type: 'updateGlobalSetting'; key: string; value: any; label: string }
  | { type: 'updateSectionSetting'; sectionId: string; key: string; value: any; label: string }
  | { type: 'updateBlockSetting'; sectionId: string; blockId: string; key: string; value: any; label: string }
  | { type: 'replaceImage'; target: string; asset: string; fileName: string }
  | { type: 'replaceText'; sectionId: string; blockId: string; key: string; value: string; label: string }
  | { type: 'moveSection'; sectionId: string; afterSectionId?: string }
  | { type: 'hideSection'; sectionId: string }
  | { type: 'showSection'; sectionId: string }
  | { type: 'addCssOverride'; css: string; label: string }
  | { type: 'updateNavigation'; menuId: string; links: Array<{ name: string; url: string }> }
  | { type: 'addAsset'; fileName: string; data: ArrayBuffer }
  | { type: 'addSection'; sectionId: string; section: { type: string; name: string; settings: Record<string, any>; block_order: string[]; blocks: Record<string, { type: string; settings: Record<string, any> }> }; label: string }
  | { type: 'addBlock'; sectionId: string; blockId: string; block: { type: string; settings: Record<string, any> }; label: string };

export interface ValidationWarning {
  severity: 'error' | 'warning' | 'info';
  message: string;
  target?: string;
}

export interface WorkspaceProject {
  id: string;
  name: string;
}
