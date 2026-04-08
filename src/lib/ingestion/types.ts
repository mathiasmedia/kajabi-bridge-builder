/**
 * Source project ingestion types.
 *
 * SourceProjectSnapshot is the normalized shape that the extraction
 * pipeline consumes — adapters convert various input modes into this.
 */

export interface SourceProjectSnapshot {
  projectId: string;
  projectName: string;
  page: string;
  files: Record<string, string>;       // path → content (all text files)
  assets: SnapshotAsset[];
  metadata: IngestionMetadata;
  ingestionMode: IngestionMode;
}

export interface SnapshotAsset {
  path: string;
  fileName: string;
  type: 'image' | 'font' | 'other';
  url?: string;
}

export interface IngestionMetadata {
  framework?: string;
  hasTailwind: boolean;
  hasIndexCss: boolean;
  hasAppFile: boolean;
  hasComponents: boolean;
  hasPages: boolean;
  fileCount: number;
  assetCount: number;
  componentCount: number;
  pageCount: number;
}

export type IngestionMode = 'bundled' | 'imported' | 'cross-project';

export interface IngestionResult {
  snapshot: SourceProjectSnapshot;
  warnings: IngestionWarning[];
}

export interface IngestionWarning {
  severity: 'error' | 'warning' | 'info';
  message: string;
}

/**
 * Adapter interface — each input mode implements this.
 */
export interface IngestionAdapter {
  readonly mode: IngestionMode;
  canIngest(input: unknown): boolean;
  ingest(input: unknown): Promise<IngestionResult>;
}
