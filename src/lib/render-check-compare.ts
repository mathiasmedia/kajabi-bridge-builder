/**
 * Structural Comparison: Rendered HTML vs Source Design
 *
 * Compares the rendered Kajabi output against the ExtractedDesign
 * to detect missing sections, CTAs, content degradation, and
 * style-intent violations using the source-derived expectation model.
 */

import type { ExtractedDesign } from '@/types';
import type { RenderDiagnostics } from '@/lib/renderer-integration';
import { buildExpectedRenderModel, type ExpectedRenderModel } from '@/lib/render-check-expectations';

export interface ComparisonMismatch {
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  /** Whether this mismatch should trigger automatic rollback if introduced by a refinement */
  critical?: boolean;
}

export interface ComparisonResult {
  pass: boolean;
  score: number; // 0-100
  mismatches: ComparisonMismatch[];
  summary: string;
  /** Source-derived expectation model used for comparison */
  expected?: ExpectedRenderModel;
}

// ── Placeholder / default text patterns ──────────────────────────────────

const DEFAULT_PATTERNS = [
  'lorem ipsum', 'dolor sit amet', 'card title', 'your heading here',
  'click here to edit', 'sample text', 'placeholder text', 'add your text',
  'edit this text',
];

const PLACEHOLDER_VISUAL_PATTERNS = [
  'visual placeholder', 'placeholder image', 'image placeholder',
  'placeholder.svg', 'placeholder.png', 'placeholder.jpg',
  'via.placeholder.com', 'placehold.co', 'placekitten',
];

// ── Main entry ───────────────────────────────────────────────────────────

export function runStructuralComparison(
  renderedHtml: string,
  extractedDesign: ExtractedDesign,
  diagnostics: RenderDiagnostics,
): ComparisonResult {
  const mismatches: ComparisonMismatch[] = [];
  const htmlLower = renderedHtml.toLowerCase();
  const textContent = renderedHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  const expected = buildExpectedRenderModel(extractedDesign);

  // 1. Hero checks (expanded)
  checkHero(extractedDesign, expected, htmlLower, textContent, mismatches);

  // 2. CTA checks
  checkCTAs(extractedDesign, htmlLower, textContent, mismatches);

  // 3. Section presence + fidelity
  checkSections(extractedDesign, expected, htmlLower, textContent, mismatches);

  // 4. Testimonial presence
  checkTestimonials(extractedDesign, expected, htmlLower, textContent, mismatches);

  // 5. Program card checks
  checkProgramCards(extractedDesign, expected, htmlLower, textContent, mismatches);

  // 6. Split section visual side
  checkSplitSections(extractedDesign, expected, htmlLower, textContent, mismatches);

  // 7. CTA band style intent
  checkCtaBands(extractedDesign, expected, htmlLower, textContent, mismatches);

  // 8. Navigation + header
  checkNavigation(extractedDesign, expected, htmlLower, textContent, mismatches);

  // 9. Footer richness
  checkFooter(extractedDesign, expected, htmlLower, textContent, mismatches);

  // 10. Placeholder / default text
  checkDefaultText(htmlLower, textContent, mismatches);

  // 11. Placeholder visuals
  checkPlaceholderVisuals(htmlLower, mismatches);

  // 12. Diagnostics-derived warnings
  for (const w of diagnostics.warnings) {
    mismatches.push({ severity: 'warning', category: 'render', message: w });
  }

  // Calculate score — critical mismatches weigh more
  const criticalCount = mismatches.filter(m => m.critical).length;
  const errorCount = mismatches.filter(m => m.severity === 'error' && !m.critical).length;
  const warningCount = mismatches.filter(m => m.severity === 'warning').length;
  const score = Math.max(0, 100 - criticalCount * 20 - errorCount * 15 - warningCount * 5);
  const pass = criticalCount === 0 && errorCount === 0 && score >= 50;

  const summary = pass
    ? `Render check passed (${score}/100). ${mismatches.length} note(s).`
    : `Render check has issues (${score}/100). ${criticalCount} critical, ${errorCount} error(s), ${warningCount} warning(s).`;

  return { pass, score, mismatches, summary, expected };
}

// ── Hero ──────────────────────────────────────────────────────────────────

