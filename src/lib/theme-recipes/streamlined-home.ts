/**
 * Streamlined-Home Theme Recipe Layer
 *
 * Encodes builder-proven layout rules specific to the "streamlined-home"
 * Kajabi base theme. Applied as post-processing on AI-generated operations
 * before export.
 *
 * Key rules derived from actual Kajabi builder behavior:
 *
 * 1. Program/course cards → feature blocks with image_width=1000
 * 2. CTA band → single text block with use_btn="true" (not split text+CTA)
 * 3. Vertical stacking → make_block="true" or width="12"
 */

import type { TransformationOperation, ValidationWarning, ExtractedSection } from '@/types';

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Post-process AI-generated operations with streamlined-home-specific rules.
 * Returns corrected operations and any recipe-specific warnings.
 */
export function applyStreamlinedHomeRecipes(
  operations: TransformationOperation[],
  sections: ExtractedSection[],
): { operations: TransformationOperation[]; warnings: ValidationWarning[] } {
  const warnings: ValidationWarning[] = [];
  let ops = [...operations];

  ops = ops.map(op => {
    if (op.type !== 'addSection') return op;

    const matchingSection = findMatchingExtractedSection(op, sections);
    const intent = matchingSection?.intent;

    if (intent === 'program_cards') {
      const result = applyProgramCardRecipe(op, matchingSection!, warnings);
      return result;
    }

    if (intent === 'cta_band') {
      const result = applyCtaBandRecipe(op, matchingSection!, warnings);
      return result;
    }

    // Apply own-row recipe to all sections for blocks that need vertical stacking
    return applyOwnRowRecipe(op, warnings);
  });

  return { operations: ops, warnings };
}

// ── Program Card Recipe ─────────────────────────────────────────────────

function applyProgramCardRecipe(
  op: Extract<TransformationOperation, { type: 'addSection' }>,
  section: ExtractedSection,
  warnings: ValidationWarning[],
): TransformationOperation {
  const blocks = op.section.blocks || {};
  const blockOrder = op.section.block_order || [];

  for (const bid of blockOrder) {
    const block = blocks[bid];
    if (!block) continue;

    // Convert to feature type if not already
    if (block.type === 'text' || block.type === 'feature') {
      block.type = 'feature';

      // Set large image width (default is 50px which is too small)
      const currentWidth = parseInt(block.settings.image_width || '50', 10);
      if (currentWidth < 200) {
        if (block.settings.image_width && currentWidth > 50) {
          warnings.push({
            severity: 'info',
            message: `Program card block "${bid}" image_width was ${currentWidth}px — upgraded to 1000px for streamlined-home`,
            target: section.id,
          });
        }
        block.settings.image_width = '1000';
      }

      // Ensure images are visible
      if (block.settings.hide_image === 'true') {
        block.settings.hide_image = 'false';
        warnings.push({
          severity: 'warning',
          message: `Program card block "${bid}" had hide_image=true — forced visible`,
          target: section.id,
        });
      }

      // Ensure image_border_radius is reasonable
      if (!block.settings.image_border_radius || parseInt(block.settings.image_border_radius, 10) > 50) {
        block.settings.image_border_radius = '8';
      }
    }
  }

  return {
    ...op,
    section: { ...op.section, blocks: { ...blocks }, block_order: [...blockOrder] },
  };
}

// ── CTA Band Recipe ─────────────────────────────────────────────────────

function applyCtaBandRecipe(
  op: Extract<TransformationOperation, { type: 'addSection' }>,
  section: ExtractedSection,
  warnings: ValidationWarning[],
): TransformationOperation {
  const blocks = op.section.blocks || {};
  const blockOrder = [...(op.section.block_order || [])];

  // Detect split text + CTA pattern: a text block followed by a separate CTA block
  const textBlocks = blockOrder.filter(bid => blocks[bid]?.type === 'text');
  const ctaBlocks = blockOrder.filter(bid => blocks[bid]?.type === 'cta');

  if (textBlocks.length >= 1 && ctaBlocks.length >= 1) {
    // Merge CTA into the first text block
    const primaryTextBid = textBlocks[0];
    const primaryCtaBid = ctaBlocks[0];
    const textBlock = blocks[primaryTextBid];
    const ctaBlock = blocks[primaryCtaBid];

    // Enable CTA inside the text block
    textBlock.settings.use_btn = 'true';
    if (ctaBlock.settings.btn_text) textBlock.settings.btn_text = ctaBlock.settings.btn_text;
    if (ctaBlock.settings.btn_action) textBlock.settings.btn_action = ctaBlock.settings.btn_action;
    if (ctaBlock.settings.btn_background_color) textBlock.settings.btn_background_color = ctaBlock.settings.btn_background_color;
    if (ctaBlock.settings.btn_text_color) textBlock.settings.btn_text_color = ctaBlock.settings.btn_text_color;
    if (ctaBlock.settings.btn_style) textBlock.settings.btn_style = ctaBlock.settings.btn_style;

    // Make the text block full-width for unified background
    textBlock.settings.width = '12';
    textBlock.settings.text_align = textBlock.settings.text_align || 'center';

    // Remove the separate CTA block
    delete blocks[primaryCtaBid];
    const newOrder = blockOrder.filter(bid => bid !== primaryCtaBid);

    warnings.push({
      severity: 'info',
      message: `CTA band: merged separate CTA block into text block with use_btn for unified background`,
      target: section.id,
    });

    return {
      ...op,
      section: { ...op.section, blocks: { ...blocks }, block_order: newOrder },
    };
  }

  // If there's already a single text block, ensure it has use_btn if the section has CTA
  if (textBlocks.length === 1 && ctaBlocks.length === 0 && section.hasButtons) {
    const bid = textBlocks[0];
    const textBlock = blocks[bid];
    if (textBlock.settings.use_btn !== 'true') {
      textBlock.settings.use_btn = 'true';
      if (section.ctaText) textBlock.settings.btn_text = section.ctaText;
    }
    // Ensure full width for centered CTA layout
    textBlock.settings.width = '12';
    textBlock.settings.text_align = textBlock.settings.text_align || 'center';
  }

  return {
    ...op,
    section: { ...op.section, blocks: { ...blocks }, block_order: [...blockOrder] },
  };
}

