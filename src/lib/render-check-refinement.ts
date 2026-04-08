/**
 * Render-Check-Guided Refinement
 * 
 * Translates Render Check mismatches into targeted refinement suggestions,
 * either deterministic fixes or scoped regeneration requests.
 */

import type { ExtractedDesign, TransformationPlan, TransformationOperation } from '@/types';
import type { RenderCheckOutput } from '@/lib/renderer-integration';
import type { ComparisonMismatch } from '@/lib/render-check-compare';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RefinementSuggestion {
  id: string;
  mismatchKind: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  strategy: 'apply_deterministic_fix' | 'regenerate_section' | 'strengthen_existing_section' | 'warn_only';
  targetSectionId?: string;
  targetIntent?: string;
  proposedOperations?: TransformationOperation[];
}

export interface RefinementResult {
  suggestions: RefinementSuggestion[];
  deterministicCount: number;
  regenerationCount: number;
  warnOnlyCount: number;
}

// ── Main entry ─────────────────────────────────────────────────────────────

export function generateRefinementSuggestions(
  extractedDesign: ExtractedDesign,
  plan: TransformationPlan,
  renderCheck: RenderCheckOutput,
): RefinementResult {
  const suggestions: RefinementSuggestion[] = [];
  const mismatches = renderCheck.comparison?.mismatches || [];

  for (const mismatch of mismatches) {
    const suggestion = mapMismatchToSuggestion(mismatch, extractedDesign, plan);
    if (suggestion) {
      suggestions.push(suggestion);
    }
  }

  return {
    suggestions,
    deterministicCount: suggestions.filter(s => s.strategy === 'apply_deterministic_fix').length,
    regenerationCount: suggestions.filter(s => s.strategy === 'regenerate_section' || s.strategy === 'strengthen_existing_section').length,
    warnOnlyCount: suggestions.filter(s => s.strategy === 'warn_only').length,
  };
}

// ── Mismatch → Suggestion mapping ──────────────────────────────────────────

let suggestionCounter = 0;

function nextId(): string {
  return `ref-${++suggestionCounter}-${Date.now()}`;
}

function mapMismatchToSuggestion(
  mismatch: ComparisonMismatch,
  design: ExtractedDesign,
  plan: TransformationPlan,
): RefinementSuggestion | null {
  const msg = mismatch.message.toLowerCase();

  // ── Missing hero heading ─────────────────────────────────────────────
  if (mismatch.category === 'hero' && msg.includes('heading') && msg.includes('not found')) {
    return buildHeroHeadingFix(design, plan);
  }

  // ── Missing hero primary CTA ─────────────────────────────────────────
  if (mismatch.category === 'hero' && msg.includes('primary cta') && msg.includes('not found')) {
    return buildHeroCtaFix(design, plan);
  }

  // ── Missing secondary CTA ───────────────────────────────────────────
  if ((mismatch.category === 'hero' || mismatch.category === 'cta') && msg.includes('secondary cta')) {
    return buildSecondaryCTAFix(design, plan, mismatch);
  }

  // ── Missing repeated items ──────────────────────────────────────────
  if (mismatch.category === 'section' && msg.includes('repeated items')) {
    return buildRepeatedItemsFix(mismatch, design, plan);
  }

  // ── Flattened split section ─────────────────────────────────────────
  if (mismatch.category === 'section' && (msg.includes('checklist') || msg.includes('split'))) {
    return buildFlattenedSplitFix(mismatch, design);
  }

  // ── Icon cards flattened ────────────────────────────────────────────
  if (mismatch.category === 'section' && msg.includes('icon card') && msg.includes('flattened')) {
    return buildIconCardFix(mismatch, design);
  }

  // ── Footer too thin ─────────────────────────────────────────────────
  if (mismatch.category === 'footer') {
    return buildFooterFix(design, plan, mismatch);
  }

  // ── Navigation mismatch ─────────────────────────────────────────────
  if (mismatch.category === 'navigation') {
    return buildNavFix(design, plan, mismatch);
  }

  // ── Default/placeholder text ────────────────────────────────────────
  if (mismatch.category === 'content' && msg.includes('default text') || msg.includes('generic')) {
    return buildDefaultTextFix(design, plan, mismatch);
  }

  // ── Section heading not found ───────────────────────────────────────
  if (mismatch.category === 'section' && msg.includes('heading not found')) {
    return buildMissingSectionFix(mismatch, design);
  }

  // ── Catch-all: warn only ────────────────────────────────────────────
  return {
    id: nextId(),
    mismatchKind: `${mismatch.category}_${mismatch.severity}`,
    severity: mismatch.severity,
    message: mismatch.message,
    strategy: 'warn_only',
  };
}