function checkHero(
  design: ExtractedDesign,
  expected: ExpectedRenderModel,
  html: string,
  text: string,
  mismatches: ComparisonMismatch[],
) {
  if (!design.hero || !expected.hero) return;

  // Hero heading
  const heroWords = design.hero.heading.split(/\s+/).filter(w => w.length > 3);
  const headingFound = heroWords.length > 0 && heroWords.some(w => text.includes(w.toLowerCase()));
  if (!headingFound) {
    mismatches.push({
      severity: 'error', category: 'hero', critical: true,
      message: `Source hero heading "${design.hero.heading}" not found in rendered output`,
    });
  }

  // Eyebrow / badge
  if (expected.hero.hasBadge && design.hero.eyebrow) {
    const eyebrowWords = design.hero.eyebrow.split(/\s+/).filter(w => w.length > 3);
    const eyebrowFound = eyebrowWords.length > 0 && eyebrowWords.some(w => text.includes(w.toLowerCase()));
    if (!eyebrowFound) {
      mismatches.push({
        severity: 'warning', category: 'hero', critical: true,
        message: `Hero badge/eyebrow "${design.hero.eyebrow}" not found — source strongly has one`,
      });
    }
  }

  // Subheading
  if (expected.hero.hasSubheading && design.hero.subheading) {
    const subWords = design.hero.subheading.split(/\s+/).filter(w => w.length > 4);
    const subFound = subWords.length > 0 && subWords.some(w => text.includes(w.toLowerCase()));
    if (!subFound) {
      mismatches.push({
        severity: 'warning', category: 'hero',
        message: `Source hero subheading not reflected in rendered output`,
      });
    }
  }

  // Primary CTA
  if (design.hero.ctaText && !text.includes(design.hero.ctaText.toLowerCase())) {
    mismatches.push({
      severity: 'warning', category: 'hero',
      message: `Hero primary CTA "${design.hero.ctaText}" not found in rendered output`,
    });
  }

  // Secondary CTA
  if (design.hero.secondaryCtaText && !text.includes(design.hero.secondaryCtaText.toLowerCase())) {
    mismatches.push({
      severity: 'warning', category: 'hero', critical: true,
      message: `Hero secondary CTA "${design.hero.secondaryCtaText}" missing — source had dual CTAs`,
    });
  }

  // Multiple actionable links check
  if (expected.hero.ctaCount >= 2) {
    // Count <a> and <button> tags in hero-related HTML
    const actionableCount = countActionableElements(html, 'hero');
    if (actionableCount < 2) {
      mismatches.push({
        severity: 'warning', category: 'hero',
        message: `Source hero has ${expected.hero.ctaCount} CTAs but only ${actionableCount} actionable element(s) rendered`,
      });
    }
  }
}

// ── CTAs ──────────────────────────────────────────────────────────────────

function checkCTAs(
  design: ExtractedDesign,
  html: string,
  text: string,
  mismatches: ComparisonMismatch[],
) {
  const ctaSections = design.sections.filter(s => s.intent === 'cta_band' || s.type === 'cta');
  for (const section of ctaSections) {
    if (section.ctaText && !text.includes(section.ctaText.toLowerCase())) {
      mismatches.push({
        severity: 'warning', category: 'cta',
        message: `CTA section "${section.heading || 'CTA band'}" primary action "${section.ctaText}" not in rendered output`,
      });
    }
    if (section.secondaryCtaText && !text.includes(section.secondaryCtaText.toLowerCase())) {
      mismatches.push({
        severity: 'info', category: 'cta',
        message: `CTA section secondary action "${section.secondaryCtaText}" not in rendered output — source had dual CTAs`,
      });
    }
  }
}

// ── Generic section presence ─────────────────────────────────────────────

function checkSections(
  design: ExtractedDesign,
  expected: ExpectedRenderModel,
  html: string,
  text: string,
  mismatches: ComparisonMismatch[],
) {
  for (const section of design.sections) {
    // Skip intents checked by dedicated checkers
    if (section.intent === 'hero' || section.intent === 'testimonial_band' ||
        section.intent === 'program_cards' || section.intent === 'content_media_split' ||
        section.intent === 'cta_band') continue;

    if (section.heading) {
      const headingWords = section.heading.split(/\s+/).filter(w => w.length > 3);
      const found = headingWords.length > 0 && headingWords.some(w => text.includes(w.toLowerCase()));
      if (!found) {
        mismatches.push({
          severity: 'warning', category: 'section',
          message: `Source section "${section.heading}" (${section.intent}) heading not found in rendered output`,
        });
      }
    }

    // Repeated items collapsed
    if (section.hasRepeatedCards && section.repeatedItemCount >= 3) {
      const itemCount = section.items?.length || section.repeatedItemCount;
      const foundItems = (section.items || []).filter(item => {
        if (!item.heading) return false;
        const words = item.heading.split(/\s+/).filter(w => w.length > 3);
        return words.some(w => text.includes(w.toLowerCase()));
      });
      if (foundItems.length < Math.floor(itemCount / 2)) {
        mismatches.push({
          severity: 'warning', category: 'section',
          message: `Source "${section.heading || section.intent}" had ${itemCount} repeated items but only ${foundItems.length} appear in rendered output`,
        });
      }
    }

    // Icon card row flattened
    if (section.intent === 'icon_card_row' && section.hasIcons) {
      const hasFeatureBlocks = html.includes('class="feature') || html.includes('class="card');
      if (!hasFeatureBlocks) {
        mismatches.push({
          severity: 'warning', category: 'section',
          message: `Icon card section "${section.heading || 'icon cards'}" may have been flattened — no card/feature blocks found`,
        });
      }
    }
  }
}

