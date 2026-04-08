/**
 * Post-AI Refinement Pass
 *
 * Validates generated operations against extracted source evidence.
 * Prunes invented/thin sections, strengthens thinned sections when
 * source data is available, and ensures nav consistency.
 */

import type {
  TransformationOperation,
  ExtractedDesign,
  ExtractedSection,
  ValidationWarning,
} from '@/types';

export interface RefinementResult {
  operations: TransformationOperation[];
  warnings: ValidationWarning[];
}

/**
 * Run a semantic refinement pass on AI-generated operations.
 * Compares generated sections back to ExtractedSection data.
 */
export function runRefinementPass(
  operations: TransformationOperation[],
  design: ExtractedDesign,
): RefinementResult {
  const warnings: ValidationWarning[] = [];
  let ops = [...operations];

  // 1. Nav / link_list consistency
  ops = refineNavConsistency(ops, design, warnings);

  // 2. Section invention check
  ops = refineAgainstSource(ops, design, warnings);

  // 3. Section completeness checks
  validateSectionCompleteness(ops, design, warnings);

  // 4. Hero richness safety
  validateHeroRichness(ops, design, warnings);

  return { operations: ops, warnings };
}

// ── Nav / Link-List Consistency ─────────────────────────────────────────

function refineNavConsistency(
  ops: TransformationOperation[],
  design: ExtractedDesign,
  warnings: ValidationWarning[],
): TransformationOperation[] {
  const sourceNavItems = design.header?.navItems || [];
  const sourceFooterLinks = design.footer?.linkGroups
    ? Object.values(design.footer.linkGroups).flat()
    : [];

  // Check for menu blocks referencing menus
  const navOps = ops.filter(op => op.type === 'updateNavigation');
  const menuIds = new Set(navOps.map(op => (op as any).menuId));

  // Find menu block references in addSection operations
  const addOps = ops.filter(
    (op): op is Extract<TransformationOperation, { type: 'addSection' }> => op.type === 'addSection',
  );

  for (const op of addOps) {
    const blocks = op.section?.blocks || {};
    for (const [bid, block] of Object.entries(blocks)) {
      const b = block as any;
      if (b.type === 'menu' && b.settings?.menu) {
        const menuRef = b.settings.menu;
        if (!menuIds.has(menuRef)) {
          warnings.push({
            severity: 'warning',
            message: `Menu block "${bid}" references menu "${menuRef}" not in link_lists — will be empty`,
          });
        }
      }
    }
  }

  // Warn if source nav is richer than generated link_lists
  if (sourceNavItems.length > 0) {
    const mainNavOp = navOps.find(op => (op as any).menuId === 'main-menu');
    if (mainNavOp) {
      const genLinks = ((mainNavOp as any).links || []) as Array<{ name: string }>;
      if (genLinks.length < sourceNavItems.length) {
        warnings.push({
          severity: 'info',
          message: `Source nav has ${sourceNavItems.length} items but generated menu has ${genLinks.length} — some links may be missing`,
        });
      }
    } else if (navOps.length === 0) {
      warnings.push({
        severity: 'warning',
        message: `Source has ${sourceNavItems.length} nav items but no updateNavigation operation generated`,
      });
    }
  }

  // Ensure footer links are generated if source has them
  if (sourceFooterLinks.length > 0) {
    const footerNavOp = navOps.find(op => (op as any).menuId === 'footer-menu');
    if (!footerNavOp) {
      // Add a footer menu from source data
      ops.push({
        type: 'updateNavigation',
        menuId: 'footer-menu',
        links: sourceFooterLinks.map(l => ({ name: l.name, url: l.url })),
      } as TransformationOperation);
      warnings.push({
        severity: 'info',
        message: `Auto-generated footer menu with ${sourceFooterLinks.length} links from source`,
      });
    }
  }

  return ops;
}

// ── Section Invention Check ─────────────────────────────────────────────

