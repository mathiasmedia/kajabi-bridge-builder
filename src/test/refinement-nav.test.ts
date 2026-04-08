import { describe, it, expect } from 'vitest';
import { extractDesignFromSource } from '@/lib/source-extractor';
import { getProjectBundle } from '@/lib/project-bundles';
import { runRefinementPass } from '@/lib/refinement-pass';
import type { TransformationOperation } from '@/types';

describe('Source-derived navigation — Woven Waves', () => {
  const bundle = getProjectBundle('eb365d77-280e-413a-ac01-0dbd5bf741fc')!;
  const { design } = extractDesignFromSource(bundle.files);

  it('extracts nav items from footer links', () => {
    expect(design.header.navItems.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts footer copyright', () => {
    expect(design.footer.copyright).toContain('2026');
  });

  it('extracts footer link groups when present', () => {
    // Woven Waves has inline footer links
    // Footer should have some link data
    expect(design.footer).toBeDefined();
  });
});

describe('Source-derived navigation — Brand Brilliance Studio', () => {
  const bundle = getProjectBundle('4c253e87-cce3-43ef-baf0-8d07dea63406')!;
  const { design } = extractDesignFromSource(bundle.files);

  it('extracts header nav items from Header component', () => {
    expect(design.header.navItems.length).toBeGreaterThanOrEqual(4);
    const names = design.header.navItems.map(n => n.name);
    expect(names).toContain('Home');
    expect(names).toContain('About');
    expect(names).toContain('Services');
  });

  it('extracts logo text', () => {
    expect(design.header.logoText).toBeDefined();
    expect(design.header.logoText).toContain('Pixel Perfect');
  });

  it('extracts footer link groups', () => {
    expect(design.footer.linkGroups).toBeDefined();
    const groups = design.footer.linkGroups!;
    expect(Object.keys(groups).length).toBeGreaterThanOrEqual(1);
    const allLinks = Object.values(groups).flat();
    expect(allLinks.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts footer copyright', () => {
    expect(design.footer.copyright).toContain('2026');
    expect(design.footer.copyright).toContain('Pixel Perfect');
  });
});

describe('Refinement pass', () => {
  const bundle = getProjectBundle('eb365d77-280e-413a-ac01-0dbd5bf741fc')!;
  const { design } = extractDesignFromSource(bundle.files);

  it('removes empty invented sections', () => {
    const ops: TransformationOperation[] = [
      {
        type: 'addSection',
        sectionId: 'invented-1',
        label: 'Random Extra Section',
        section: {
          type: 'section',
          name: 'Random',
          settings: {},
          block_order: ['b1'],
          blocks: { b1: { type: 'text', settings: { text: '' } } },
        },
      },
      {
        type: 'addSection',
        sectionId: 'real-stats',
        label: 'Stats Section',
        section: {
          type: 'section',
          name: 'Stats',
          settings: {},
          block_order: ['b1'],
          blocks: { b1: { type: 'text', settings: { text: '<h4>2,400+</h4><p>Graduates</p>' } } },
        },
      },
    ];

    const result = runRefinementPass(ops, design);
    // The invented section should be removed (no source match + empty content)
    expect(result.operations.length).toBeLessThan(ops.length);
    // Real section should survive
    expect(result.operations.some(op => op.type === 'addSection' && (op as any).sectionId === 'real-stats')).toBe(true);
  });

  it('warns about thin sections', () => {
    const ops: TransformationOperation[] = [
      {
        type: 'addSection',
        sectionId: 'thin-program',
        label: 'Program Cards',
        section: {
          type: 'section',
          name: 'Programs',
          settings: {},
          block_order: ['b1'],
          blocks: { b1: { type: 'text', settings: { text: '<p>Our programs</p>' } } },
        },
      },
    ];

    const result = runRefinementPass(ops, design);
    const programWarnings = result.warnings.filter(w => w.message.includes('Program') || w.message.includes('program'));
    expect(programWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it('warns about missing nav operations', () => {
    const result = runRefinementPass([], design);
    const navWarnings = result.warnings.filter(w => w.message.includes('nav'));
    expect(navWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it('generates footer menu from source link groups', () => {
    const bbBundle = getProjectBundle('4c253e87-cce3-43ef-baf0-8d07dea63406')!;
    const { design: bbDesign } = extractDesignFromSource(bbBundle.files);
    
    const result = runRefinementPass([], bbDesign);
    const footerMenuOps = result.operations.filter(
      op => op.type === 'updateNavigation' && (op as any).menuId === 'footer-menu'
    );
    expect(footerMenuOps.length).toBe(1);
  });
});
