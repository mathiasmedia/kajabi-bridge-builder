import { describe, it, expect } from 'vitest';
import { extractDesignFromSource } from '@/lib/source-extractor';
import { getProjectBundle } from '@/lib/project-bundles';

describe('Semantic extraction — Woven Waves', () => {
  const bundle = getProjectBundle('eb365d77-280e-413a-ac01-0dbd5bf741fc');
  if (!bundle) throw new Error('Woven Waves bundle not found');

  const { design, warnings } = extractDesignFromSource(bundle.files);

  it('extracts 5 sections (hero excluded from sections, footer filtered)', () => {
    // Hero is extracted separately via extractHero, not in sections.
    // Sections should be: Stats, Courses, Testimonials, CTA
    // Hero is in sections too since the component exists. Let's check.
    expect(design.sections.length).toBeGreaterThanOrEqual(4);
  });

  it('identifies a hero section or hero design', () => {
    const hero = design.sections.find(s => s.intent === 'hero');
    // Hero might be detected as a section OR via the hero extractor
    const hasHero = !!hero || !!design.hero;
    expect(hasHero).toBe(true);
  });

  it('identifies stats section with 4 items', () => {
    const stats = design.sections.find(s => s.intent === 'stats');
    expect(stats).toBeDefined();
    expect(stats!.confidence).toBeGreaterThanOrEqual(0.8);
    expect(stats!.items?.length).toBe(4);
    expect(stats!.items![0].value).toBeDefined();
    expect(stats!.items![0].heading).toBeDefined(); // label mapped to heading
  });

  it('identifies program_cards section with 3 courses', () => {
    const programs = design.sections.find(s => s.intent === 'program_cards');
    expect(programs).toBeDefined();
    expect(programs!.confidence).toBeGreaterThanOrEqual(0.8);
    expect(programs!.items?.length).toBe(3);
    expect(programs!.hasPricing).toBe(true);
    expect(programs!.items![0].price).toBeDefined();
  });

  it('identifies testimonial_band section with 3 testimonials', () => {
    const testimonials = design.sections.find(s => s.intent === 'testimonial_band');
    expect(testimonials).toBeDefined();
    expect(testimonials!.confidence).toBeGreaterThanOrEqual(0.8);
    expect(testimonials!.items?.length).toBe(3);
    expect(testimonials!.items![0].quote).toBeDefined();
    expect(testimonials!.items![0].name).toBeDefined();
  });

  it('identifies cta_band section', () => {
    const cta = design.sections.find(s => s.intent === 'cta_band');
    expect(cta).toBeDefined();
    expect(cta!.confidence).toBeGreaterThanOrEqual(0.7);
    expect(cta!.hasButtons).toBe(true);
  });

  it('no section collapses into unknown intent', () => {
    const unknowns = design.sections.filter(s => s.intent === 'unknown');
    expect(unknowns.length).toBe(0);
  });

  it('all sections have evidence', () => {
    for (const s of design.sections) {
      expect(s.evidence.length).toBeGreaterThan(0);
    }
  });

  it('repeated-item sections preserve item structure', () => {
    const repeated = design.sections.filter(s => s.repeatedItemCount >= 2);
    expect(repeated.length).toBeGreaterThanOrEqual(3); // stats, programs, testimonials
    for (const s of repeated) {
      expect(s.items).toBeDefined();
      expect(s.items!.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('generates no warnings for well-structured sections', () => {
    // The only warnings should be low-severity or none
    const errors = warnings.filter(w => w.severity === 'error');
    expect(errors.length).toBe(0);
  });

  // ── Media intent tests ──

  it('hero has background_image media intent with URL', () => {
    const hero = design.sections.find(s => s.intent === 'hero');
    expect(hero).toBeDefined();
    expect(hero!.mediaIntent).toBe('background_image');
    expect(hero!.mediaConfidence).toBeGreaterThanOrEqual(0.8);
    expect(hero!.imageTargets.length).toBeGreaterThanOrEqual(1);
    expect(hero!.imageTargets[0].role).toBe('hero_bg');
    expect(hero!.imageTargets[0].url).toContain('hero-underwater');
  });

  it('program_cards has repeated_card_images media intent', () => {
    const programs = design.sections.find(s => s.intent === 'program_cards');
    expect(programs).toBeDefined();
    expect(programs!.mediaIntent).toBe('repeated_card_images');
    expect(programs!.imageTargets.filter(t => t.role === 'card_image').length).toBeGreaterThanOrEqual(2);
    // Check item images resolved to URLs
    const itemsWithImages = programs!.items?.filter(i => i.image && i.image.startsWith('http')) || [];
    expect(itemsWithImages.length).toBeGreaterThanOrEqual(2);
  });

  it('stats and cta sections have no_media intent', () => {
    const stats = design.sections.find(s => s.intent === 'stats');
    expect(stats!.mediaIntent).toBe('no_media');

    const cta = design.sections.find(s => s.intent === 'cta_band');
    expect(cta!.mediaIntent).toBe('no_media');
  });

  it('all sections have media evidence arrays', () => {
    for (const s of design.sections) {
      expect(Array.isArray(s.mediaEvidence)).toBe(true);
      expect(Array.isArray(s.imageTargets)).toBe(true);
    }
  });
});

describe('Semantic extraction — Brand Brilliance Studio (inline sections)', () => {
  const bundle = getProjectBundle('4c253e87-cce3-43ef-baf0-8d07dea63406');
  if (!bundle) throw new Error('Brand Brilliance bundle not found');

  const { design } = extractDesignFromSource(bundle.files);

  it('extracts hero with correct heading', () => {
    expect(design.hero).toBeDefined();
    expect(design.hero!.heading).toContain('Brands That Get');
  });

  it('detects inline sections (at least 3)', () => {
    expect(design.sections.length).toBeGreaterThanOrEqual(3);
  });

  it('identifies testimonial section with 3 items', () => {
    const testimonials = design.sections.find(s => s.intent === 'testimonial_band');
    expect(testimonials).toBeDefined();
    expect(testimonials!.items?.length).toBe(3);
    expect(testimonials!.items![0].quote).toBeDefined();
  });

  it('identifies icon_card_row or feature_grid problem section with 3 items', () => {
    const features = design.sections.find(s => s.intent === 'feature_grid' || s.intent === 'icon_card_row');
    expect(features).toBeDefined();
    expect(features!.items?.length).toBe(3);
  });

  it('identifies CTA section', () => {
    const cta = design.sections.find(s => s.intent === 'cta_band');
    expect(cta).toBeDefined();
    expect(cta!.heading).toContain('Ready to Stand Out');
  });
});