function refineAgainstSource(
  ops: TransformationOperation[],
  design: ExtractedDesign,
  warnings: ValidationWarning[],
): TransformationOperation[] {
  const addOps = ops.filter(
    (op): op is Extract<TransformationOperation, { type: 'addSection' }> => op.type === 'addSection',
  );
  const sourceSections = design.sections;
  const opsToRemove = new Set<number>();

  for (const op of addOps) {
    const label = (op.label || '').toLowerCase();
    const opIndex = ops.indexOf(op);

    // Try to match this generated section to a source section
    const matchedSource = findMatchingSource(label, sourceSections);

    if (!matchedSource) {
      // Generated section has no source backing
      const blocks = Object.values(op.section?.blocks || {});
      const totalTextLen = blocks.reduce((sum, b: any) => {
        return sum + ((b.settings?.text || '').length);
      }, 0);

      // Only warn (don't remove) — AI may have legitimately merged/renamed
      if (totalTextLen < 50 && blocks.length <= 1) {
        warnings.push({
          severity: 'warning',
          message: `Section "${op.label}" appears invented with minimal content — no matching source section found`,
        });
        opsToRemove.add(opIndex);
      } else {
        warnings.push({
          severity: 'info',
          message: `Section "${op.label}" has no direct source section match — may be reorganized content`,
        });
      }
      continue;
    }

    // Check if generated section is much thinner than source
    const sourceItems = matchedSource.items?.length || 0;
    const genBlocks = Object.values(op.section?.blocks || {}).length;

    if (sourceItems >= 3 && genBlocks <= 1) {
      warnings.push({
        severity: 'warning',
        message: `Section "${op.label}" collapsed ${sourceItems} source items into ${genBlocks} block(s) — content may be lost`,
        target: matchedSource.id,
      });
    }

    // Check if a repeated-item section lost its items
    if (matchedSource.hasRepeatedCards && sourceItems >= 2 && genBlocks < sourceItems) {
      const totalText = Object.values(op.section?.blocks || {}).reduce((sum, b: any) => {
        return sum + ((b.settings?.text || '').length);
      }, 0);
      if (totalText < sourceItems * 30) {
        warnings.push({
          severity: 'warning',
          message: `Section "${op.label}" source has ${sourceItems} card items but output is too thin (${totalText} chars across ${genBlocks} blocks)`,
          target: matchedSource.id,
        });
      }
    }
  }

  // Remove truly empty invented sections
  return ops.filter((_, i) => !opsToRemove.has(i));
}

function findMatchingSource(label: string, sections: ExtractedSection[]): ExtractedSection | undefined {
  // Intent keywords for matching
  const intentKeywords: Record<string, string[]> = {
    hero: ['hero'],
    stats: ['stat', 'number', 'metric'],
    feature_grid: ['feature', 'problem', 'solution', 'service'],
    program_cards: ['program', 'course', 'depth', 'offering', 'pricing'],
    testimonial_band: ['testimonial', 'review', 'social proof', 'loved', 'diver', 'founder', 'what our'],
    cta_band: ['cta', 'plunge', 'ready', 'call to action', 'get started', 'stand out'],
    content_media_split: ['content', 'media', 'split', 'elevated', 'brand'],
    faq: ['faq', 'question', 'asked'],
  };

  for (const s of sections) {
    // Direct heading match
    if (s.heading && label.includes(s.heading.toLowerCase().slice(0, 20))) return s;

    // Intent keyword match
    const keywords = intentKeywords[s.intent] || [];
    if (keywords.some(kw => label.includes(kw))) return s;

    // Intent name match
    if (label.includes(s.intent.replace('_', ' '))) return s;
  }

  return undefined;
}

// ── Section Completeness Checks ─────────────────────────────────────────

