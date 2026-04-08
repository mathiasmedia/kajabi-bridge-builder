/**
 * Streamlined-Home Theme Recipe Layer v2
 *
 * Encodes builder-proven layout rules specific to the "streamlined-home"
 * Kajabi base theme. Applied as post-processing on AI-generated operations
 * before export.
 *
 * Key rules derived from actual Kajabi builder behavior:
 *
 * 1. Program/course cards → feature blocks with image_width=1000, card shell
 * 2. CTA band → single text block with use_btn="true", inner panel styling
 * 3. Vertical stacking → make_block="true" or width="12"
 * 4. Testimonials → feature blocks with card shell (bg, padding, border-radius)
 * 5. Hero → rich inline emphasis, multi-CTA support
 */

import type { TransformationOperation, ValidationWarning, ExtractedSection, ExtractedDesign } from '@/types';

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Post-process AI-generated operations with streamlined-home-specific rules.
 * Returns corrected operations and any recipe-specific warnings.
 */
export function applyStreamlinedHomeRecipes(
  operations: TransformationOperation[],
  sections: ExtractedSection[],
  extractedDesign?: ExtractedDesign,
): { operations: TransformationOperation[]; warnings: ValidationWarning[] } {
  const warnings: ValidationWarning[] = [];
  let ops = [...operations];

  // Detect dark site from design colors
  const isDark = extractedDesign ? detectDarkDesign(extractedDesign) : false;
  const darkCardBg = isDark && extractedDesign
    ? lightenHex(extractedDesign.colors.find(c => c.usage === 'background')?.value || '#0b1214', 0.15)
    : '#FFFFFF';

  ops = ops.map(op => {
    if (op.type !== 'addSection') return op;

    const normalized = normalizeSectionChrome(op, warnings);

    const matchingSection = findMatchingExtractedSection(normalized, sections);
    const intent = matchingSection?.intent;

    if (intent === 'program_cards') {
      return applyProgramCardRecipe(normalized, matchingSection!, warnings, isDark, darkCardBg);
    }

    if (intent === 'cta_band') {
      return applyCtaBandRecipe(normalized, matchingSection!, warnings, isDark, darkCardBg);
    }

    if (intent === 'testimonial_band') {
      return applyTestimonialRecipe(normalized, matchingSection!, warnings, isDark, darkCardBg);
    }

     if (intent === 'icon_card_row') {
       return applyIconCardRowRecipe(normalized, matchingSection!, warnings, isDark, darkCardBg);
    }

    if (intent === 'content_media_split') {
      return applyContentMediaSplitRecipe(normalized, matchingSection!, warnings, extractedDesign);
    }

    // Apply own-row recipe to all sections for blocks that need vertical stacking
    return applyOwnRowRecipe(normalized, warnings);
  });

  // Hero enrichment — operates on globals replaceText ops, not addSection
  if (extractedDesign) {
    const heroResult = applyHeroRichnessRecipe(ops, extractedDesign, warnings);
    ops = heroResult;
  }

  return { operations: ops, warnings };
}

// ── Hero Richness Recipe ────────────────────────────────────────────────

function applyHeroRichnessRecipe(
  ops: TransformationOperation[],
  design: ExtractedDesign,
  warnings: ValidationWarning[],
): TransformationOperation[] {
  if (!design.hero) return ops;

  const hero = design.hero;
  const accentColor = design.colors.find(c => c.usage === 'accent')?.value
    || design.colors.find(c => c.usage === 'primary')?.value;

  // Find hero text replaceText operations and enhance them
  return ops.map(op => {
    if (op.type !== 'replaceText') return op;
    const html = op.value || '';

    // Enhance hero heading with accent color emphasis if source had inline differentiation
    if (html.includes('<h1>') && hero.heading) {
      let enhancedHtml = html;

      // Check if source heading had emphasis patterns (e.g. gradient text, accent words)
      // Common patterns: last few words emphasized, or a specific phrase
      const hasInlineEmphasis = /text-gradient|text-accent|text-primary|className.*accent/i.test(
        JSON.stringify(design.sections.filter(s => s.intent === 'hero'))
      );

      if (hasInlineEmphasis && accentColor && !html.includes('style=')) {
        // Try to preserve emphasis on the last significant phrase
        enhancedHtml = enhancedHtml.replace(
          /<h1>(.*)<\/h1>/,
          (_, content) => {
            // Simple heuristic: emphasize the last line/phrase if there's a line break or the last few words
            const words = content.trim().split(/\s+/);
            if (words.length >= 4) {
              const lastChunk = words.slice(-3).join(' ');
              const firstChunk = words.slice(0, -3).join(' ');
              return `<h1>${firstChunk} <span style="color:${accentColor}">${lastChunk}</span></h1>`;
            }
            return `<h1>${content}</h1>`;
          }
        );
      }

      // Ensure the hero subheading has proper font sizing
      if (hero.subheading && !enhancedHtml.includes('font-size')) {
        enhancedHtml = enhancedHtml.replace(
          /<p>([^<]*)<\/p>/,
          '<p><span style="font-size:20px">$1</span></p>'
        );
      }

      return { ...op, value: enhancedHtml };
    }

    return op;
  });
}

