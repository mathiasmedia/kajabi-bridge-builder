/**
 * Structural Comparison: Rendered HTML vs Source Design
 * 
 * Compares the rendered Kajabi output against the ExtractedDesign
 * to detect missing sections, CTAs, and content degradation.
 */

import type { ExtractedDesign } from '@/types';
import type { RenderDiagnostics } from '@/lib/renderer-integration';

export interface ComparisonMismatch {
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
}

export interface ComparisonResult {
  pass: boolean;
  score: number; // 0-100
  mismatches: ComparisonMismatch[];
  summary: string;
}

/**
 * Run a structural comparison between rendered HTML and source design.
 */
export function runStructuralComparison(
  renderedHtml: string,
  extractedDesign: ExtractedDesign,
  diagnostics: RenderDiagnostics,
): ComparisonResult {
  const mismatches: ComparisonMismatch[] = [];
  const htmlLower = renderedHtml.toLowerCase();
  const textContent = renderedHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  // 1. Hero check
  checkHero(extractedDesign, htmlLower, textContent, mismatches);

  // 2. CTA checks
  checkCTAs(extractedDesign, htmlLower, textContent, mismatches);

  // 3. Section presence check
  checkSections(extractedDesign, htmlLower, textContent, mismatches);

  // 4. Navigation check
  checkNavigation(extractedDesign, htmlLower, textContent, mismatches);

  // 5. Footer check
  checkFooter(extractedDesign, htmlLower, textContent, mismatches);

  // 6. Default/placeholder text check
  checkDefaultText(htmlLower, textContent, mismatches);

  // 7. Diagnostics-derived warnings
  for (const w of diagnostics.warnings) {
    mismatches.push({ severity: 'warning', category: 'render', message: w });
  }

  // Calculate score
  const errorCount = mismatches.filter(m => m.severity === 'error').length;
  const warningCount = mismatches.filter(m => m.severity === 'warning').length;
  const score = Math.max(0, 100 - errorCount * 15 - warningCount * 5);
  const pass = errorCount === 0 && score >= 50;

  const summary = pass
    ? `Render check passed (${score}/100). ${mismatches.length} note(s).`
    : `Render check has issues (${score}/100). ${errorCount} error(s), ${warningCount} warning(s).`;

  return { pass, score, mismatches, summary };
}

// ── Individual checks ──────────────────────────────────────────────────────

function checkHero(
  design: ExtractedDesign,
  html: string,
  text: string,
  mismatches: ComparisonMismatch[],
) {
  if (!design.hero) return;

  // Check hero heading is present
  const heroWords = design.hero.heading.split(/\s+/).filter(w => w.length > 3);
  const headingFound = heroWords.length > 0 &&
    heroWords.some(w => text.includes(w.toLowerCase()));

  if (!headingFound) {
    mismatches.push({
      severity: 'error',
      category: 'hero',
      message: `Source hero heading "${design.hero.heading}" not found in rendered output`,
    });
  }

  // Check hero subheading
  if (design.hero.subheading) {
    const subWords = design.hero.subheading.split(/\s+/).filter(w => w.length > 4);
    const subFound = subWords.length > 0 &&
      subWords.some(w => text.includes(w.toLowerCase()));
    if (!subFound) {
      mismatches.push({
        severity: 'warning',
        category: 'hero',
        message: `Source hero subheading not reflected in rendered output`,
      });
    }
  }

  // Check primary CTA
  if (design.hero.ctaText) {
    if (!text.includes(design.hero.ctaText.toLowerCase())) {
      mismatches.push({
        severity: 'warning',
        category: 'hero',
        message: `Hero primary CTA "${design.hero.ctaText}" not found in rendered output`,
      });
    }
  }

  // Check secondary CTA
  if (design.hero.secondaryCtaText) {
    if (!text.includes(design.hero.secondaryCtaText.toLowerCase())) {
      mismatches.push({
        severity: 'warning',
        category: 'hero',
        message: `Hero secondary CTA "${design.hero.secondaryCtaText}" missing — source had dual CTAs`,
      });
    }
  }
}

function checkCTAs(
  design: ExtractedDesign,
  html: string,
  text: string,
  mismatches: ComparisonMismatch[],
) {
  // Check CTA sections
  const ctaSections = design.sections.filter(s =>
    s.intent === 'cta_band' || s.type === 'cta'
  );

  for (const section of ctaSections) {
    if (section.ctaText && !text.includes(section.ctaText.toLowerCase())) {
      mismatches.push({
        severity: 'warning',
        category: 'cta',
        message: `CTA section "${section.heading || 'CTA band'}" primary action "${section.ctaText}" not in rendered output`,
      });
    }
    if (section.secondaryCtaText && !text.includes(section.secondaryCtaText.toLowerCase())) {
      mismatches.push({
        severity: 'info',
        category: 'cta',
        message: `CTA section secondary action "${section.secondaryCtaText}" not in rendered output — source had dual CTAs`,
      });
    }
  }
}

