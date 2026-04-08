import { describe, it, expect } from 'vitest';
import { buildExpectedRenderModel } from '@/lib/render-check-expectations';
import { runStructuralComparison } from '@/lib/render-check-compare';
import type { ExtractedDesign } from '@/types';
import type { RenderDiagnostics } from '@/lib/renderer-integration';

const baseDiagnostics: RenderDiagnostics = {
  renderedSectionIds: [],
  missingSectionIds: [],
  warnings: [],
  renderTimeMs: 10,
};

function makeDesign(overrides: Partial<ExtractedDesign> = {}): ExtractedDesign {
  return {
    colors: [],
    headingFont: 'Inter',
    bodyFont: 'Inter',
    buttonStyle: { backgroundColor: '#000', textColor: '#fff', borderRadius: '8px', style: 'solid' },
    header: { backgroundColor: '#fff', textColor: '#000', navItems: [], sticky: false },
    hero: { heading: 'Transform Your Business', subheading: 'Start today', ctaText: 'Get Started', eyebrow: 'NEW LAUNCH' },
    sections: [],
    footer: { backgroundColor: '#000', textColor: '#fff', columns: 3 },
    assets: [],
    ...overrides,
  };
}

describe('ExpectedRenderModel', () => {
  it('builds hero expectations with badge and CTA count', () => {
    const design = makeDesign({
      hero: {
        heading: 'Build Something Great',
        eyebrow: 'BETA',
        ctaText: 'Start Now',
        secondaryCtaText: 'Learn More',
        secondaryCtaUrl: '/learn',
      },
    });
    const model = buildExpectedRenderModel(design);
    expect(model.hero?.hasBadge).toBe(true);
    expect(model.hero?.ctaCount).toBe(2);
  });

  it('detects testimonial expectations', () => {
    const design = makeDesign({
      sections: [{
        id: 's1', type: 'testimonials', intent: 'testimonial_band', confidence: 0.9,
        evidence: [], repeatedItemCount: 3, hasHeading: true, hasBody: false,
        hasButtons: false, hasImages: false, hasStats: false, hasTestimonials: true,
        hasPricing: false, hasRepeatedCards: true, mediaIntent: 'no_media',
        mediaConfidence: 0.9, mediaEvidence: [], imageTargets: [],
        heading: 'What People Say',
        items: [
          { quote: 'Amazing service', name: 'Alice' },
          { quote: 'Life changing', name: 'Bob' },
          { quote: 'Highly recommend', name: 'Carol' },
        ],
      }],
    });
    const model = buildExpectedRenderModel(design);
    expect(model.testimonials.present).toBe(true);
    expect(model.testimonials.count).toBe(3);
  });

  it('detects program card expectations', () => {
    const design = makeDesign({
      sections: [{
        id: 's2', type: 'features', intent: 'program_cards', confidence: 0.9,
        evidence: [], repeatedItemCount: 4, hasHeading: true, hasBody: false,
        hasButtons: false, hasImages: true, hasStats: false, hasTestimonials: false,
        hasPricing: false, hasRepeatedCards: true, mediaIntent: 'repeated_card_images',
        mediaConfidence: 0.9, mediaEvidence: [], imageTargets: [],
        backgroundColor: '#1a1a1a',
        heading: 'Our Programs',
        items: [
          { heading: 'Program A' }, { heading: 'Program B' },
          { heading: 'Program C' }, { heading: 'Program D' },
        ],
      }],
    });
    const model = buildExpectedRenderModel(design);
    expect(model.programs.present).toBe(true);
    expect(model.programs.count).toBe(4);
    expect(model.programs.cardStyleIntent).toBe('dark');
  });
});

describe('Structural Comparison Upgrades', () => {
  it('detects missing testimonial section as critical', () => {
    const design = makeDesign({
      sections: [{
        id: 's1', type: 'testimonials', intent: 'testimonial_band', confidence: 0.9,
        evidence: [], repeatedItemCount: 2, hasHeading: true, hasBody: false,
        hasButtons: false, hasImages: false, hasStats: false, hasTestimonials: true,
        hasPricing: false, hasRepeatedCards: true, mediaIntent: 'no_media',
        mediaConfidence: 0.9, mediaEvidence: [], imageTargets: [],
        heading: 'Testimonials From Clients',
        items: [
          { quote: 'Wonderful experience', name: 'Alice' },
          { quote: 'Truly outstanding', name: 'Bob' },
        ],
      }],
    });
    // Rendered HTML has no testimonial content
    const html = '<div><h1>Transform Your Business</h1><p>Start today</p><button>Get Started</button></div>';
    const result = runStructuralComparison(html, design, baseDiagnostics);
    const testimonialMismatches = result.mismatches.filter(m => m.category === 'testimonial');
    expect(testimonialMismatches.length).toBeGreaterThan(0);
    expect(testimonialMismatches.some(m => m.critical)).toBe(true);
  });

  it('detects missing hero eyebrow as critical', () => {
    const design = makeDesign({
      hero: { heading: 'Transform Your Business', eyebrow: 'EXCLUSIVE OFFER', ctaText: 'Get Started' },
    });
    const html = '<div><h1>Transform Your Business</h1><button>Get Started</button></div>';
    const result = runStructuralComparison(html, design, baseDiagnostics);
    const eyebrowMismatch = result.mismatches.find(m => m.message.includes('badge') || m.message.includes('eyebrow'));
    expect(eyebrowMismatch).toBeDefined();
    expect(eyebrowMismatch?.critical).toBe(true);
  });

  it('detects placeholder visual as critical', () => {
    const design = makeDesign({
      sections: [{
        id: 's3', type: 'content', intent: 'content_media_split', confidence: 0.9,
        evidence: [], repeatedItemCount: 0, hasHeading: true, hasBody: true,
        hasButtons: false, hasImages: true, hasStats: false, hasTestimonials: false,
        hasPricing: false, hasRepeatedCards: false, mediaIntent: 'foreground_image',
        mediaConfidence: 0.9, mediaEvidence: [], imageTargets: [],
        heading: 'Our Approach',
        image: '/branded-image.jpg',
      }],
    });
    const html = '<div><h1>Transform Your Business</h1><section><h2>Our Approach</h2><img src="placeholder.svg" /></section></div>';
    const result = runStructuralComparison(html, design, baseDiagnostics);
    const placeholderMismatches = result.mismatches.filter(m => m.message.toLowerCase().includes('placeholder'));
    expect(placeholderMismatches.length).toBeGreaterThan(0);
    expect(placeholderMismatches.some(m => m.critical)).toBe(true);
  });

  it('detects missing secondary CTA as critical', () => {
    const design = makeDesign({
      hero: {
        heading: 'Transform Your Business',
        ctaText: 'Get Started',
        secondaryCtaText: 'Learn More',
        secondaryCtaUrl: '/learn',
      },
    });
    const html = '<div><h1>Transform Your Business</h1><button>Get Started</button></div>';
    const result = runStructuralComparison(html, design, baseDiagnostics);
    const secondaryCta = result.mismatches.find(m => m.message.includes('secondary CTA'));
    expect(secondaryCta).toBeDefined();
    expect(secondaryCta?.critical).toBe(true);
  });

  it('passes comparison with expected model attached', () => {
    const design = makeDesign();
    const html = '<div><h1>Transform Your Business</h1><p>Start today</p><button>Get Started</button><span>NEW LAUNCH</span></div>';
    const result = runStructuralComparison(html, design, baseDiagnostics);
    expect(result.expected).toBeDefined();
    expect(result.expected?.hero?.hasBadge).toBe(true);
  });
});