// ── Own-Row Recipe ──────────────────────────────────────────────────────

function applyOwnRowRecipe(
  op: Extract<TransformationOperation, { type: 'addSection' }>,
  warnings: ValidationWarning[],
): TransformationOperation {
  const blocks = op.section.blocks || {};
  const blockOrder = op.section.block_order || [];

  // If there's exactly one block, force full width
  if (blockOrder.length === 1) {
    const bid = blockOrder[0];
    if (blocks[bid]) {
      blocks[bid].settings.width = blocks[bid].settings.width || '12';
    }
  }

  // If blocks should stack but aren't width-12, use make_block
  // Detect: multiple blocks all with width > 6 that would awkwardly wrap
  for (let i = 1; i < blockOrder.length; i++) {
    const bid = blockOrder[i];
    const block = blocks[bid];
    if (!block) continue;

    const width = parseInt(block.settings.width || '12', 10);
    const prevBid = blockOrder[i - 1];
    const prevBlock = blocks[prevBid];
    const prevWidth = parseInt(prevBlock?.settings?.width || '12', 10);

    // If two adjacent blocks would overflow a 12-col row, force make_block
    if (prevWidth + width > 12 && width < 12) {
      block.settings.make_block = 'true';
    }
  }

  return {
    ...op,
    section: { ...op.section, blocks: { ...blocks }, block_order: [...blockOrder] },
  };
}

// ── Validation warnings ─────────────────────────────────────────────────

/**
 * Generate streamlined-home-specific quality warnings.
 */
export function validateStreamlinedHomeOutput(
  operations: TransformationOperation[],
  sections: ExtractedSection[],
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const addOps = operations.filter(
    (op): op is Extract<TransformationOperation, { type: 'addSection' }> => op.type === 'addSection',
  );

  for (const op of addOps) {
    const match = findMatchingExtractedSection(op, sections);
    if (!match) continue;

    const blocks = Object.values(op.section.blocks || {});

    // Program card warnings
    if (match.intent === 'program_cards') {
      const featureBlocks = blocks.filter(b => b.type === 'feature');
      for (const fb of featureBlocks) {
        const imgWidth = parseInt(fb.settings.image_width || '50', 10);
        if (imgWidth < 200) {
          warnings.push({
            severity: 'warning',
            message: `Program card feature block has image_width=${imgWidth}px — too small for streamlined-home (need ≥200, prefer 1000)`,
            target: match.id,
          });
        }
        if (fb.settings.hide_image === 'true' && match.hasImages) {
          warnings.push({
            severity: 'warning',
            message: `Program card feature block has images hidden despite source having images`,
            target: match.id,
          });
        }
      }
    }

    // CTA band warnings
    if (match.intent === 'cta_band') {
      const textBlocks = blocks.filter(b => b.type === 'text');
      const ctaBlocks = blocks.filter(b => b.type === 'cta');
      if (textBlocks.length > 0 && ctaBlocks.length > 0) {
        warnings.push({
          severity: 'warning',
          message: `CTA band has split text + CTA blocks — should use unified text block with use_btn for streamlined-home`,
          target: match.id,
        });
      }
    }

    // Stacking warnings
    const blockList = op.section.block_order || [];
    let runningWidth = 0;
    for (const bid of blockList) {
      const b = op.section.blocks[bid];
      if (!b) continue;
      const w = parseInt(b.settings.width || '12', 10);
      if (b.settings.make_block === 'true') {
        runningWidth = w;
      } else {
        runningWidth += w;
        if (runningWidth > 12) {
          // Wrapping would occur — not necessarily wrong but flag if blocks are close
          runningWidth = w;
        }
      }
    }
  }

  return warnings;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function findMatchingExtractedSection(
  op: Extract<TransformationOperation, { type: 'addSection' }>,
  sections: ExtractedSection[],
): ExtractedSection | undefined {
  const label = (op.label || '').toLowerCase();

  // Try intent-based match
  for (const s of sections) {
    if (label.includes(s.intent.replace('_', ' '))) return s;
    if (s.heading && label.includes(s.heading.toLowerCase().slice(0, 20))) return s;
  }

  // Try keyword match
  const intentKeywords: Record<string, string[]> = {
    program_cards: ['program', 'course', 'depth', 'offering'],
    cta_band: ['cta', 'plunge', 'ready', 'call to action', 'get started'],
    testimonial_band: ['testimonial', 'diver', 'founder', 'review'],
    stats: ['stat', 'number', 'metric'],
    hero: ['hero'],
    feature_grid: ['feature', 'problem', 'solution'],
    content_media_split: ['content', 'media', 'split', 'elevated'],
  };

  for (const s of sections) {
    const keywords = intentKeywords[s.intent] || [];
    if (keywords.some(kw => label.includes(kw))) return s;
  }

  return undefined;
}