function checkSections(
  design: ExtractedDesign,
  html: string,
  text: string,
  mismatches: ComparisonMismatch[],
) {
  for (const section of design.sections) {
    if (section.intent === 'hero') continue; // checked separately

    if (section.heading) {
      const headingWords = section.heading.split(/\s+/).filter(w => w.length > 3);
      const found = headingWords.length > 0 &&
        headingWords.some(w => text.includes(w.toLowerCase()));

      if (!found) {
        mismatches.push({
          severity: 'warning',
          category: 'section',
          message: `Source section "${section.heading}" (${section.intent}) heading not found in rendered output`,
        });
      }
    }

    // Check repeated items weren't collapsed
    if (section.hasRepeatedCards && section.repeatedItemCount >= 3) {
      const itemCount = section.items?.length || section.repeatedItemCount;
      // Try to find at least some item headings
      const foundItems = (section.items || []).filter(item => {
        if (!item.heading) return false;
        const words = item.heading.split(/\s+/).filter(w => w.length > 3);
        return words.some(w => text.includes(w.toLowerCase()));
      });

      if (foundItems.length < Math.floor(itemCount / 2)) {
        mismatches.push({
          severity: 'warning',
          category: 'section',
          message: `Source "${section.heading || section.intent}" had ${itemCount} repeated items but only ${foundItems.length} appear in rendered output`,
        });
      }
    }

    // Icon card row flattened?
    if (section.intent === 'icon_card_row' && section.hasIcons) {
      // Check if any icon/feature card structure survived
      const hasFeatureBlocks = html.includes('class="feature') || html.includes('class="card');
      if (!hasFeatureBlocks) {
        mismatches.push({
          severity: 'warning',
          category: 'section',
          message: `Icon card section "${section.heading || 'icon cards'}" may have been flattened — no card/feature blocks found`,
        });
      }
    }

    // Split section visual check
    if (section.intent === 'content_media_split') {
      if (section.hasChecklist) {
        const listItems = (section.items || []).filter(i => i.heading || i.body);
        const foundChecklist = listItems.some(item => {
          const w = (item.heading || item.body || '').split(/\s+/).filter(w => w.length > 3);
          return w.some(word => text.includes(word.toLowerCase()));
        });
        if (!foundChecklist && listItems.length > 0) {
          mismatches.push({
            severity: 'warning',
            category: 'section',
            message: `Split section "${section.heading || 'content split'}" checklist items not found — may have been collapsed into paragraph`,
          });
        }
      }
    }
  }
}

function checkNavigation(
  design: ExtractedDesign,
  html: string,
  text: string,
  mismatches: ComparisonMismatch[],
) {
  if (!design.header?.navItems?.length) return;

  const navItems = design.header.navItems;
  const foundCount = navItems.filter(item =>
    text.includes(item.name.toLowerCase())
  ).length;

  if (foundCount < Math.ceil(navItems.length / 2)) {
    mismatches.push({
      severity: 'warning',
      category: 'navigation',
      message: `Only ${foundCount}/${navItems.length} source nav items found in rendered header`,
    });
  }

  // Check header action buttons
  if (design.header.actionButtons?.length) {
    const actionFound = design.header.actionButtons.filter(btn =>
      text.includes(btn.text.toLowerCase())
    ).length;
    if (actionFound < design.header.actionButtons.length) {
      mismatches.push({
        severity: 'warning',
        category: 'navigation',
        message: `${design.header.actionButtons.length - actionFound} header action button(s) missing from rendered output`,
      });
    }
  }
}

function checkFooter(
  design: ExtractedDesign,
  html: string,
  text: string,
  mismatches: ComparisonMismatch[],
) {
  if (!design.footer) return;

  // Check footer link groups
  if (design.footer.linkGroups) {
    const allLinks = Object.values(design.footer.linkGroups).flat();
    if (allLinks.length > 0) {
      const foundLinks = allLinks.filter(link =>
        text.includes(link.name.toLowerCase())
      ).length;
      if (foundLinks < Math.ceil(allLinks.length / 3)) {
        mismatches.push({
          severity: 'warning',
          category: 'footer',
          message: `Rich source footer reduced — only ${foundLinks}/${allLinks.length} footer links found in rendered output`,
        });
      }
    }
  }

  // Check footer description
  if (design.footer.description) {
    const descWords = design.footer.description.split(/\s+/).filter(w => w.length > 4);
    const found = descWords.some(w => text.includes(w.toLowerCase()));
    if (!found) {
      mismatches.push({
        severity: 'info',
        category: 'footer',
        message: `Source footer brand description not found in rendered output`,
      });
    }
  }

  // Check social links
  if (design.footer.socialLinks?.length) {
    // Social links are usually rendered as icon-only, so just check for platform names or URLs
    const socialFound = design.footer.socialLinks.some(link =>
      html.includes(link.url) || text.includes(link.platform.toLowerCase())
    );
    if (!socialFound) {
      mismatches.push({
        severity: 'info',
        category: 'footer',
        message: `Source footer social links not found in rendered output`,
      });
    }
  }
}

function checkDefaultText(
  html: string,
  text: string,
  mismatches: ComparisonMismatch[],
) {
  const defaultPatterns = [
    'lorem ipsum',
    'dolor sit amet',
    'card title',
    'your heading here',
    'click here to edit',
    'sample text',
    'placeholder text',
    'add your text',
    'edit this text',
  ];

  for (const pattern of defaultPatterns) {
    if (text.includes(pattern)) {
      mismatches.push({
        severity: 'error',
        category: 'content',
        message: `Generic/default text found in rendered output: "${pattern}"`,
      });
    }
  }
}
