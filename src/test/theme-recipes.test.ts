import { describe, it, expect } from 'vitest';
import { applyStreamlinedHomeRecipes, validateStreamlinedHomeOutput } from '@/lib/theme-recipes/streamlined-home';
import type { TransformationOperation, ExtractedSection, ExtractedDesign } from '@/types';

function makeSection(overrides: Partial<ExtractedSection>): ExtractedSection {
  return {
    id: 'test-section',
    type: 'custom',
    intent: 'unknown',
    confidence: 0.8,
    evidence: [],
    repeatedItemCount: 0,
    hasHeading: false,
    hasBody: false,
    hasButtons: false,
    hasImages: false,
    hasStats: false,
    hasTestimonials: false,
    hasPricing: false,
    hasRepeatedCards: false,
    mediaIntent: 'no_media',
    mediaConfidence: 0,
    mediaEvidence: [],
    imageTargets: [],
    ...overrides,
  };
}

function makeAddSectionOp(overrides: Partial<any>): TransformationOperation {
  return {
    type: 'addSection',
    sectionId: 'sec-1',
    label: overrides.label || 'Test section',
    section: {
      type: 'section',
      name: 'Test',
      settings: overrides.sectionSettings || {},
      block_order: overrides.block_order || [],
      blocks: overrides.blocks || {},
    },
  } as TransformationOperation;
}