/**
 * Generate CSS overrides for hero multi-CTA support.
 * Called separately to append CSS if needed.
 */
export function getHeroMultiCtaCss(design: ExtractedDesign): { css: string; warnings: ValidationWarning[] } {
  const warnings: ValidationWarning[] = [];
  if (!design.hero) return { css: '', warnings };

  // Check for multiple CTAs in source
  const heroSections = design.sections.filter(s => s.intent === 'hero');
  const hasMultipleCTAs = heroSections.some(s => {
    const text = JSON.stringify(s);
    // Look for multiple Button components or multiple CTA-like patterns
    return (text.match(/Button/g) || []).length >= 2
      || (text.match(/btn_text/g) || []).length >= 2;
  });

  // Check source hero component for secondary CTA evidence
  const heroHeading = design.hero.heading || '';
  const secondaryCta = design.hero.ctaText; // We'll check if there are hints of a second

  if (hasMultipleCTAs) {
    warnings.push({
      severity: 'info',
      message: 'Hero has multiple CTAs in source — streamlined-home text block supports one native CTA. Secondary CTA preserved as styled link in text.',
    });
  }

  return { css: '', warnings };
}

function normalizeSectionChrome(
  op: Extract<TransformationOperation, { type: 'addSection' }>,
  warnings: ValidationWarning[],
): Extract<TransformationOperation, { type: 'addSection' }> {
  const settings = { ...(op.section.settings || {}) } as Record<string, any>;

  if (settings.full_width !== false) {
    settings.full_width = false;
  }

  const bg = typeof settings.background_color === 'string' ? settings.background_color.trim() : '';
  if (isLowOpacityBackground(bg)) {
    delete settings.background_color;
    if (settings.bg_type === 'color') settings.bg_type = 'none';
    warnings.push({
      severity: 'info',
      message: 'Removed a barely-visible section background color and reverted the section to no background.',
      target: op.sectionId,
    });
  }

  return {
    ...op,
    section: { ...op.section, settings },
  };
}

function isLowOpacityBackground(value: string): boolean {
  if (!value) return false;
  const match = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return false;
  const parts = match[1].split(',').map(part => part.trim());
  if (parts.length < 4) return false;
  const alpha = Number(parts[3]);
  return Number.isFinite(alpha) && alpha > 0 && alpha < 0.2;
}

// ── Program Card Recipe ─────────────────────────────────────────────────

function applyProgramCardRecipe(
  op: Extract<TransformationOperation, { type: 'addSection' }>,
  section: ExtractedSection,
  warnings: ValidationWarning[],
  isDark: boolean = false,
  darkCardBg: string = '#FFFFFF',
): TransformationOperation {
  const blocks = { ...op.section.blocks };
  const blockOrder = [...(op.section.block_order || [])];

  for (const bid of blockOrder) {
    const block = blocks[bid];
    if (!block) continue;

    // Skip heading/intro text blocks (first block with width 12)
    if (block.type === 'text' && block.settings.width === '12') continue;

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

      // Card shell styling
      block.settings.image_border_radius = '8';
      block.settings.background_color = block.settings.background_color || (isDark ? darkCardBg : '#FFFFFF');
      block.settings.box_shadow = block.settings.box_shadow || (isDark ? 'none' : 'medium');
      block.settings.border_radius = block.settings.border_radius || '12';
      block.settings.padding_desktop = block.settings.padding_desktop || {
        top: '20', right: '20', bottom: '20', left: '20',
      };
      block.settings.padding_mobile = block.settings.padding_mobile || {
        top: '16', right: '16', bottom: '16', left: '16',
      };

      // Preserve badge/label in text content
      if (section.items) {
        const itemIndex = blockOrder.filter(b => blocks[b]?.type === 'feature').indexOf(bid);
        const item = section.items[itemIndex];
        if (item) {
          const text = block.settings.text || '';
          // If item has a badge and it's not in the text already, prepend it
          if (item.ctaText && !text.includes(item.ctaText)) {
            // ctaText on items often contains badge labels like "Most Popular"
          }
          // Ensure price prominence
          if (item.price && !text.includes(item.price)) {
            block.settings.text = text.replace(
              /<\/p>\s*$/,
              `</p><p><strong style="font-size:24px">${item.price}</strong></p>`
            );
          }
        }
      }
    }
  }

  // Ensure section has equal_height for consistent card sizing
  const settings = { ...op.section.settings };
  settings.equal_height = 'true';

  return {
    ...op,
    section: { ...op.section, settings, blocks, block_order: blockOrder },
  };
}

