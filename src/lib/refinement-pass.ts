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

  // 5. Source-binding integrity (NEW)
  validateSourceBinding(ops, design, warnings);

  // 6. Header action cluster completeness (NEW)
  validateHeaderActionCluster(ops, design, warnings);

  // 7. Branded visual panel check (NEW)
  validateBrandedVisualPanels(ops, design, warnings);

  // 8. CTA band source-recipe check (NEW)
  validateCtaBandRecipe(ops, design, warnings);

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
  const intentKeywords: Record<string, string[]> = {
    hero: ['hero'],
    stats: ['stat', 'number', 'metric'],
    feature_grid: ['feature', 'problem', 'solution', 'service'],
    icon_card_row: ['icon', 'problem', 'holding', 'challenge', 'benefit'],
    program_cards: ['program', 'course', 'depth', 'offering', 'pricing'],
    testimonial_band: ['testimonial', 'review', 'social proof', 'loved', 'diver', 'founder', 'what our'],
    cta_band: ['cta', 'plunge', 'ready', 'call to action', 'get started', 'stand out'],
    content_media_split: ['content', 'media', 'split', 'elevated', 'brand', 'solution'],
    faq: ['faq', 'question', 'asked'],
  };

  for (const s of sections) {
    if (s.heading && label.includes(s.heading.toLowerCase().slice(0, 20))) return s;
    const keywords = intentKeywords[s.intent] || [];
    if (keywords.some(kw => label.includes(kw))) return s;
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

// ── Source-Binding Integrity Check ──────────────────────────────────────

const GENERIC_PLACEHOLDER_PATTERNS = [
  /lorem ipsum/i,
  /placeholder/i,
  /your heading here/i,
  /your text here/i,
  /sample text/i,
  /card title/i,
  /add your title/i,
  /get started today/i,
  /welcome to our site/i,
  /this is a sample/i,
];

function isGenericPlaceholder(text: string): boolean {
  const stripped = text.replace(/<[^>]+>/g, '').trim();
  if (!stripped) return false;
  return GENERIC_PLACEHOLDER_PATTERNS.some(p => p.test(stripped));
}

function validateSourceBinding(
  ops: TransformationOperation[],
  design: ExtractedDesign,
  warnings: ValidationWarning[],
) {
  // 1. Hero source-binding check
  if (design.hero?.heading) {
    const heroOps = ops.filter(op =>
      op.type === 'replaceText' && (op.label || '').toLowerCase().includes('hero'),
    );
    
    for (const op of heroOps) {
      const value = (op as any).value || '';
      const stripped = value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      
      // Check if hero text contains source heading content
      const sourceHeadingWords = design.hero.heading.split(/\s+/).filter(w => w.length > 3);
      const hasSourceContent = sourceHeadingWords.length > 0 &&
        sourceHeadingWords.some(word => stripped.toLowerCase().includes(word.toLowerCase()));
      
      if (!hasSourceContent && stripped.length > 10) {
        warnings.push({
          severity: 'warning',
          message: `Hero text does not contain source heading "${design.hero.heading.slice(0, 40)}..." — may have fallen back to base-theme defaults`,
        });
      }
      
      if (isGenericPlaceholder(value)) {
        warnings.push({
          severity: 'warning',
          message: `Hero contains generic placeholder text despite source hero content being available`,
        });
      }
    }
  }

  // 2. Check addSection ops for placeholder text when source has real content
  const addOps = ops.filter(
    (op): op is Extract<TransformationOperation, { type: 'addSection' }> => op.type === 'addSection',
  );

  for (const op of addOps) {
    const blocks = Object.values(op.section?.blocks || {}) as any[];
    for (const block of blocks) {
      const text = block.settings?.text || '';
      if (isGenericPlaceholder(text)) {
        warnings.push({
          severity: 'warning',
          message: `Section "${op.label}" block contains generic placeholder text — source content should override`,
        });
        break; // One warning per section is enough
      }
    }
  }

  // 3. Check CTA band source binding
  const ctaSections = design.sections.filter(s => s.intent === 'cta_band');
  for (const src of ctaSections) {
    if (!src.heading) continue;
    const matchingOp = addOps.find(op => {
      const label = (op.label || '').toLowerCase();
      return label.includes('cta') || label.includes('ready') || label.includes('stand out');
    });
    if (matchingOp) {
      const allText = Object.values(matchingOp.section?.blocks || {})
        .map((b: any) => b.settings?.text || '').join('');
      const stripped = allText.replace(/<[^>]+>/g, '');
      const srcWords = src.heading.split(/\s+/).filter(w => w.length > 3);
      if (srcWords.length > 0 && !srcWords.some(w => stripped.toLowerCase().includes(w.toLowerCase()))) {
        warnings.push({
          severity: 'warning',
          message: `CTA band heading does not match source "${src.heading.slice(0, 40)}" — may use base-theme default`,
        });
      }
    }
  }

  // 4. Check split content sections for source binding
  const splitSections = design.sections.filter(s => s.intent === 'content_media_split');
  for (const src of splitSections) {
    if (!src.heading) continue;
    const matchingOp = addOps.find(op => {
      const label = (op.label || '').toLowerCase();
      return label.includes('content') || label.includes('split') || label.includes('elevated') || label.includes('brand');
    });
    if (matchingOp) {
      const allText = Object.values(matchingOp.section?.blocks || {})
        .map((b: any) => b.settings?.text || '').join('');
      const stripped = allText.replace(/<[^>]+>/g, '');
      if (stripped.length > 10 && isGenericPlaceholder(allText)) {
        warnings.push({
          severity: 'warning',
          message: `Content split section does not contain source heading "${src.heading.slice(0, 40)}" — may be defaulting`,
        });
      }
    }
  }
}

// ── Header Action Cluster Completeness ──────────────────────────────────

function validateHeaderActionCluster(
  ops: TransformationOperation[],
  design: ExtractedDesign,
  warnings: ValidationWarning[],
) {
  if (!design.header?.actionButtons || design.header.actionButtons.length === 0) return;

  const actionBtns = design.header.actionButtons;
  const navOps = ops.filter(op => op.type === 'updateNavigation');
  const mainNavOp = navOps.find(op => (op as any).menuId === 'main-menu');
  
  if (mainNavOp) {
    const navLinks = (mainNavOp as any).links as Array<{ name: string; url: string }>;
    // Check if action buttons were flattened into nav
    for (const btn of actionBtns) {
      const inNav = navLinks.some(l => l.name === btn.text);
      if (inNav) {
        warnings.push({
          severity: 'info',
          message: `Header action button "${btn.text}" was flattened into plain nav — source distinguishes it as a CTA button`,
        });
      }
    }
  }

  // Check if action buttons exist anywhere in the output
  const allOpsJson = JSON.stringify(ops);
  for (const btn of actionBtns) {
    if (!allOpsJson.includes(btn.text)) {
      warnings.push({
        severity: 'warning',
        message: `Header action button "${btn.text}" from source is missing from output entirely`,
      });
    }
  }
}

// ── Branded Visual Panel Check ──────────────────────────────────────────

function validateBrandedVisualPanels(
  ops: TransformationOperation[],
  design: ExtractedDesign,
  warnings: ValidationWarning[],
) {
  const splitSections = design.sections.filter(s => s.intent === 'content_media_split');
  const addOps = ops.filter(
    (op): op is Extract<TransformationOperation, { type: 'addSection' }> => op.type === 'addSection',
  );

  for (const src of splitSections) {
    const matchingOp = addOps.find(op => {
      const label = (op.label || '').toLowerCase();
      return label.includes('content') || label.includes('split') || label.includes('elevated') || label.includes('brand');
    });

    if (!matchingOp) continue;

    const blocks = Object.values(matchingOp.section?.blocks || {}) as any[];
    const hasImageBlock = blocks.some(b => b.type === 'image' && b.settings?.image);
    const hasVisualPanel = blocks.some(b => {
      const text = (b.settings?.text || '').toLowerCase();
      return b.settings?.background_color || b.settings?.box_shadow ||
        text.includes('brand') || text.includes('logo');
    });

    // Check if source had a visual side that got lost
    if (src.hasImages || src.image || src.backgroundImage) {
      if (!hasImageBlock && !hasVisualPanel) {
        warnings.push({
          severity: 'warning',
          message: `Split section "${src.heading || 'content'}" source has visual side but output has no image or branded panel — became text-only`,
        });
      }
    }

    // Check if any block is just a placeholder "Visual Placeholder"
    for (const block of blocks) {
      const text = (block.settings?.text || '').toLowerCase();
      if (text.includes('visual placeholder') || text.includes('image placeholder') || text.includes('[placeholder]')) {
        warnings.push({
          severity: 'warning',
          message: `Split section "${src.heading || 'content'}" has generic visual placeholder — should use branded panel or real image`,
        });
      }
    }
  }
}

// ── CTA Band Source-Recipe Check ────────────────────────────────────────

function validateCtaBandRecipe(
  ops: TransformationOperation[],
  design: ExtractedDesign,
  warnings: ValidationWarning[],
) {
  const ctaSources = design.sections.filter(s => s.intent === 'cta_band');
  const addOps = ops.filter(
    (op): op is Extract<TransformationOperation, { type: 'addSection' }> => op.type === 'addSection',
  );

  for (const src of ctaSources) {
    const matchingOp = addOps.find(op => {
      const label = (op.label || '').toLowerCase();
      return label.includes('cta') || label.includes('ready') || label.includes('stand out');
    });
    if (!matchingOp) continue;

    // Check dual CTA preservation
    if (src.secondaryCtaText) {
      const allText = Object.values(matchingOp.section?.blocks || {})
        .map((b: any) => (b.settings?.text || '') + (b.settings?.btn_text || '')).join('');
      if (!allText.includes(src.secondaryCtaText)) {
        warnings.push({
          severity: 'warning',
          message: `CTA band source had secondary CTA "${src.secondaryCtaText}" but it was dropped from output`,
        });
      }
    }

    // Check source recipe: dark section with inner card vs plain section
    if (src.backgroundColor) {
      const sectionBg = matchingOp.section?.settings?.background_color;
      if (!sectionBg) {
        warnings.push({
          severity: 'info',
          message: `CTA band source has background_color "${src.backgroundColor}" but output section has no background_color set`,
        });
      }
    }
  }
}
