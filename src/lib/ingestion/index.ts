/**
 * Ingestion barrel — re-exports types, adapters, and the snapshot-to-
 * SourceProjectFiles converter used by the extraction pipeline.
 */

export type {
  SourceProjectSnapshot,
  SnapshotAsset,
  IngestionMetadata,
  IngestionMode,
  IngestionResult,
  IngestionWarning,
  IngestionAdapter,
} from './types';

export { BundledProjectAdapter } from './bundled-adapter';
export { ImportedSnapshotAdapter } from './imported-adapter';
export { CrossProjectAdapter } from './cross-project-adapter';

import type { SourceProjectSnapshot } from './types';
import type { SourceProjectFiles } from '@/lib/source-extractor';

/**
 * Convert a SourceProjectSnapshot into the SourceProjectFiles shape
 * consumed by the existing extraction pipeline.
 */
export function snapshotToSourceFiles(snapshot: SourceProjectSnapshot): SourceProjectFiles {
  const files = snapshot.files;

  // Find key files
  const indexCss = files['src/index.css'] || '';
  const tailwindConfig = files['tailwind.config.ts'] || files['tailwind.config.js'] || '';
  const appTsx = files['src/App.tsx'] || files['src/App.jsx'] || '';

  // Separate components and pages
  const components: Record<string, string> = {};
  const pages: Record<string, string> = {};
  let indexPage = '';

  for (const [path, content] of Object.entries(files)) {
    if (path.startsWith('src/components/') && !path.includes('/ui/')) {
      components[path] = content;
    }
    if (path.startsWith('src/pages/')) {
      pages[path] = content;
      if (path.toLowerCase().includes('index')) {
        indexPage = content;
      }
    }
  }

  // Build imageUrls from assets
  const imageUrls: Record<string, string> = {};
  for (const asset of snapshot.assets) {
    if (asset.url) {
      imageUrls[asset.path] = asset.url;
    }
  }

  return {
    indexCss,
    tailwindConfig,
    indexPage,
    appTsx,
    components,
    assets: snapshot.assets.map(a => a.path),
    imageUrls,
    pages,
  };
}

/**
 * Validate a snapshot and return errors if it's unusable.
 */
export function validateSnapshot(snapshot: SourceProjectSnapshot): string[] {
  const errors: string[] = [];

  if (!snapshot.projectId) errors.push('Missing projectId');
  if (!snapshot.projectName) errors.push('Missing projectName');
  if (Object.keys(snapshot.files).length === 0) errors.push('No files in snapshot');
  if (!snapshot.metadata.hasComponents && !snapshot.metadata.hasPages) {
    errors.push('No component or page files found — extraction will fail');
  }

  // Check selected page exists
  const pagePath = `src/pages/${capitalize(snapshot.page)}.tsx`;
  const hasPage = Object.keys(snapshot.files).some(p =>
    p.toLowerCase().includes(`/${snapshot.page.toLowerCase()}.tsx`) ||
    p.toLowerCase().includes(`/${snapshot.page.toLowerCase()}.jsx`)
  );
  if (!hasPage && snapshot.page !== 'index') {
    errors.push(`Selected page "${snapshot.page}" not found in project files`);
  }

  return errors;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