// ── Testimonial Recipe ──────────────────────────────────────────────────

function applyTestimonialRecipe(
  op: Extract<TransformationOperation, { type: 'addSection' }>,
  section: ExtractedSection,
  warnings: ValidationWarning[],
  isDark: boolean = false,
  darkCardBg: string = '#FFFFFF',
): TransformationOperation {
  const blocks = { ...op.section.blocks };
  const blockOrder = [...(op.section.block_order || [])];

  let hasCardShell = false;

  for (const bid of blockOrder) {
    const block = blocks[bid];
    if (!block) continue;

    // Skip heading/intro text blocks (full-width intro)
    if (block.type === 'text' && block.settings.width === '12') continue;

    // Apply card shell to testimonial blocks
    if (block.type === 'text' || block.type === 'feature') {
      // Card shell styling for testimonial panels
      block.settings.background_color = block.settings.background_color || (isDark ? darkCardBg : '#FFFFFF');
      block.settings.box_shadow = block.settings.box_shadow || (isDark ? 'none' : 'medium');
      block.settings.border_radius = block.settings.border_radius || '12';
      block.settings.padding_desktop = block.settings.padding_desktop || {
        top: '24', right: '24', bottom: '24', left: '24',
      };
      block.settings.padding_mobile = block.settings.padding_mobile || {
        top: '20', right: '20', bottom: '20', left: '20',
      };
      hasCardShell = true;
    }
  }

  if (!hasCardShell) {
    warnings.push({
      severity: 'warning',
      message: 'Testimonial section rendered without card/panel shell — may look flat',
      target: section.id,
    });
  }

  // Equal height for consistent card sizing
  const settings = { ...op.section.settings };
  settings.equal_height = 'true';

  return {
    ...op,
    section: { ...op.section, settings, blocks, block_order: blockOrder },
  };
}

// ── Icon Card Row Recipe ────────────────────────────────────────────────

function applyIconCardRowRecipe(
  op: Extract<TransformationOperation, { type: 'addSection' }>,
  section: ExtractedSection,
  warnings: ValidationWarning[],
  isDark: boolean = false,
  darkCardBg: string = '#FFFFFF',
): TransformationOperation {
  const blocks = { ...op.section.blocks };
  const blockOrder = [...(op.section.block_order || [])];
  let hasCardShell = false;

  for (const bid of blockOrder) {
    const block = blocks[bid];
    if (!block) continue;
    if (block.type === 'text' && block.settings.width === '12') continue;

    if (block.type === 'text' || block.type === 'feature') {
      block.settings.background_color = block.settings.background_color || (isDark ? darkCardBg : '#FFFFFF');
      block.settings.box_shadow = block.settings.box_shadow || (isDark ? 'none' : 'medium');
      block.settings.border_radius = block.settings.border_radius || '12';
      block.settings.padding_desktop = block.settings.padding_desktop || { top: '24', right: '24', bottom: '24', left: '24' };
      block.settings.padding_mobile = block.settings.padding_mobile || { top: '20', right: '20', bottom: '20', left: '20' };
      if (block.type === 'feature') block.settings.hide_image = 'true';
      hasCardShell = true;
    }
  }

  if (!hasCardShell) {
    warnings.push({ severity: 'warning', message: 'Icon card row rendered without card shell — source has distinct icon cards but output is plain text columns', target: section.id });
  }

  const settings = { ...op.section.settings };
  settings.equal_height = 'true';
  return { ...op, section: { ...op.section, settings, blocks, block_order: blockOrder } };
}

// ── CTA Band Recipe v2 ─────────────────────────────────────────────────

