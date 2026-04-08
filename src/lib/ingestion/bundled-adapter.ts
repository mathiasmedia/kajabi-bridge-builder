/**
 * BundledProjectAdapter — wraps the hardcoded fixture bundles so they
 * flow through the new ingestion layer.
 */

import type { IngestionAdapter, IngestionResult, SourceProjectSnapshot, SnapshotAsset, IngestionMetadata, IngestionWarning } from './types';
import { getProjectBundle } from '@/lib/project-bundles';

export interface BundledInput {
  projectId: string;
  page?: string;
}

export class BundledProjectAdapter implements IngestionAdapter {
  readonly mode = 'bundled' as const;

  canIngest(input: unknown): input is BundledInput {
    if (!input || typeof input !== 'object') return false;
    const i = input as any;
    return typeof i.projectId === 'string' && !!getProjectBundle(i.projectId);
  }

  async ingest(input: unknown): Promise<IngestionResult> {
    const { projectId, page = 'index' } = input as BundledInput;
    const bundle = getProjectBundle(projectId);
    if (!bundle) {
      throw new Error(`Bundled project not found: ${projectId}`);
    }

    const files: Record<string, string> = {};
    const warnings: IngestionWarning[] = [];

    // Map bundle.files into flat file record
    if (bundle.files.indexCss) files['src/index.css'] = bundle.files.indexCss;
    if (bundle.files.tailwindConfig) files['tailwind.config.ts'] = bundle.files.tailwindConfig;
    if (bundle.files.appTsx) files['src/App.tsx'] = bundle.files.appTsx;
    if (bundle.files.indexPage) files['src/pages/Index.tsx'] = bundle.files.indexPage;

    for (const [path, content] of Object.entries(bundle.files.components || {})) {
      files[path] = content;
    }
    for (const [path, content] of Object.entries(bundle.files.pages || {})) {
      files[path] = content;
    }

    // Build assets
    const assets: SnapshotAsset[] = (bundle.files.assets || []).map(path => ({
      path,
      fileName: path.split('/').pop() || path,
      type: 'image' as const,
      url: bundle.files.imageUrls?.[path],
    }));

    const metadata = computeMetadata(files, assets);

    const snapshot: SourceProjectSnapshot = {
      projectId: bundle.projectId,
      projectName: bundle.projectName,
      page,
      files,
      assets,
      metadata,
      ingestionMode: 'bundled',
    };

    return { snapshot, warnings };
  }
}

export function computeMetadata(
  files: Record<string, string>,
  assets: SnapshotAsset[],
): IngestionMetadata {
  const paths = Object.keys(files);
  const componentPaths = paths.filter(p => p.includes('/components/') && !p.includes('/ui/'));
  const pagePaths = paths.filter(p => p.includes('/pages/'));

  return {
    framework: 'react',
    hasTailwind: paths.some(p => p.includes('tailwind.config')),
    hasIndexCss: paths.some(p => p.includes('index.css')),
    hasAppFile: paths.some(p => p.includes('App.tsx') || p.includes('App.jsx')),
    hasComponents: componentPaths.length > 0,
    hasPages: pagePaths.length > 0,
    fileCount: paths.length,
    assetCount: assets.length,
    componentCount: componentPaths.length,
    pageCount: pagePaths.length,
  };
}