// ── Deterministic fix builders ─────────────────────────────────────────────

function buildHeroHeadingFix(
  design: ExtractedDesign,
  plan: TransformationPlan,
): RefinementSuggestion | null {
  if (!design.hero?.heading) return null;

  // Find hero-related replaceText ops
  const heroTextOps = plan.operations.filter(
    op => op.type === 'replaceText' && (op.label || '').toLowerCase().includes('hero')
  );

  if (heroTextOps.length === 0) {
    // No hero text ops exist — need to find the hero section and add one
    return {
      id: nextId(),
      mismatchKind: 'missing_hero_heading',
      severity: 'error',
      message: `Hero heading "${design.hero.heading}" not bound — will force source content into hero`,
      strategy: 'strengthen_existing_section',
      targetIntent: 'hero',
    };
  }

  // Build replacement ops
  const ops: TransformationOperation[] = [];
  for (const op of heroTextOps) {
    if (op.type !== 'replaceText') continue;
    let heroHtml = `<h1>${design.hero.heading}</h1>`;
    if (design.hero.eyebrow) {
      heroHtml = `<p style="text-transform:uppercase; letter-spacing:0.2em; font-size:14px">${design.hero.eyebrow}</p>${heroHtml}`;
    }
    if (design.hero.subheading) {
      heroHtml += `<p><span style="font-size:20px">${design.hero.subheading}</span></p>`;
    }
    if (design.hero.secondaryCtaText && design.hero.secondaryCtaUrl) {
      heroHtml += `<p><a href="${design.hero.secondaryCtaUrl}" style="font-size:16px; text-decoration:underline">${design.hero.secondaryCtaText}</a></p>`;
    }
    ops.push({
      type: 'replaceText',
      sectionId: op.sectionId,
      blockId: op.blockId,
      key: op.key,
      value: heroHtml,
      label: 'Render-check fix: bind source hero heading',
    });
  }

  return {
    id: nextId(),
    mismatchKind: 'missing_hero_heading',
    severity: 'error',
    message: `Bind source hero heading "${design.hero.heading}" into generated hero`,
    strategy: 'apply_deterministic_fix',
    targetIntent: 'hero',
    proposedOperations: ops,
  };
}

function buildHeroCtaFix(
  design: ExtractedDesign,
  plan: TransformationPlan,
): RefinementSuggestion | null {
  if (!design.hero?.ctaText) return null;

  const heroCtaOps = plan.operations.filter(
    op => op.type === 'updateBlockSetting' && (op as any).key === 'btn_text' &&
      (op.label || '').toLowerCase().includes('hero')
  );

  if (heroCtaOps.length > 0) {
    const ops: TransformationOperation[] = heroCtaOps.map(op => ({
      ...op,
      value: design.hero!.ctaText!,
      label: 'Render-check fix: bind source hero CTA',
    } as TransformationOperation));

    return {
      id: nextId(),
      mismatchKind: 'missing_hero_cta',
      severity: 'warning',
      message: `Bind source hero CTA "${design.hero.ctaText}" into generated hero button`,
      strategy: 'apply_deterministic_fix',
      targetIntent: 'hero',
      proposedOperations: ops,
    };
  }

  return {
    id: nextId(),
    mismatchKind: 'missing_hero_cta',
    severity: 'warning',
    message: `Source hero CTA "${design.hero.ctaText}" not bound — may need section regeneration`,
    strategy: 'strengthen_existing_section',
    targetIntent: 'hero',
  };
}

function buildSecondaryCTAFix(
  design: ExtractedDesign,
  plan: TransformationPlan,
  mismatch: ComparisonMismatch,
): RefinementSuggestion {
  // Secondary CTA is hard to fix deterministically in most Kajabi themes
  // Best strategy: ensure it's in the hero text as an inline link
  if (design.hero?.secondaryCtaText && design.hero?.secondaryCtaUrl) {
    const heroTextOps = plan.operations.filter(
      op => op.type === 'replaceText' && (op.label || '').toLowerCase().includes('hero')
    );

    if (heroTextOps.length > 0) {
      const firstOp = heroTextOps[0];
      if (firstOp.type === 'replaceText') {
        const currentValue = firstOp.value || '';
        // Only add if not already present
        if (!currentValue.includes(design.hero.secondaryCtaText)) {
          const secondaryCta = `<p><a href="${design.hero.secondaryCtaUrl}" style="font-size:16px; text-decoration:underline">${design.hero.secondaryCtaText}</a></p>`;
          const newValue = currentValue + secondaryCta;
          return {
            id: nextId(),
            mismatchKind: 'missing_secondary_cta',
            severity: 'warning',
            message: `Add secondary CTA "${design.hero.secondaryCtaText}" as inline link in hero text`,
            strategy: 'apply_deterministic_fix',
            targetIntent: 'hero',
            proposedOperations: [{
              type: 'replaceText',
              sectionId: firstOp.sectionId,
              blockId: firstOp.blockId,
              key: firstOp.key,
              value: newValue,
              label: 'Render-check fix: add secondary CTA to hero',
            }],
          };
        }
      }
    }
  }

  return {
    id: nextId(),
    mismatchKind: 'missing_secondary_cta',
    severity: 'warning',
    message: mismatch.message,
    strategy: 'warn_only',
  };
}