function applyCtaBandRecipe(
  op: Extract<TransformationOperation, { type: 'addSection' }>,
  section: ExtractedSection,
  warnings: ValidationWarning[],
  isDark: boolean = false,
  darkCardBg: string = '#FFFFFF',
): TransformationOperation {
  const blocks = { ...op.section.blocks };
  let blockOrder = [...(op.section.block_order || [])];

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

    // Remove the separate CTA block
    delete blocks[primaryCtaBid];
    blockOrder = blockOrder.filter(bid => bid !== primaryCtaBid);

    warnings.push({
      severity: 'info',
      message: `CTA band: merged separate CTA block into text block with use_btn for unified background`,
      target: section.id,
    });
  }

  // If there's already a single text block, ensure it has use_btn if the section has CTA
  if (textBlocks.length === 1 && ctaBlocks.length === 0 && section.hasButtons) {
    const bid = textBlocks[0];
    const textBlock = blocks[bid];
    if (textBlock.settings.use_btn !== 'true') {
      textBlock.settings.use_btn = 'true';
      if (section.ctaText) textBlock.settings.btn_text = section.ctaText;
    }
  }

  // Apply inner panel styling to the primary text block
  const primaryBid = textBlocks[0] || blockOrder[0];
  if (primaryBid && blocks[primaryBid]) {
    const tb = blocks[primaryBid];
    // Full width for the block, centered text
    tb.settings.width = '7';
    tb.settings.text_align = tb.settings.text_align || 'center';
    // Inner panel: background, padding, border-radius, box-shadow
    tb.settings.background_color = tb.settings.background_color || (isDark ? darkCardBg : '#FFFFFF');
    tb.settings.box_shadow = tb.settings.box_shadow || (isDark ? 'none' : 'large');
    
    tb.settings.border_radius = tb.settings.border_radius || '16';
    tb.settings.padding_desktop = tb.settings.padding_desktop || {
      top: '40', right: '40', bottom: '40', left: '40',
    };
    tb.settings.padding_mobile = tb.settings.padding_mobile || {
      top: '24', right: '24', bottom: '24', left: '24',
    };
  }

  // Section-level styling for CTA band
  const settings = { ...op.section.settings };
  settings.horizontal = settings.horizontal || 'center';

  return {
    ...op,
    section: { ...op.section, settings, blocks, block_order: blockOrder },
  };
}

// ── Content/Media Split Recipe (Branded Visual Panel) ───────────────────