// ── Testimonials ─────────────────────────────────────────────────────────

function checkTestimonials(
  design: ExtractedDesign,
  expected: ExpectedRenderModel,
  html: string,
  text: string,
  mismatches: ComparisonMismatch[],
) {
  if (!expected.testimonials.present) return;

  const testimonialSections = design.sections.filter(s => s.intent === 'testimonial_band');
  for (const section of testimonialSections) {
    // Check section heading
    if (section.heading) {
      const headingWords = section.heading.split(/\s+/).filter(w => w.length > 3);
      const headingFound = headingWords.length > 0 && headingWords.some(w => text.includes(w.toLowerCase()));
      if (!headingFound) {
        mismatches.push({
          severity: 'error', category: 'testimonial', critical: true,
          message: `Testimonial section "${section.heading}" disappeared — source clearly has testimonials`,
        });
      }
    }

    // Check individual testimonial items
    const items = section.items || [];
    if (items.length > 0) {
      const foundItems = items.filter(item => {
        const searchText = item.quote || item.body || item.name || '';
        if (!searchText) return false;
        const words = searchText.split(/\s+/).filter(w => w.length > 4);
        return words.some(w => text.includes(w.toLowerCase()));
      });

      if (foundItems.length === 0 && items.length > 0) {
        mismatches.push({
          severity: 'error', category: 'testimonial', critical: true,
          message: `No testimonial content found in rendered output — source has ${items.length} testimonial(s)`,
        });
      } else if (foundItems.length < Math.ceil(items.length / 2)) {
        mismatches.push({
          severity: 'warning', category: 'testimonial',
          message: `Only ${foundItems.length}/${items.length} testimonial items rendered (expected at least ${Math.ceil(items.length / 2)})`,
        });
      }
    }
  }
}

// ── Program Cards ────────────────────────────────────────────────────────

function checkProgramCards(
  design: ExtractedDesign,
  expected: ExpectedRenderModel,
  html: string,
  text: string,
  mismatches: ComparisonMismatch[],
) {
  if (!expected.programs.present) return;

  const programSections = design.sections.filter(s => s.intent === 'program_cards');
  for (const section of programSections) {
    // Check heading
    if (section.heading) {
      const headingWords = section.heading.split(/\s+/).filter(w => w.length > 3);
      const found = headingWords.length > 0 && headingWords.some(w => text.includes(w.toLowerCase()));
      if (!found) {
        mismatches.push({
          severity: 'warning', category: 'programs', critical: true,
          message: `Program cards section "${section.heading}" heading not found`,
        });
      }
    }

    // Check item count
    const items = section.items || [];
    if (items.length > 0) {
      const foundItems = items.filter(item => {
        if (!item.heading) return false;
        const words = item.heading.split(/\s+/).filter(w => w.length > 3);
        return words.some(w => text.includes(w.toLowerCase()));
      });
      if (foundItems.length < Math.ceil(items.length / 2)) {
        mismatches.push({
          severity: 'warning', category: 'programs',
          message: `Program cards: only ${foundItems.length}/${items.length} items rendered`,
        });
      }
    }

    // Card style intent — check for dark→light regression
    if (expected.programs.cardStyleIntent === 'dark') {
      // Look for indicators the cards are rendered as light
      const hasLightCards = checkForLightCardRendering(html, section.heading);
      if (hasLightCards) {
        mismatches.push({
          severity: 'warning', category: 'programs', critical: true,
          message: `Source program cards have dark style intent but rendered as light cards — style regression`,
        });
      }
    }
  }
}

// ── Split Sections ───────────────────────────────────────────────────────