describe('streamlined-home recipes', () => {
  describe('program card recipe', () => {
    it('sets image_width to 1000 on feature blocks', () => {
      const sections = [makeSection({ intent: 'program_cards', hasRepeatedCards: true, items: [{ heading: 'A' }, { heading: 'B' }] })];
      const ops: TransformationOperation[] = [
        makeAddSectionOp({
          label: 'Program cards section',
          block_order: ['b1', 'b2'],
          blocks: {
            b1: { type: 'feature', settings: { text: '<h4>A</h4>', width: '4', image_width: '50' } },
            b2: { type: 'feature', settings: { text: '<h4>B</h4>', width: '4', image_width: '50' } },
          },
        }),
      ];

      const result = applyStreamlinedHomeRecipes(ops, sections);
      const addOp = result.operations[0] as any;
      expect(addOp.section.blocks.b1.settings.image_width).toBe('1000');
      expect(addOp.section.blocks.b2.settings.image_width).toBe('1000');
    });

    it('forces hide_image to false', () => {
      const sections = [makeSection({ intent: 'program_cards', hasImages: true })];
      const ops: TransformationOperation[] = [
        makeAddSectionOp({
          label: 'Program cards',
          block_order: ['b1'],
          blocks: {
            b1: { type: 'feature', settings: { text: '<h4>A</h4>', width: '4', hide_image: 'true', image_width: '50' } },
          },
        }),
      ];

      const result = applyStreamlinedHomeRecipes(ops, sections);
      const addOp = result.operations[0] as any;
      expect(addOp.section.blocks.b1.settings.hide_image).toBe('false');
      expect(result.warnings.some(w => w.message.includes('hide_image'))).toBe(true);
    });

    it('applies card shell styling (bg, shadow, padding)', () => {
      const sections = [makeSection({ intent: 'program_cards' })];
      const ops: TransformationOperation[] = [
        makeAddSectionOp({
          label: 'Program cards',
          block_order: ['intro', 'b1'],
          blocks: {
            intro: { type: 'text', settings: { text: '<h2>Courses</h2>', width: '12' } },
            b1: { type: 'feature', settings: { text: '<h4>A</h4>', width: '4', image_width: '50' } },
          },
        }),
      ];

      const result = applyStreamlinedHomeRecipes(ops, sections);
      const addOp = result.operations[0] as any;
      // Intro block should not get feature treatment
      expect(addOp.section.blocks.intro.type).toBe('text');
      // Card block should have shell styling
      expect(addOp.section.blocks.b1.settings.background_color).toBe('#FFFFFF');
      expect(addOp.section.blocks.b1.settings.box_shadow).toBe('medium');
      expect(addOp.section.blocks.b1.settings.padding_desktop).toBeDefined();
      // Section should have equal_height
      expect(addOp.section.settings.equal_height).toBe('true');
    });
  });

  describe('CTA band recipe', () => {
    it('merges separate text + CTA blocks into unified text block with use_btn', () => {
      const sections = [makeSection({ intent: 'cta_band', hasButtons: true, ctaText: 'Reserve' })];
      const ops: TransformationOperation[] = [
        makeAddSectionOp({
          label: 'CTA band section',
          block_order: ['t1', 'c1'],
          blocks: {
            t1: { type: 'text', settings: { text: '<h2>Ready?</h2>', width: '8' } },
            c1: { type: 'cta', settings: { btn_text: 'Reserve Your Spot', btn_action: '/contact' } },
          },
        }),
      ];

      const result = applyStreamlinedHomeRecipes(ops, sections);
      const addOp = result.operations[0] as any;
      expect(addOp.section.block_order).not.toContain('c1');
      expect(addOp.section.blocks.c1).toBeUndefined();
      expect(addOp.section.blocks.t1.settings.use_btn).toBe('true');
      expect(addOp.section.blocks.t1.settings.btn_text).toBe('Reserve Your Spot');
      expect(addOp.section.blocks.t1.settings.btn_action).toBe('/contact');
    });

    it('applies inner panel styling (bg, shadow, padding, border-radius)', () => {
      const sections = [makeSection({ intent: 'cta_band', hasButtons: true })];
      const ops: TransformationOperation[] = [
        makeAddSectionOp({
          label: 'CTA band',
          block_order: ['t1'],
          blocks: {
            t1: { type: 'text', settings: { text: '<h2>Ready?</h2>', width: '12', use_btn: 'true' } },
          },
        }),
      ];

      const result = applyStreamlinedHomeRecipes(ops, sections);
      const addOp = result.operations[0] as any;
      expect(addOp.section.blocks.t1.settings.background_color).toBe('#FFFFFF');
      expect(addOp.section.blocks.t1.settings.box_shadow).toBe('large');
      expect(addOp.section.blocks.t1.settings.border_radius).toBe('16');
      expect(addOp.section.blocks.t1.settings.padding_desktop).toBeDefined();
      expect(addOp.section.blocks.t1.settings.width).toBe('7');
    });
  });

  describe('testimonial recipe', () => {
    it('applies card shell to testimonial blocks', () => {
      const sections = [makeSection({ intent: 'testimonial_band', hasTestimonials: true })];
      const ops: TransformationOperation[] = [
        makeAddSectionOp({
          label: 'Testimonial section',
          block_order: ['intro', 't1', 't2'],
          blocks: {
            intro: { type: 'text', settings: { text: '<h2>Reviews</h2>', width: '12' } },
            t1: { type: 'text', settings: { text: '<p>"Great!"</p><h4>Alice</h4>', width: '4' } },
            t2: { type: 'text', settings: { text: '<p>"Amazing!"</p><h4>Bob</h4>', width: '4' } },
          },
        }),
      ];

      const result = applyStreamlinedHomeRecipes(ops, sections);
      const addOp = result.operations[0] as any;
      // Content blocks should have card shell
      expect(addOp.section.blocks.t1.settings.background_color).toBe('#FFFFFF');
      expect(addOp.section.blocks.t1.settings.box_shadow).toBe('medium');
      expect(addOp.section.blocks.t2.settings.padding_desktop).toBeDefined();
      // Equal height
      expect(addOp.section.settings.equal_height).toBe('true');
      // Intro block should also get card treatment since it's not excluded
      // (it's width 12 so it's skipped by the recipe)
    });
  });

  describe('own-row recipe', () => {
    it('sets width 12 on single-block sections', () => {
      const sections = [makeSection({ intent: 'heading_divider' })];
      const ops: TransformationOperation[] = [
        makeAddSectionOp({
          label: 'Heading divider',
          block_order: ['b1'],
          blocks: {
            b1: { type: 'text', settings: { text: '<h2>Title</h2>' } },
          },
        }),
      ];

      const result = applyStreamlinedHomeRecipes(ops, sections);
      const addOp = result.operations[0] as any;
      expect(addOp.section.blocks.b1.settings.width).toBe('12');
    });
  });

  describe('validation warnings', () => {
    it('warns about small image_width on program cards', () => {
      const sections = [makeSection({ intent: 'program_cards', hasImages: true })];
      const ops: TransformationOperation[] = [
        makeAddSectionOp({
          label: 'Program cards',
          block_order: ['b1'],
          blocks: {
            b1: { type: 'feature', settings: { text: '<h4>A</h4>', width: '4', image_width: '50' } },
          },
        }),
      ];

      const warnings = validateStreamlinedHomeOutput(ops, sections);
      expect(warnings.some(w => w.message.includes('image_width=50'))).toBe(true);
    });

    it('warns about split text + CTA blocks on CTA band', () => {
      const sections = [makeSection({ intent: 'cta_band' })];
      const ops: TransformationOperation[] = [
        makeAddSectionOp({
          label: 'CTA band',
          block_order: ['t1', 'c1'],
          blocks: {
            t1: { type: 'text', settings: { text: '<h2>Ready?</h2>', width: '8' } },
            c1: { type: 'cta', settings: { btn_text: 'Go' } },
          },
        }),
      ];

      const warnings = validateStreamlinedHomeOutput(ops, sections);
      expect(warnings.some(w => w.message.includes('split text + CTA'))).toBe(true);
    });

    it('warns about missing card shell on testimonials', () => {
      const sections = [makeSection({ intent: 'testimonial_band' })];
      const ops: TransformationOperation[] = [
        makeAddSectionOp({
          label: 'Testimonial section',
          block_order: ['t1'],
          blocks: {
            t1: { type: 'text', settings: { text: '<p>Quote</p>', width: '4' } },
          },
        }),
      ];

      const warnings = validateStreamlinedHomeOutput(ops, sections);
      expect(warnings.some(w => w.message.includes('bare text'))).toBe(true);
    });

    it('warns about missing CTA panel styling', () => {
      const sections = [makeSection({ intent: 'cta_band' })];
      const ops: TransformationOperation[] = [
        makeAddSectionOp({
          label: 'CTA band',
          block_order: ['t1'],
          blocks: {
            t1: { type: 'text', settings: { text: '<h2>Go</h2>', width: '8', use_btn: 'true' } },
          },
        }),
      ];

      const warnings = validateStreamlinedHomeOutput(ops, sections);
      expect(warnings.some(w => w.message.includes('inner panel'))).toBe(true);
    });
  });
});