function buildRepeatedItemsFix(
  mismatch: ComparisonMismatch,
  design: ExtractedDesign,
  plan: TransformationPlan,
): RefinementSuggestion {
  // Find which source section lost items
  const sourceSection = design.sections.find(s => {
    if (!s.heading) return false;
    return mismatch.message.toLowerCase().includes(s.heading.toLowerCase().split(/\s+/).filter(w => w.length > 3)[0] || '___');
  });

  if (sourceSection && (sourceSection.items?.length || 0) > 0) {
    return {
      id: nextId(),
      mismatchKind: 'missing_repeated_items',
      severity: 'warning',
      message: `Section "${sourceSection.heading}" has ${sourceSection.items!.length} source items but rendered fewer — regenerate with full items`,
      strategy: 'regenerate_section',
      targetIntent: sourceSection.intent,
      targetSectionId: sourceSection.id,
    };
  }

  return {
    id: nextId(),
    mismatchKind: 'missing_repeated_items',
    severity: 'warning',
    message: mismatch.message,
    strategy: 'warn_only',
  };
}

function buildFlattenedSplitFix(
  mismatch: ComparisonMismatch,
  design: ExtractedDesign,
): RefinementSuggestion {
  const splitSection = design.sections.find(s => s.intent === 'content_media_split' && s.hasChecklist);
  
  if (splitSection) {
    return {
      id: nextId(),
      mismatchKind: 'flattened_split_section',
      severity: 'warning',
      message: `Split section "${splitSection.heading || 'content split'}" checklist collapsed — regenerate with checklist items preserved`,
      strategy: 'regenerate_section',
      targetIntent: 'content_media_split',
      targetSectionId: splitSection.id,
    };
  }

  return {
    id: nextId(),
    mismatchKind: 'flattened_split_section',
    severity: 'warning',
    message: mismatch.message,
    strategy: 'warn_only',
  };
}

function buildIconCardFix(
  mismatch: ComparisonMismatch,
  design: ExtractedDesign,
): RefinementSuggestion {
  const iconSection = design.sections.find(s => s.intent === 'icon_card_row' && s.hasIcons);

  if (iconSection) {
    return {
      id: nextId(),
      mismatchKind: 'flattened_icon_cards',
      severity: 'warning',
      message: `Icon card section "${iconSection.heading || 'icon cards'}" flattened — regenerate as repeated feature blocks`,
      strategy: 'regenerate_section',
      targetIntent: 'icon_card_row',
      targetSectionId: iconSection.id,
    };
  }

  return {
    id: nextId(),
    mismatchKind: 'flattened_icon_cards',
    severity: 'warning',
    message: mismatch.message,
    strategy: 'warn_only',
  };
}

function buildFooterFix(
  design: ExtractedDesign,
  plan: TransformationPlan,
  mismatch: ComparisonMismatch,
): RefinementSuggestion {
  const ops: TransformationOperation[] = [];

  // Add footer link_lists if missing
  if (design.footer?.linkGroups) {
    const allLinks = Object.values(design.footer.linkGroups).flat();
    if (allLinks.length > 0) {
      const hasFooterNav = plan.operations.some(
        op => op.type === 'updateNavigation' && (op as any).menuId === 'footer-menu'
      );
      if (!hasFooterNav) {
        ops.push({
          type: 'updateNavigation',
          menuId: 'footer-menu',
          links: allLinks,
        } as TransformationOperation);
      }
    }
  }

  if (ops.length > 0) {
    return {
      id: nextId(),
      mismatchKind: 'footer_too_thin',
      severity: 'warning',
      message: `Enrich footer with ${ops.length} source-derived operation(s)`,
      strategy: 'apply_deterministic_fix',
      proposedOperations: ops,
    };
  }

  return {
    id: nextId(),
    mismatchKind: 'footer_too_thin',
    severity: 'info',
    message: mismatch.message,
    strategy: 'warn_only',
  };
}

