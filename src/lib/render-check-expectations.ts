/**
 * Source-Derived Expected Render Model
 *
 * Builds a normalized expectation model from ExtractedDesign so the
 * render-check comparison can verify higher-fidelity structural expectations.
 */

import type { ExtractedDesign } from '@/types';
import { inferColorIntent, type ColorIntent } from '@/lib/refinement-guardrails';

// ── Expected Model ────────────────────────────────────────────────────────

export interface ExpectedHero {
  hasHeading: boolean;
  hasBadge: boolean;       // eyebrow / pre-heading
  hasSubheading: boolean;
  ctaCount: number;        // 0, 1, or 2
  hasEmphasis: boolean;    // emphasisWord present
  hasBackgroundImage: boolean;
}

export interface ExpectedPrograms {
  present: boolean;
  count: number;
  cardStyleIntent: ColorIntent;
  hasImages: boolean;
}

export interface ExpectedTestimonials {
  present: boolean;
  count: number;
  cardStyleIntent: ColorIntent;
}

export interface ExpectedSplitSection {
  present: boolean;
  hasVisualSide: boolean;
  visualType: 'branded_panel' | 'image' | 'unknown';
  hasChecklist: boolean;
}

export interface ExpectedCtaBand {
  present: boolean;
  colorIntent: ColorIntent;
  ctaCount: number;
}

export interface ExpectedFooter {
  hasDescription: boolean;
  hasSocial: boolean;
  linkGroupCount: number;
  hasLegal: boolean;
  columnCount: number;
}

export interface ExpectedHeader {
  hasLogoMark: boolean;
  hasActionButtons: boolean;
  navItemCount: number;
}

export interface ExpectedRenderModel {
  hero: ExpectedHero | null;
  programs: ExpectedPrograms;
  testimonials: ExpectedTestimonials;
  splitSections: ExpectedSplitSection[];
  ctaBands: ExpectedCtaBand[];
  footer: ExpectedFooter;
  header: ExpectedHeader;
  /** Total expected CTA count across all sections */
  totalCtaCount: number;
}

// ── Builder ───────────────────────────────────────────────────────────────

export function buildExpectedRenderModel(design: ExtractedDesign): ExpectedRenderModel {
  let totalCtaCount = 0;

  // Hero
  let hero: ExpectedHero | null = null;
  if (design.hero) {
    const ctaCount = (design.hero.ctaText ? 1 : 0) + (design.hero.secondaryCtaText ? 1 : 0);
    totalCtaCount += ctaCount;
    hero = {
      hasHeading: !!design.hero.heading,
      hasBadge: !!design.hero.eyebrow,
      hasSubheading: !!design.hero.subheading,
      ctaCount,
      hasEmphasis: !!design.hero.emphasisWord,
      hasBackgroundImage: !!design.hero.backgroundImage,
    };
  }

  // Programs
  const programSections = design.sections.filter(s => s.intent === 'program_cards');
  const programs: ExpectedPrograms = {
    present: programSections.length > 0,
    count: programSections.reduce((n, s) => n + (s.items?.length || s.repeatedItemCount || 0), 0),
    cardStyleIntent: programSections.length > 0 ? inferColorIntent(programSections[0]) : 'unknown',
    hasImages: programSections.some(s => s.hasImages),
  };

  // Testimonials
  const testimonialSections = design.sections.filter(s => s.intent === 'testimonial_band');
  const testimonials: ExpectedTestimonials = {
    present: testimonialSections.length > 0,
    count: testimonialSections.reduce((n, s) => n + (s.items?.length || s.repeatedItemCount || 0), 0),
    cardStyleIntent: testimonialSections.length > 0 ? inferColorIntent(testimonialSections[0]) : 'unknown',
  };

  // Split sections
  const splitSections = design.sections
    .filter(s => s.intent === 'content_media_split')
    .map(s => ({
      present: true,
      hasVisualSide: !!(s.image || s.backgroundImage),
      visualType: (s.image || s.backgroundImage ? 'branded_panel' : 'unknown') as 'branded_panel' | 'image' | 'unknown',
      hasChecklist: !!s.hasChecklist,
    }));

  // CTA bands
  const ctaBands = design.sections
    .filter(s => s.intent === 'cta_band' || s.type === 'cta')
    .map(s => {
      const ctaCount = (s.ctaText ? 1 : 0) + (s.secondaryCtaText ? 1 : 0);
      totalCtaCount += ctaCount;
      return {
        present: true,
        colorIntent: inferColorIntent(s),
        ctaCount,
      };
    });

  // Count CTAs from other sections
  for (const s of design.sections) {
    if (s.intent === 'cta_band' || s.type === 'cta' || s.intent === 'hero') continue;
    if (s.ctaText) totalCtaCount++;
    if (s.secondaryCtaText) totalCtaCount++;
  }

  // Footer
  const linkGroups = design.footer?.linkGroups || {};
  const footer: ExpectedFooter = {
    hasDescription: !!design.footer?.description,
    hasSocial: (design.footer?.socialLinks?.length || 0) > 0,
    linkGroupCount: Object.keys(linkGroups).length,
    hasLegal: !!design.footer?.copyright,
    columnCount: design.footer?.columns || 0,
  };

  // Header
  const header: ExpectedHeader = {
    hasLogoMark: !!(design.header?.logoImage || design.header?.logoText),
    hasActionButtons: (design.header?.actionButtons?.length || 0) > 0,
    navItemCount: design.header?.navItems?.length || 0,
  };

  return {
    hero,
    programs,
    testimonials,
    splitSections,
    ctaBands,
    footer,
    header,
    totalCtaCount,
  };
}
