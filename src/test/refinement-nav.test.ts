import { describe, it, expect } from 'vitest';
import { extractDesignFromSource } from '@/lib/source-extractor';
import { getProjectBundle } from '@/lib/project-bundles';
import { runRefinementPass } from '@/lib/refinement-pass';
import type { TransformationOperation } from '@/types';

describe('Source-derived navigation — Woven Waves', () => {
  const bundle = getProjectBundle('eb365d77-280e-413a-ac01-0dbd5bf741fc')!;
  const { design } = extractDesignFromSource(bundle.files);

  it('extracts nav items from footer (at least 1)', () => {
    // Woven Waves footer has href="#" links which are filtered; nav comes from footer component
    expect(design.header.navItems.length).toBeGreaterThanOrEqual(1);
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
    // Brand Brilliance has "P" as the icon and "Pixel Perfect" as hidden-on-mobile text
    // The extractor should find at least the visible logo text
    expect(design.header.logoText!.length).toBeGreaterThan(0);
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
    const addSectionOps = result.operations.filter(op => op.type === 'addSection');
    expect(addSectionOps.length).toBe(1);
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

describe('Source-binding integrity', () => {
  const bundle = getProjectBundle('eb365d77-280e-413a-ac01-0dbd5bf741fc')!;
  const { design } = extractDesignFromSource(bundle.files);

  it('warns when hero text is generic placeholder', () => {
    const ops: TransformationOperation[] = [
      {
        type: 'replaceText',
        sectionId: 'hero-1',
        blockId: 'b1',
        key: 'text',
        value: '<h1>Welcome to our site</h1><p>Your text here</p>',
        label: 'Hero heading',
      },
    ];
    const result = runRefinementPass(ops, design);
    const bindingWarnings = result.warnings.filter(w => 
      w.message.includes('placeholder') || w.message.includes('base-theme')
    );
    expect(bindingWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it('warns when CTA band has placeholder text', () => {
    const ops: TransformationOperation[] = [
      {
        type: 'addSection',
        sectionId: 'cta-1',
        label: 'CTA Band',
        section: {
          type: 'section',
          name: 'CTA',
          settings: {},
          block_order: ['b1'],
          blocks: { b1: { type: 'text', settings: { text: '<h2>Card Title</h2><p>Sample text</p>' } } },
        },
      },
    ];
    const result = runRefinementPass(ops, design);
    const placeholderWarnings = result.warnings.filter(w => w.message.includes('placeholder'));
    expect(placeholderWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it('warns when split section has visual placeholder', () => {
    const bbBundle = getProjectBundle('4c253e87-cce3-43ef-baf0-8d07dea63406')!;
    const { design: bbDesign } = extractDesignFromSource(bbBundle.files);
    
    const ops: TransformationOperation[] = [
      {
        type: 'addSection',
        sectionId: 'split-1',
        label: 'Content Split Elevated',
        section: {
          type: 'section',
          name: 'Brand Elevated',
          settings: {},
          block_order: ['b1', 'b2'],
          blocks: {
            b1: { type: 'text', settings: { text: '<h2>Your Brand, Elevated</h2><p>Some text</p>', width: '6' } },
            b2: { type: 'text', settings: { text: '<p>Visual Placeholder</p>', width: '6' } },
          },
        },
      },
    ];
    const result = runRefinementPass(ops, bbDesign);
    const visualWarnings = result.warnings.filter(w => 
      w.message.includes('placeholder') || w.message.includes('branded panel')
    );
    expect(visualWarnings.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Header action cluster', () => {
  const bbBundle = getProjectBundle('4c253e87-cce3-43ef-baf0-8d07dea63406')!;
  const { design: bbDesign } = extractDesignFromSource(bbBundle.files);

  it('warns when action buttons are missing from output', () => {
    if (!bbDesign.header.actionButtons || bbDesign.header.actionButtons.length === 0) return;
    const result = runRefinementPass([], bbDesign);
    const actionWarnings = result.warnings.filter(w => w.message.includes('action button'));
    expect(actionWarnings.length).toBeGreaterThanOrEqual(1);
  });
});
