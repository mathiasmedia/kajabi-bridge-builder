/**
 * ImportedSnapshotAdapter — accepts a manually provided JSON snapshot
 * (e.g. pasted or uploaded), validates it, and normalizes it.
 */

import type { IngestionAdapter, IngestionResult, SourceProjectSnapshot, SnapshotAsset, IngestionWarning } from './types';
import { computeMetadata } from './bundled-adapter';

export interface ImportedSnapshotInput {
  json: string | Record<string, unknown>;
  page?: string;
}

export class ImportedSnapshotAdapter implements IngestionAdapter {
  readonly mode = 'imported' as const;

  canIngest(input: unknown): input is ImportedSnapshotInput {
    if (!input || typeof input !== 'object') return false;
    const i = input as any;
    return typeof i.json === 'string' || (typeof i.json === 'object' && i.json !== null);
  }

  async ingest(input: unknown): Promise<IngestionResult> {
    const { json, page = 'index' } = input as ImportedSnapshotInput;
    const warnings: IngestionWarning[] = [];

    let raw: any;
    if (typeof json === 'string') {
      try {
        raw = JSON.parse(json);
      } catch {
        throw new Error('Invalid JSON in imported snapshot');
      }
    } else {
      raw = json;
    }

    // Validate minimum shape
    if (!raw.files || typeof raw.files !== 'object' || Object.keys(raw.files).length === 0) {
      throw new Error('Imported snapshot must contain a non-empty "files" record');
    }

    const files: Record<string, string> = {};
    for (const [path, content] of Object.entries(raw.files)) {
      if (typeof content === 'string') {
        files[path] = content;
      }
    }

    if (Object.keys(files).length === 0) {
      throw new Error('Imported snapshot contains no usable text files');
    }

    const assets: SnapshotAsset[] = Array.isArray(raw.assets)
      ? raw.assets.filter((a: any) => a && typeof a.path === 'string').map((a: any) => ({
          path: a.path,
          fileName: a.fileName || a.path.split('/').pop() || a.path,
          type: a.type || 'other',
          url: a.url,
        }))
      : [];

    const metadata = computeMetadata(files, assets);

    if (!metadata.hasIndexCss) {
      warnings.push({ severity: 'warning', message: 'No index.css found — color/font extraction may be limited' });
    }
    if (!metadata.hasTailwind) {
      warnings.push({ severity: 'warning', message: 'No tailwind.config found — font extraction may be limited' });
    }
    if (!metadata.hasComponents && !metadata.hasPages) {
      warnings.push({ severity: 'warning', message: 'No component or page files found — section extraction will be limited' });
    }

    const snapshot: SourceProjectSnapshot = {
      projectId: raw.projectId || `imported-${Date.now()}`,
      projectName: raw.projectName || 'Imported Project',
      page,
      files,
      assets,
      metadata,
      ingestionMode: 'imported',
    };

    return { snapshot, warnings };
  }
}