function checkSplitSections(
  design: ExtractedDesign,
  expected: ExpectedRenderModel,
  html: string,
  text: string,
  mismatches: ComparisonMismatch[],
) {
  const splitSections = design.sections.filter(s => s.intent === 'content_media_split');
  for (let i = 0; i < splitSections.length; i++) {
    const section = splitSections[i];
    const exp = expected.splitSections[i];

    // Heading presence
    if (section.heading) {
      const headingWords = section.heading.split(/\s+/).filter(w => w.length > 3);
      const found = headingWords.length > 0 && headingWords.some(w => text.includes(w.toLowerCase()));
      if (!found) {
        mismatches.push({
          severity: 'warning', category: 'split_section',
          message: `Split section "${section.heading}" heading not found`,
        });
      }
    }

    // Visual side — check if branded visual became placeholder
    if (exp?.hasVisualSide) {
      const hasPlaceholderVisual = PLACEHOLDER_VISUAL_PATTERNS.some(p => html.includes(p));
      if (hasPlaceholderVisual) {
        mismatches.push({
          severity: 'error', category: 'split_section', critical: true,
          message: `Split section "${section.heading || 'content split'}" visual side is a placeholder — source has branded visual`,
        });
      }
    }

    // Checklist items
    if (exp?.hasChecklist && section.items?.length) {
      const listItems = section.items.filter(i => i.heading || i.body);
      const foundChecklist = listItems.some(item => {
        const w = (item.heading || item.body || '').split(/\s+/).filter(w => w.length > 3);
        return w.some(word => text.includes(word.toLowerCase()));
      });
      if (!foundChecklist && listItems.length > 0) {
        mismatches.push({
          severity: 'warning', category: 'split_section',
          message: `Split section "${section.heading || 'content split'}" checklist items not found — may have been collapsed`,
        });
      }
    }
  }
}

// ── CTA Bands ────────────────────────────────────────────────────────────

function checkCtaBands(
  design: ExtractedDesign,
  expected: ExpectedRenderModel,
  html: string,
  text: string,
  mismatches: ComparisonMismatch[],
) {
  const ctaSections = design.sections.filter(s => s.intent === 'cta_band' || s.type === 'cta');
  for (let i = 0; i < ctaSections.length; i++) {
    const section = ctaSections[i];
    const exp = expected.ctaBands[i];

    // Check heading
    if (section.heading) {
      const headingWords = section.heading.split(/\s+/).filter(w => w.length > 3);
      const found = headingWords.length > 0 && headingWords.some(w => text.includes(w.toLowerCase()));
      if (!found) {
        mismatches.push({
          severity: 'warning', category: 'cta_band',
          message: `CTA band "${section.heading}" heading not found`,
        });
      }
    }

    // Style intent: dark CTA band becoming light
    if (exp?.colorIntent === 'dark') {
      // Check if rendered output has white/light background for this area
      const hasLightFallback = checkForLightCardRendering(html, section.heading);
      if (hasLightFallback) {
        mismatches.push({
          severity: 'warning', category: 'cta_band', critical: true,
          message: `Source dark CTA band "${section.heading || 'CTA'}" appears rendered as light — style intent violation`,
        });
      }
    }
  }
}

// ── Navigation + Header ──────────────────────────────────────────────────

function checkNavigation(
  design: ExtractedDesign,
  expected: ExpectedRenderModel,
  html: string,
  text: string,
  mismatches: ComparisonMismatch[],
) {
  if (!design.header?.navItems?.length) return;

  const navItems = design.header.navItems;
  const foundCount = navItems.filter(item => text.includes(item.name.toLowerCase())).length;
  if (foundCount < Math.ceil(navItems.length / 2)) {
    mismatches.push({
      severity: 'warning', category: 'navigation',
      message: `Only ${foundCount}/${navItems.length} source nav items found in rendered header`,
    });
  }

  // Header action buttons
  if (expected.header.hasActionButtons && design.header.actionButtons?.length) {
    const actionFound = design.header.actionButtons.filter(btn =>
      text.includes(btn.text.toLowerCase())
    ).length;
    if (actionFound === 0) {
      mismatches.push({
        severity: 'warning', category: 'navigation', critical: true,
        message: `Source-rich header action cluster (${design.header.actionButtons.length} button(s)) completely missing — plain nav only`,
      });
    } else if (actionFound < design.header.actionButtons.length) {
      mismatches.push({
        severity: 'warning', category: 'navigation',
        message: `${design.header.actionButtons.length - actionFound} header action button(s) missing from rendered output`,
      });
    }
  }
}

// ── Footer ───────────────────────────────────────────────────────────────

