/**
 * CrossProjectAdapter — scaffold for true Lovable workspace cross-project
 * ingestion. Currently a placeholder that documents the intended API surface.
 *
 * When cross-project tools are available at runtime, this adapter will:
 * 1. list_project_dir to discover src/ structure
 * 2. read key files (index.css, tailwind.config, App.tsx, pages, components)
 * 3. list_project_assets for images/fonts
 * 4. Build a SourceProjectSnapshot from the live project
 */

import type { IngestionAdapter, IngestionResult, IngestionWarning, SourceProjectSnapshot, SnapshotAsset } from './types';
import { computeMetadata } from './bundled-adapter';

export interface CrossProjectInput {
  projectId: string;
  projectName: string;
  page?: string;
  /** Injected file reader — will be wired to cross_project--read_project_file */
  readFile?: (path: string) => Promise<string | null>;
  /** Injected dir lister — will be wired to cross_project--list_project_dir */
  listDir?: (path: string) => Promise<string[]>;
  /** Injected asset lister */
  listAssets?: () => Promise<SnapshotAsset[]>;
}

export class CrossProjectAdapter implements IngestionAdapter {
  readonly mode = 'cross-project' as const;

  canIngest(input: unknown): input is CrossProjectInput {
    if (!input || typeof input !== 'object') return false;
    const i = input as any;
    return typeof i.projectId === 'string' && typeof i.readFile === 'function';
  }

  async ingest(input: unknown): Promise<IngestionResult> {
    const { projectId, projectName, page = 'index', readFile, listDir, listAssets } = input as CrossProjectInput;
    const warnings: IngestionWarning[] = [];
    const files: Record<string, string> = {};

    if (!readFile) {
      throw new Error('CrossProjectAdapter requires a readFile function');
    }

    // Read key files
    const keyFiles = [
      'src/index.css',
      'tailwind.config.ts',
      'tailwind.config.js',
      'src/App.tsx',
      'src/App.jsx',
    ];

    for (const path of keyFiles) {
      const content = await readFile(path);
      if (content) files[path] = content;
    }

    // Discover and read pages
    if (listDir) {
      try {
        const pageFiles = await listDir('src/pages');
        for (const f of pageFiles) {
          if (f.endsWith('.tsx') || f.endsWith('.jsx')) {
            const path = `src/pages/${f}`;
            const content = await readFile(path);
            if (content) files[path] = content;
          }
        }
      } catch {
        warnings.push({ severity: 'warning', message: 'Could not list src/pages directory' });
      }

      // Discover and read components
      try {
        const componentFiles = await listDir('src/components');
        for (const f of componentFiles) {
          if ((f.endsWith('.tsx') || f.endsWith('.jsx')) && !f.startsWith('ui/')) {
            const path = `src/components/${f}`;
            const content = await readFile(path);
            if (content) files[path] = content;
          }
        }
      } catch {
        warnings.push({ severity: 'warning', message: 'Could not list src/components directory' });
      }
    }

    // Discover assets
    let assets: SnapshotAsset[] = [];
    if (listAssets) {
      try {
        assets = await listAssets();
      } catch {
        warnings.push({ severity: 'warning', message: 'Could not list project assets' });
      }
    }

    if (Object.keys(files).length === 0) {
      throw new Error(`No files could be read from project "${projectName}"`);
    }

    const metadata = computeMetadata(files, assets);

    const snapshot: SourceProjectSnapshot = {
      projectId,
      projectName: projectName || projectId,
      page,
      files,
      assets,
      metadata,
      ingestionMode: 'cross-project',
    };

    return { snapshot, warnings };
  }
}