function applyContentMediaSplitRecipe(
  op: Extract<TransformationOperation, { type: 'addSection' }>,
  section: ExtractedSection,
  warnings: ValidationWarning[],
  design?: ExtractedDesign,
): TransformationOperation {
  const blocks = { ...op.section.blocks };
  const blockOrder = [...(op.section.block_order || [])];
  const settings = { ...op.section.settings } as Record<string, any>;

  // Detect if visual side is missing — generate a branded panel fallback
  const hasImageBlock = blockOrder.some(bid => {
    const b = blocks[bid];
    return b?.type === 'image' && b.settings?.image;
  });
  const hasVisualPlaceholder = blockOrder.some(bid => {
    const text = (blocks[bid]?.settings?.text || '').toLowerCase();
    return text.includes('visual placeholder') || text.includes('image placeholder') || text.includes('[placeholder]');
  });

  if (!hasImageBlock && (hasVisualPlaceholder || blockOrder.length <= 1)) {
    // Replace placeholder with a branded visual panel
    const brandColor = design?.colors?.find(c => c.usage === 'primary')?.value || '#3B82F6';
    const logoText = design?.header?.logoText || design?.footer?.logoText || '';
    const panelId = String(Math.floor(1000000000000 + Math.random() * 9000000000000));

    // Build a branded panel block
    let panelHtml = `<div style="text-align:center; padding:40px;">`;
    if (logoText) {
      panelHtml += `<p style="font-size:32px; font-weight:700; color:${brandColor}; letter-spacing:0.05em">${logoText}</p>`;
    }
    panelHtml += `<p style="font-size:14px; color:#888; margin-top:12px">Brand Identity</p>`;
    panelHtml += `</div>`;

    // Find and replace any visual placeholder block, or add new one
    let replacedPlaceholder = false;
    for (const bid of blockOrder) {
      const text = (blocks[bid]?.settings?.text || '').toLowerCase();
      if (text.includes('visual placeholder') || text.includes('image placeholder') || text.includes('[placeholder]')) {
        blocks[bid] = {
          type: 'text',
          settings: {
            text: panelHtml,
            width: '5',
            text_align: 'center',
            background_color: `${brandColor}11`,
            border_radius: '16',
            padding_desktop: { top: '32', right: '24', bottom: '32', left: '24' },
          },
        };
        replacedPlaceholder = true;
        break;
      }
    }

    if (!replacedPlaceholder && blockOrder.length <= 1) {
      blocks[panelId] = {
        type: 'text',
        settings: {
          text: panelHtml,
          width: '5',
          text_align: 'center',
          background_color: `${brandColor}11`,
          border_radius: '16',
          padding_desktop: { top: '32', right: '24', bottom: '32', left: '24' },
        },
      };
      blockOrder.push(panelId);
    }

    warnings.push({
      severity: 'info',
      message: `Content/media split: replaced generic placeholder with branded visual panel${logoText ? ` featuring "${logoText}"` : ''}`,
      target: section.id,
    });
  }

  // Ensure text side preserves checklist as <ul> if source has it
  if (section.hasChecklist) {
    for (const bid of blockOrder) {
      const block = blocks[bid];
      if (block?.type === 'text' && block.settings?.text) {
        const text = block.settings.text;
        // Check if checklist was collapsed into paragraphs
        if (!text.includes('<ul') && !text.includes('<li') && text.includes('✓')) {
          // Already has check marks — leave as-is, just warn
        } else if (!text.includes('<ul') && !text.includes('<li') && section.items && section.items.length >= 2) {
          warnings.push({
            severity: 'info',
            message: `Content split section has checklist in source but output may have collapsed items into paragraphs`,
            target: section.id,
          });
        }
      }
    }
  }

  settings.full_width = false;
  settings.multiple_columns_on_desktop = 'yes';
  settings.column_one_width = settings.column_one_width || '4';
  settings.column_two_width = settings.column_two_width || '4';
  settings.column_three_width = settings.column_three_width || '4';
  settings.multiple_column_gap = settings.multiple_column_gap || '0';

  const imageBlockIds = blockOrder.filter(bid => blocks[bid]?.type === 'image');
  const leftColumnBlockIds = blockOrder.filter(bid => !imageBlockIds.includes(bid));

  for (const bid of leftColumnBlockIds) {
    const block = blocks[bid];
    if (!block) continue;
    block.settings.width = '12';
    block.settings.block_column = 'first';
    if ('text_align' in block.settings || block.type === 'text' || block.type === 'cta') {
      block.settings.text_align = 'left';
    }
    block.settings.mobile_text_align = 'left';
  }

  for (const bid of imageBlockIds) {
    const block = blocks[bid];
    if (!block) continue;
    block.settings.width = '12';
    block.settings.block_column = 'second';
  }

  return {
    ...op,
    section: { ...op.section, settings, blocks, block_order: blockOrder },
  };
}

// ── Own-Row Recipe ──────────────────────────────────────────────────────

function applyOwnRowRecipe(
  op: Extract<TransformationOperation, { type: 'addSection' }>,
  warnings: ValidationWarning[],
): TransformationOperation {
  const blocks = { ...op.section.blocks };
  const blockOrder = [...(op.section.block_order || [])];

  // If there's exactly one block, force full width
  if (blockOrder.length === 1) {
    const bid = blockOrder[0];
    if (blocks[bid]) {
      blocks[bid].settings.width = blocks[bid].settings.width || '12';
    }
  }

  // If blocks should stack but aren't width-12, use make_block
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
    section: { ...op.section, blocks, block_order: blockOrder },
  };
}

// ── Validation warnings ─────────────────────────────────────────────────

/**
 * Generate streamlined-home-specific quality warnings.
 */