function checkFooter(
  design: ExtractedDesign,
  expected: ExpectedRenderModel,
  html: string,
  text: string,
  mismatches: ComparisonMismatch[],
) {
  if (!design.footer) return;

  // Footer link groups
  if (design.footer.linkGroups) {
    const allLinks = Object.values(design.footer.linkGroups).flat();
    if (allLinks.length > 0) {
      const foundLinks = allLinks.filter(link => text.includes(link.name.toLowerCase())).length;
      if (foundLinks < Math.ceil(allLinks.length / 3)) {
        mismatches.push({
          severity: 'warning', category: 'footer', critical: expected.footer.linkGroupCount >= 2,
          message: `Rich source footer reduced — only ${foundLinks}/${allLinks.length} footer links found in rendered output`,
        });
      }
    }
  }

  // Footer description
  if (expected.footer.hasDescription && design.footer.description) {
    const descWords = design.footer.description.split(/\s+/).filter(w => w.length > 4);
    const found = descWords.some(w => text.includes(w.toLowerCase()));
    if (!found) {
      mismatches.push({
        severity: 'warning', category: 'footer',
        message: `Source footer brand description not found — footer thinned`,
      });
    }
  }

  // Social links
  if (expected.footer.hasSocial && design.footer.socialLinks?.length) {
    const socialFound = design.footer.socialLinks.some(link =>
      html.includes(link.url) || text.includes(link.platform.toLowerCase())
    );
    if (!socialFound) {
      mismatches.push({
        severity: 'warning', category: 'footer',
        message: `Source footer social links not found in rendered output`,
      });
    }
  }

  // Overall footer richness check
  const richSourceFooter = expected.footer.linkGroupCount >= 2 || 
    (expected.footer.hasDescription && expected.footer.hasSocial);
  if (richSourceFooter) {
    const footerSignals = [
      expected.footer.hasDescription && design.footer.description ? 
        design.footer.description.split(/\s+/).filter(w => w.length > 4).some(w => text.includes(w.toLowerCase())) : true,
      expected.footer.hasSocial ? 
        (design.footer.socialLinks || []).some(l => html.includes(l.url) || text.includes(l.platform.toLowerCase())) : true,
      expected.footer.linkGroupCount > 0 ? 
        Object.values(design.footer.linkGroups || {}).flat().some(l => text.includes(l.name.toLowerCase())) : true,
    ];
    const presentSignals = footerSignals.filter(Boolean).length;
    if (presentSignals < 2) {
      mismatches.push({
        severity: 'warning', category: 'footer', critical: true,
        message: `Source-rich footer (${expected.footer.linkGroupCount} groups, social, description) became thin/minimal`,
      });
    }
  }
}

// ── Default text ─────────────────────────────────────────────────────────

function checkDefaultText(
  html: string,
  text: string,
  mismatches: ComparisonMismatch[],
) {
  for (const pattern of DEFAULT_PATTERNS) {
    if (text.includes(pattern)) {
      mismatches.push({
        severity: 'error', category: 'content',
        message: `Generic/default text found in rendered output: "${pattern}"`,
      });
    }
  }
}

// ── Placeholder visuals ──────────────────────────────────────────────────

function checkPlaceholderVisuals(
  html: string,
  mismatches: ComparisonMismatch[],
) {
  for (const pattern of PLACEHOLDER_VISUAL_PATTERNS) {
    if (html.includes(pattern)) {
      mismatches.push({
        severity: 'warning', category: 'content', critical: true,
        message: `Placeholder visual detected in rendered output: "${pattern}"`,
      });
      break; // one warning is enough
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function countActionableElements(html: string, context: string): number {
  // Rough count of <a> and <button> near context keywords
  const contextRegion = html.toLowerCase();
  const aCount = (contextRegion.match(/<a\s/g) || []).length;
  const buttonCount = (contextRegion.match(/<button/g) || []).length;
  return aCount + buttonCount;
}

function checkForLightCardRendering(html: string, heading?: string): boolean {
  // Heuristic: check for white/light background indicators near the section
  // This is approximate — looks for common patterns in rendered Liquid
  const patterns = [
    'background-color: #fff', 'background-color: white',
    'background-color: #fef', 'background: #fff', 'background: white',
    'bg-white', 'bg_color": "#fff', 'bg_color": "white',
  ];
  // If there's a heading, try to check the region near it
  const lowerHtml = html.toLowerCase();
  if (heading) {
    const headingLower = heading.toLowerCase();
    const idx = lowerHtml.indexOf(headingLower);
    if (idx >= 0) {
      const region = lowerHtml.slice(Math.max(0, idx - 500), idx + 500);
      return patterns.some(p => region.includes(p));
    }
  }
  return false;
}