function validateSectionCompleteness(
  ops: TransformationOperation[],
  design: ExtractedDesign,
  warnings: ValidationWarning[],
) {
  const addOps = ops.filter(
    (op): op is Extract<TransformationOperation, { type: 'addSection' }> => op.type === 'addSection',
  );

  for (const op of addOps) {
    const label = (op.label || '').toLowerCase();
    const blocks = Object.values(op.section?.blocks || {}) as any[];
    const allText = blocks.map(b => b.settings?.text || '').join('');
    const hasCta = blocks.some(b => b.type === 'cta' || b.settings?.use_btn === 'true' || b.settings?.btn_text);

    // Stats completeness
    if (label.includes('stat')) {
      const hasNumbers = /<h[34]>[^<]*\d[^<]*<\/h[34]>/.test(allText);
      if (!hasNumbers) {
        warnings.push({ severity: 'warning', message: `Stats section "${op.label}" missing numeric values` });
      }
    }

    // Program cards completeness
    if (label.includes('program') || label.includes('course')) {
      const matchedSource = design.sections.find(s => s.intent === 'program_cards');
      if (matchedSource && matchedSource.items && matchedSource.items.length >= 2) {
        if (blocks.length < matchedSource.items.length) {
          warnings.push({
            severity: 'warning',
            message: `Program cards: source has ${matchedSource.items.length} items but section has ${blocks.length} blocks`,
          });
        }
      }
    }

    // Testimonials completeness
    if (label.includes('testimonial') || label.includes('social proof') || label.includes('loved')) {
      const hasQuotes = allText.includes('"') || allText.includes('\u201c') || allText.includes('italic');
      if (!hasQuotes) {
        warnings.push({ severity: 'warning', message: `Testimonial section "${op.label}" missing quote content` });
      }
    }

    // CTA band completeness
    if (label.includes('cta') || label.includes('ready') || label.includes('stand out')) {
      if (!hasCta) {
        warnings.push({ severity: 'warning', message: `CTA section "${op.label}" has no CTA button` });
      }
    }
  }

  // Hero completeness (via existing hero or replaceText ops)
  if (design.hero) {
    const heroTextOps = ops.filter(op => op.type === 'replaceText' && (op.label || '').toLowerCase().includes('hero'));
    if (heroTextOps.length === 0) {
      // Check if hero is in an addSection
      const heroAdd = addOps.find(op => (op.label || '').toLowerCase().includes('hero'));
      if (!heroAdd) {
        warnings.push({ severity: 'warning', message: 'Hero exists in source but no hero content in output' });
      }
    }
  }

  // Header/footer nav completeness
  const navOps = ops.filter(op => op.type === 'updateNavigation');
  if (design.header?.navItems && design.header.navItems.length > 0 && navOps.length === 0) {
    warnings.push({ severity: 'warning', message: 'Source has navigation items but no updateNavigation operations generated' });
  }
}

// ── Hero Richness Safety Check ──────────────────────────────────────────

function validateHeroRichness(
  ops: TransformationOperation[],
  design: ExtractedDesign,
  warnings: ValidationWarning[],
) {
  if (!design.hero) return;

  const heroOps = ops.filter(op =>
    op.type === 'replaceText' && (op.label || '').toLowerCase().includes('hero'),
  );

  for (const op of heroOps) {
    const value = (op as any).value || '';

    // Check if emphasis was applied without strong source evidence
    if (value.includes('style="color:') || value.includes('<span style=')) {
      const heroSections = design.sections.filter(s => s.intent === 'hero');
      const hasEmphasisEvidence = heroSections.some(s => {
        const str = JSON.stringify(s);
        return /text-gradient|text-accent|text-primary|className.*accent/i.test(str);
      });

      // Also check source components for inline emphasis patterns
      const sourceHeroHasEmphasis = Object.values(design.sections)
        .filter(s => s.intent === 'hero')
        .some(s => s.sourceFile && /text-gradient|accent|className/i.test(s.sourceFile));

      if (!hasEmphasisEvidence && !sourceHeroHasEmphasis) {
        warnings.push({
          severity: 'info',
          message: 'Hero emphasis styling applied but source evidence for inline differentiation is weak',
        });
      }
    }

    // Check if secondary CTA was dropped
    const heroSections = design.sections.filter(s => s.intent === 'hero');
    const sourceHasMultiCta = heroSections.some(s => {
      const str = JSON.stringify(s);
      return (str.match(/Button/g) || []).length >= 2;
    });

    if (sourceHasMultiCta) {
      const hasTwoBtns = (value.match(/btn_text/g) || []).length >= 2;
      if (!hasTwoBtns) {
        warnings.push({
          severity: 'info',
          message: 'Hero had 2 CTAs in source but only one preserved — secondary CTA may be inline fallback',
        });
      }
    }
  }
}