function buildNavFix(
  design: ExtractedDesign,
  plan: TransformationPlan,
  mismatch: ComparisonMismatch,
): RefinementSuggestion {
  const ops: TransformationOperation[] = [];

  if (design.header?.navItems?.length) {
    const hasMainMenu = plan.operations.some(
      op => op.type === 'updateNavigation' && (op as any).menuId === 'main-menu'
    );
    if (!hasMainMenu) {
      ops.push({
        type: 'updateNavigation',
        menuId: 'main-menu',
        links: design.header.navItems,
      } as TransformationOperation);
    }
  }

  if (ops.length > 0) {
    return {
      id: nextId(),
      mismatchKind: 'menu_mismatch',
      severity: 'warning',
      message: `Add ${design.header?.navItems?.length || 0} source nav items to main-menu`,
      strategy: 'apply_deterministic_fix',
      proposedOperations: ops,
    };
  }

  return {
    id: nextId(),
    mismatchKind: 'menu_mismatch',
    severity: 'warning',
    message: mismatch.message,
    strategy: 'warn_only',
  };
}

function buildDefaultTextFix(
  design: ExtractedDesign,
  plan: TransformationPlan,
  mismatch: ComparisonMismatch,
): RefinementSuggestion {
  // Default text is hard to fix without knowing which section — flag for strengthening
  return {
    id: nextId(),
    mismatchKind: 'default_text_survived',
    severity: 'error',
    message: `${mismatch.message} — source content should replace all default/placeholder text`,
    strategy: 'strengthen_existing_section',
  };
}

function buildMissingSectionFix(
  mismatch: ComparisonMismatch,
  design: ExtractedDesign,
): RefinementSuggestion {
  // Try to find the source section by heading
  const headingMatch = mismatch.message.match(/"([^"]+)"/);
  const heading = headingMatch?.[1];
  const sourceSection = heading
    ? design.sections.find(s => s.heading?.toLowerCase().includes(heading.toLowerCase().split(/\s+/).filter(w => w.length > 3)[0] || '___'))
    : null;

  if (sourceSection) {
    return {
      id: nextId(),
      mismatchKind: 'missing_section',
      severity: 'warning',
      message: `Section "${sourceSection.heading}" (${sourceSection.intent}) not in rendered output — regenerate`,
      strategy: 'regenerate_section',
      targetIntent: sourceSection.intent,
      targetSectionId: sourceSection.id,
    };
  }

  return {
    id: nextId(),
    mismatchKind: 'missing_section',
    severity: 'warning',
    message: mismatch.message,
    strategy: 'warn_only',
  };
}

// ── Apply deterministic suggestions to plan ────────────────────────────────

/**
 * Apply all deterministic refinement suggestions to the current plan.
 * Returns a new operations array with the fixes merged.
 */
export function applyDeterministicRefinements(
  currentOps: TransformationOperation[],
  suggestions: RefinementSuggestion[],
): { operations: TransformationOperation[]; applied: string[] } {
  const applied: string[] = [];
  let ops = [...currentOps];

  for (const suggestion of suggestions) {
    if (suggestion.strategy !== 'apply_deterministic_fix') continue;
    if (!suggestion.proposedOperations?.length) continue;

    for (const proposed of suggestion.proposedOperations) {
      // For replaceText/updateBlockSetting: find and replace existing op
      if (proposed.type === 'replaceText' || proposed.type === 'updateBlockSetting') {
        const idx = ops.findIndex(op =>
          op.type === proposed.type &&
          (op as any).sectionId === (proposed as any).sectionId &&
          (op as any).blockId === (proposed as any).blockId &&
          (op as any).key === (proposed as any).key
        );
        if (idx >= 0) {
          ops[idx] = proposed;
        } else {
          ops.push(proposed);
        }
      } else if (proposed.type === 'updateNavigation') {
        // Replace existing nav op for same menuId, or append
        const idx = ops.findIndex(op =>
          op.type === 'updateNavigation' && (op as any).menuId === (proposed as any).menuId
        );
        if (idx >= 0) {
          ops[idx] = proposed;
        } else {
          ops.push(proposed);
        }
      } else {
        ops.push(proposed);
      }
    }
    applied.push(suggestion.id);
  }

  return { operations: ops, applied };
}