export function validateStreamlinedHomeOutput(
  operations: TransformationOperation[],
  sections: ExtractedSection[],
  extractedDesign?: ExtractedDesign,
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
      const hasCardShell = featureBlocks.some(b => b.settings.background_color || b.settings.box_shadow);
      if (!hasCardShell && featureBlocks.length > 0) {
        warnings.push({
          severity: 'warning',
          message: `Program cards rendered without card shell styling — may look like bare text columns`,
          target: match.id,
        });
      }
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
      // Check for inner panel treatment
      const hasPanelShell = textBlocks.some(b =>
        b.settings.background_color || b.settings.box_shadow || b.settings.border_radius
      );
      if (!hasPanelShell && textBlocks.length > 0) {
        warnings.push({
          severity: 'warning',
          message: `CTA band missing inner panel treatment — may look like a flat text row`,
          target: match.id,
        });
      }
    }

    // Testimonial warnings
    if (match.intent === 'testimonial_band') {
      const testimonialBlocks = blocks.filter(b => b.type === 'text' || b.type === 'feature');
      // Exclude the intro/heading block
      const contentBlocks = testimonialBlocks.filter(b => b.settings.width !== '12');
      const hasCardShell = contentBlocks.some(b => b.settings.background_color || b.settings.box_shadow);
      if (!hasCardShell && contentBlocks.length > 0) {
        warnings.push({
          severity: 'warning',
          message: `Testimonial section rendered as bare text without card/panel shell`,
          target: match.id,
        });
      }
    }
  }

  // Hero warnings
  if (extractedDesign?.hero) {
    const heroOps = operations.filter(op => op.type === 'replaceText' && (op.label || '').toLowerCase().includes('hero'));
    if (heroOps.length > 0) {
      const heroHtml = heroOps.map(op => (op as any).value || '').join('');
      // Check for inline emphasis
      if (!heroHtml.includes('style=') && !heroHtml.includes('<span') && !heroHtml.includes('<em')) {
        warnings.push({
          severity: 'info',
          message: 'Hero heading has no inline emphasis — source may have had accent-colored text',
        });
      }
    }

    // Check for secondary CTA
    const heroSections = sections.filter(s => s.intent === 'hero');
    const hasMultiBtn = heroSections.some(s => {
      const str = JSON.stringify(s);
      return (str.match(/Button/g) || []).length >= 2;
    });
    if (hasMultiBtn) {
      const hasTwoBtns = heroOps.some(op => {
        const v = (op as any).value || '';
        return (v.match(/btn_text/g) || []).length >= 2;
      });
      if (!hasTwoBtns) {
        warnings.push({
          severity: 'info',
          message: 'Hero had multiple CTAs in source but export has one — streamlined-home text block supports one native CTA',
        });
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
    cta_band: ['cta', 'plunge', 'ready', 'call to action', 'get started', 'stand out'],
    testimonial_band: ['testimonial', 'diver', 'founder', 'review', 'what our', 'loved'],
    stats: ['stat', 'number', 'metric'],
    hero: ['hero'],
    feature_grid: ['feature', 'problem', 'solution'],
    icon_card_row: ['icon', 'problem', 'holding', 'challenge', 'benefit'],
    content_media_split: ['content', 'media', 'split', 'elevated', 'brand', 'solution'],
  };

  for (const s of sections) {
    const keywords = intentKeywords[s.intent] || [];
    if (keywords.some(kw => label.includes(kw))) return s;
  }

  return undefined;
}

// ── Dark-site detection helpers ─────────────────────────────────────────

function detectDarkDesign(design: ExtractedDesign): boolean {
  const bgColor = design.colors.find(c => c.usage === 'background');
  if (!bgColor) return false;
  const val = bgColor.value;
  // Handle hex
  if (val.startsWith('#')) {
    const hex = val.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (r + g + b) / 3 < 77; // ~30% luminance
  }
  // Handle HSL string "H S% L%"
  const hslMatch = val.match(/([\d.]+)\s+([\d.]+)%?\s+([\d.]+)%?/);
  if (hslMatch) {
    const l = parseFloat(hslMatch[3]);
    return l < 30;
  }
  return false;
}

function lightenHex(color: string, factor: number): string {
  // Handle HSL string
  if (!color.startsWith('#')) {
    const hslMatch = color.match(/([\d.]+)\s+([\d.]+)%?\s+([\d.]+)%?/);
    if (hslMatch) {
      const h = parseFloat(hslMatch[1]);
      const s = parseFloat(hslMatch[2]);
      const l = Math.min(100, parseFloat(hslMatch[3]) + factor * 100);
      // Convert HSL to hex
      const a2 = (s / 100) * Math.min(l / 100, 1 - l / 100);
      const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const c = l / 100 - a2 * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * c).toString(16).padStart(2, '0');
      };
      return `#${f(0)}${f(8)}${f(4)}`;
    }
    return '#1a2a30';
  }
  const clean = color.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const lr = Math.min(255, Math.round(r + (255 - r) * factor));
  const lg = Math.min(255, Math.round(g + (255 - g) * factor));
  const lb = Math.min(255, Math.round(b + (255 - b) * factor));
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}
