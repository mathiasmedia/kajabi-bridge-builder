import { describe, it, expect } from 'vitest';
import { BundledProjectAdapter, computeMetadata } from '@/lib/ingestion/bundled-adapter';
import { ImportedSnapshotAdapter } from '@/lib/ingestion/imported-adapter';
import { snapshotToSourceFiles, validateSnapshot } from '@/lib/ingestion';
import { extractDesignFromSource } from '@/lib/source-extractor';
import type { SourceProjectSnapshot, SnapshotAsset } from '@/lib/ingestion/types';

describe('Ingestion layer', () => {
  // ── BundledProjectAdapter ──

  describe('BundledProjectAdapter', () => {
    const adapter = new BundledProjectAdapter();

    it('recognizes bundled Woven Waves project', () => {
      expect(adapter.canIngest({ projectId: 'eb365d77-280e-413a-ac01-0dbd5bf741fc' })).toBe(true);
    });

    it('rejects unknown project', () => {
      expect(adapter.canIngest({ projectId: 'nonexistent' })).toBe(false);
    });

    it('produces valid SourceProjectSnapshot', async () => {
      const { snapshot, warnings } = await adapter.ingest({ projectId: 'eb365d77-280e-413a-ac01-0dbd5bf741fc' });

      expect(snapshot.projectId).toBe('eb365d77-280e-413a-ac01-0dbd5bf741fc');
      expect(snapshot.projectName).toBe('Woven Waves Landing');
      expect(snapshot.ingestionMode).toBe('bundled');
      expect(snapshot.page).toBe('index');
      expect(Object.keys(snapshot.files).length).toBeGreaterThan(5);
      expect(snapshot.assets.length).toBe(3);
      expect(snapshot.metadata.hasTailwind).toBe(true);
      expect(snapshot.metadata.hasIndexCss).toBe(true);
      expect(snapshot.metadata.hasComponents).toBe(true);
      expect(snapshot.metadata.hasPages).toBe(true);
      expect(snapshot.metadata.componentCount).toBeGreaterThanOrEqual(5);
    });

    it('passes page through', async () => {
      const { snapshot } = await adapter.ingest({ projectId: 'eb365d77-280e-413a-ac01-0dbd5bf741fc', page: 'about' });
      expect(snapshot.page).toBe('about');
    });
  });

  // ── ImportedSnapshotAdapter ──

  describe('ImportedSnapshotAdapter', () => {
    const adapter = new ImportedSnapshotAdapter();

    it('rejects empty files', async () => {
      await expect(adapter.ingest({ json: { files: {} } })).rejects.toThrow('non-empty');
    });

    it('rejects invalid JSON string', async () => {
      await expect(adapter.ingest({ json: '{broken' })).rejects.toThrow('Invalid JSON');
    });

    it('ingests valid JSON with warnings for missing config', async () => {
      const { snapshot, warnings } = await adapter.ingest({
        json: {
          projectName: 'Test Project',
          files: {
            'src/pages/Index.tsx': '<div>Hello</div>',
            'src/components/Hero.tsx': '<h1>Hero</h1>',
          },
        },
      });

      expect(snapshot.projectName).toBe('Test Project');
      expect(snapshot.ingestionMode).toBe('imported');
      expect(snapshot.metadata.fileCount).toBe(2);
      expect(snapshot.metadata.hasIndexCss).toBe(false);
      expect(warnings.some(w => w.message.includes('index.css'))).toBe(true);
      expect(warnings.some(w => w.message.includes('tailwind'))).toBe(true);
    });

    it('accepts JSON string input', async () => {
      const { snapshot } = await adapter.ingest({
        json: JSON.stringify({
          files: { 'src/index.css': ':root {}' },
        }),
      });
      expect(snapshot.metadata.hasIndexCss).toBe(true);
    });
  });

  // ── snapshotToSourceFiles ──

  describe('snapshotToSourceFiles', () => {
    it('converts bundled snapshot to SourceProjectFiles', async () => {
      const adapter = new BundledProjectAdapter();
      const { snapshot } = await adapter.ingest({ projectId: 'eb365d77-280e-413a-ac01-0dbd5bf741fc' });
      const files = snapshotToSourceFiles(snapshot);

      expect(files.indexCss).toContain('--primary');
      expect(files.tailwindConfig).toContain('Playfair');
      expect(files.indexPage).toContain('HeroSection');
      expect(Object.keys(files.components).length).toBeGreaterThanOrEqual(5);
      expect(Object.keys(files.pages).length).toBeGreaterThanOrEqual(1);
      expect(files.assets.length).toBe(3);
      expect(files.imageUrls?.['src/assets/hero-underwater.jpg']).toContain('supabase');
    });
  });

  // ── validateSnapshot ──

  describe('validateSnapshot', () => {
    it('returns no errors for valid snapshot', async () => {
      const adapter = new BundledProjectAdapter();
      const { snapshot } = await adapter.ingest({ projectId: 'eb365d77-280e-413a-ac01-0dbd5bf741fc' });
      const errors = validateSnapshot(snapshot);
      expect(errors.length).toBe(0);
    });

    it('catches empty files', () => {
      const snapshot: SourceProjectSnapshot = {
        projectId: 'test', projectName: 'Test', page: 'index',
        files: {}, assets: [],
        metadata: { hasTailwind: false, hasIndexCss: false, hasAppFile: false, hasComponents: false, hasPages: false, fileCount: 0, assetCount: 0, componentCount: 0, pageCount: 0 },
        ingestionMode: 'imported',
      };
      const errors = validateSnapshot(snapshot);
      expect(errors.some(e => e.includes('No files'))).toBe(true);
    });

    it('catches missing components and pages', () => {
      const snapshot: SourceProjectSnapshot = {
        projectId: 'test', projectName: 'Test', page: 'index',
        files: { 'src/index.css': ':root {}' }, assets: [],
        metadata: { hasTailwind: false, hasIndexCss: true, hasAppFile: false, hasComponents: false, hasPages: false, fileCount: 1, assetCount: 0, componentCount: 0, pageCount: 0 },
        ingestionMode: 'imported',
      };
      const errors = validateSnapshot(snapshot);
      expect(errors.some(e => e.includes('No component or page'))).toBe(true);
    });
  });

  // ── computeMetadata ──

  describe('computeMetadata', () => {
    it('computes metadata correctly', () => {
      const files: Record<string, string> = {
        'src/index.css': '',
        'tailwind.config.ts': '',
        'src/App.tsx': '',
        'src/components/Hero.tsx': '',
        'src/components/Footer.tsx': '',
        'src/components/ui/Button.tsx': '',
        'src/pages/Index.tsx': '',
      };
      const assets: SnapshotAsset[] = [{ path: 'src/assets/img.jpg', fileName: 'img.jpg', type: 'image' }];
      const meta = computeMetadata(files, assets);

      expect(meta.hasTailwind).toBe(true);
      expect(meta.hasIndexCss).toBe(true);
      expect(meta.hasAppFile).toBe(true);
      expect(meta.hasComponents).toBe(true);
      expect(meta.hasPages).toBe(true);
      expect(meta.componentCount).toBe(2); // excludes ui/
      expect(meta.pageCount).toBe(1);
      expect(meta.assetCount).toBe(1);
      expect(meta.fileCount).toBe(7);
    });
  });

  // ── Extraction from snapshot ──

  describe('Extraction from snapshot', () => {
    it('extracts design from bundled snapshot', async () => {
      const adapter = new BundledProjectAdapter();
      const { snapshot } = await adapter.ingest({ projectId: 'eb365d77-280e-413a-ac01-0dbd5bf741fc' });
      const files = snapshotToSourceFiles(snapshot);
      const { design, warnings } = extractDesignFromSource(files);

      expect(design.sections.length).toBeGreaterThanOrEqual(4);
      expect(design.hero).toBeDefined();
      expect(design.colors.length).toBeGreaterThan(0);
      expect(design.headingFont).toBe('Playfair Display');

      const errors = warnings.filter(w => w.severity === 'error');
      expect(errors.length).toBe(0);
    });

    it('handles missing CSS gracefully', () => {
      const files = snapshotToSourceFiles({
        projectId: 'test', projectName: 'Test', page: 'index',
        files: {
          'src/pages/Index.tsx': '<div>Hello</div>',
          'src/components/Hero.tsx': '<section><h1>Hello</h1></section>',
        },
        assets: [],
        metadata: { hasTailwind: false, hasIndexCss: false, hasAppFile: false, hasComponents: true, hasPages: true, fileCount: 2, assetCount: 0, componentCount: 1, pageCount: 1 },
        ingestionMode: 'imported',
      });

      // Should not throw
      const { design } = extractDesignFromSource(files);
      expect(design.colors).toBeDefined();
    });
  });
});
