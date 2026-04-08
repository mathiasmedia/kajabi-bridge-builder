// Pre-export validation and auto-fix pipeline for Kajabi theme exports.
// Runs before zip creation. Produces errors (block export), warnings, and auto-fixes applied.

import type { KajabiThemeData } from '@/types';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  autoFixes: string[];
  ready: boolean;
}

// Known Kajabi field name corrections
const FIELD_RENAMES: Record<string, string> = {
  btn_url: 'btn_action',
  button_url: 'btn_action',
  button_link: 'btn_action',
  image_link: 'img_action',
  image_url: 'img_action',
};

// Section types that belong in layout, not in content_for_* arrays
const LAYOUT_SECTION_TYPES = new Set(['header', 'footer']);

/**
 * Validate and auto-fix settingsData.current in-place before zip creation.
 * Returns a report of what was found and fixed.
 */
export function validateAndFix(
  settingsData: { current: Record<string, any> },
  theme: KajabiThemeData,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const autoFixes: string[] = [];
  const current = settingsData.current;

  if (!current || typeof current !== 'object') {
    errors.push('settings_data.current is missing or not an object.');
    return { errors, warnings, autoFixes, ready: false };
  }

  // ── 1. Fix and validate content_for_* arrays ──
  fixContentForArrays(current, autoFixes, errors);

  // ── 2. Validate and fix sections ──
  fixSections(current, autoFixes, errors, warnings, theme);

  // ── 3. Ensure content_for_* only reference surviving sections ──
  pruneContentForReferences(current, autoFixes);

  // ── 4. Validate link_lists (preserve when needed by menu blocks) ──
  if (current.link_lists) {
    if (typeof current.link_lists !== 'object' || Array.isArray(current.link_lists)) {
      current.link_lists = {};
      autoFixes.push('Reset malformed link_lists to empty object.');
    } else {
      for (const [menuId, menu] of Object.entries(current.link_lists)) {
        if (typeof menu === 'string') {
          try {
            current.link_lists[menuId] = JSON.parse(menu);
            autoFixes.push(`Parsed stringified link_list "${menuId}".`);
          } catch {
            delete current.link_lists[menuId];
            autoFixes.push(`Removed unparseable link_list "${menuId}".`);
          }
        } else if (!menu || typeof menu !== 'object') {
          delete current.link_lists[menuId];
          autoFixes.push(`Removed invalid link_list "${menuId}".`);
        }
      }
    }
  }

  // ── 5. Ensure no header/footer in content_for_* ──
  removeLayoutSectionsFromContentArrays(current, autoFixes);

  // ── 6. Check zip structure basics ──
  validateZipStructure(theme, warnings);

  // ── 7. Semantic quality warnings ──
  addSemanticQualityWarnings(current, warnings);

  return {
    errors,
    warnings,
    autoFixes,
    ready: errors.length === 0,
  };
}

// ── Semantic quality warnings ────────────────────────────────────────

function addSemanticQualityWarnings(
  current: Record<string, any>,
  warnings: string[],
) {
  const sections = current.sections || {};
  const headingCounts = new Map<string, string[]>();
  const ctaLabelCounts = new Map<string, string[]>();

  for (const [id, rawSection] of Object.entries(sections)) {
    const section = rawSection as any;
    if (!section || !section.type) continue;

    // Track headings for duplicate detection
    const heading = section.settings?.heading;
    if (heading && typeof heading === 'string') {
      const normalized = heading.trim().toLowerCase();
      if (!headingCounts.has(normalized)) headingCounts.set(normalized, []);
      headingCounts.get(normalized)!.push(id);
    }

    // Warn: heading-only section (no body/buttons/images in any block)
    const blocks = section.blocks || {};
    const blockValues = Object.values(blocks) as any[];
    const hasSubstantiveContent = blockValues.some((b: any) => {
      const s = b?.settings || {};
      return (s.text && s.text.length > 20) || s.image || s.button_label || s.btn_text || s.btn_action;
    });
    if (blockValues.length <= 1 && !hasSubstantiveContent && section.settings?.heading) {
      warnings.push(`Section "${id}" appears to be heading-only with no body content.`);
    }

    // Track CTA labels for duplicate detection
    for (const block of blockValues) {
      const b = block as any;
      const btnLabel = b?.settings?.btn_text || b?.settings?.button_label;
      if (btnLabel && typeof btnLabel === 'string') {
        const normalized = btnLabel.trim().toLowerCase();
        if (!ctaLabelCounts.has(normalized)) ctaLabelCounts.set(normalized, []);
        ctaLabelCounts.get(normalized)!.push(id);
      }
    }

    // Warn: page_content used as generic homepage section
    if (section.type === 'page_content') {
      // Check if it's in a homepage content array
      const inHomepage = Array.isArray(current.content_for_index) && current.content_for_index.includes(id);
      if (inHomepage) {
        warnings.push(`Section "${id}" uses "page_content" type as a homepage section — consider a more specific type.`);
      }
    }

    // Warn: footer-like content in content_for_*
    const sectionType = (section.type || '').toLowerCase();
    const sectionName = (section.name || '').toLowerCase();
    if (sectionType.includes('footer') || sectionName.includes('footer')) {
      for (const key of Object.keys(current)) {
        if (key.startsWith('content_for_') && Array.isArray(current[key]) && current[key].includes(id)) {
          warnings.push(`Footer-like section "${id}" is in ${key} — footers should be layout-level, not page content.`);
        }
      }
    }

    // Warn: section with too little content for its intent
    const name = (section.name || '').toLowerCase();
    const isExpectedRich = ['stat', 'feature', 'program', 'testimonial', 'course', 'service'].some(k => name.includes(k) || sectionType.includes(k));
    if (isExpectedRich && blockValues.length <= 1) {
      warnings.push(`Section "${id}" (${section.name}) has only ${blockValues.length} block(s) but its intent suggests richer content.`);
    }
  }

  // Warn: duplicate headings
  for (const [heading, ids] of headingCounts) {
    if (ids.length > 1) {
      warnings.push(`Duplicate heading "${heading}" found in sections: ${ids.join(', ')}.`);
    }
  }

  // Warn: duplicate CTA labels
  for (const [label, ids] of ctaLabelCounts) {
    if (ids.length > 2) {
      warnings.push(`CTA label "${label}" repeated across ${ids.length} sections.`);
    }
  }

  // Warn: menu blocks referencing missing link_lists
  const linkLists = current.link_lists || {};
  for (const [id, rawSection] of Object.entries(sections)) {
    const section = rawSection as any;
    const blocks = section?.blocks || {};
    for (const [bid, block] of Object.entries(blocks)) {
      const b = block as any;
      if (b?.type === 'menu' && b?.settings?.menu) {
        const menuRef = b.settings.menu;
        if (!linkLists[menuRef]) {
          warnings.push(`Block "${bid}" in section "${id}" references menu "${menuRef}" which is not in link_lists.`);
        }
      }
    }
  }
}

// ── Content-for arrays ──────────────────────────────────────────────────

function fixContentForArrays(
  current: Record<string, any>,
  autoFixes: string[],
  errors: string[],
) {
  for (const key of Object.keys(current)) {
    if (!key.startsWith('content_for_')) continue;
    let val = current[key];

    // Fix stringified arrays
    if (typeof val === 'string') {
      try {
        val = JSON.parse(val.replace(/'/g, '"'));
        autoFixes.push(`Parsed stringified ${key} back into an array.`);
      } catch {
        const matches = val.match(/[\w\d-]+/g);
        val = matches || [];
        autoFixes.push(`Extracted IDs from malformed ${key} string.`);
      }
    }

    if (!Array.isArray(val)) {
      current[key] = [];
      autoFixes.push(`Replaced non-array ${key} with empty array.`);
      continue;
    }

    // Remove empty strings and duplicates
    const before = val.length;
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const id of val) {
      const s = String(id).trim();
      if (!s) continue;
      if (seen.has(s)) {
        autoFixes.push(`Removed duplicate section ID "${s}" from ${key}.`);
        continue;
      }
      seen.add(s);
      cleaned.push(s);
    }
    current[key] = cleaned;
    if (cleaned.length < before) {
      autoFixes.push(`Cleaned ${before - cleaned.length} invalid entries from ${key}.`);
    }
  }
}

// ── Sections ────────────────────────────────────────────────────────────

function fixSections(
  current: Record<string, any>,
  autoFixes: string[],
  errors: string[],
  warnings: string[],
  theme: KajabiThemeData,
) {
  const sections = current.sections;
  if (!sections || typeof sections !== 'object') {
    if (current.sections === undefined) {
      current.sections = {};
      autoFixes.push('Created missing sections object.');
    }
    return;
  }

  // Compute available types from base theme
  const availableTypes = new Set(
    Object.keys(theme.files)
      .filter(p => p.startsWith('sections/') && p.endsWith('.liquid'))
      .map(p => p.replace('sections/', '').replace('.liquid', ''))
  );

  const sectionIdsToRemove: string[] = [];

  for (const [id, rawSection] of Object.entries(sections)) {
    const section = rawSection as any;

    // Remove empty stubs
    if (!section || typeof section !== 'object') {
      sectionIdsToRemove.push(id);
      autoFixes.push(`Removed invalid section "${id}" (not an object).`);
      continue;
    }

    // Must have a type
    if (!section.type || typeof section.type !== 'string' || !section.type.trim()) {
      sectionIdsToRemove.push(id);
      autoFixes.push(`Removed section "${id}" with no valid type.`);
      continue;
    }

    // Warn if type not in available types
    if (availableTypes.size > 0 && !availableTypes.has(section.type)) {
      warnings.push(`Section "${id}" uses type "${section.type}" which is not in the base theme.`);
    }

    // Ensure settings is an object
    if (!section.settings || typeof section.settings !== 'object' || Array.isArray(section.settings)) {
      section.settings = {};
      autoFixes.push(`Created missing settings object for section "${id}".`);
    }

    // Fix stringified JSON in settings
    fixStringifiedJson(section.settings, `section "${id}" settings`, autoFixes);

    // Fix padding fields
    fixPaddingField(section.settings, 'padding_desktop', id, autoFixes);
    fixPaddingField(section.settings, 'padding_mobile', id, autoFixes);

    // Fix template-specific field names in settings
    fixFieldNames(section.settings, `section "${id}" settings`, autoFixes);

    // Ensure blocks is an object
    if (section.blocks !== undefined) {
      if (Array.isArray(section.blocks)) {
        const converted: Record<string, any> = {};
        section.blocks.forEach((block: any, i: number) => {
          const blockId = createNumericId();
          converted[blockId] = normalizeBlock(block);
        });
        section.blocks = converted;
        autoFixes.push(`Converted block array to object for section "${id}".`);
      } else if (typeof section.blocks !== 'object') {
        section.blocks = {};
        autoFixes.push(`Reset invalid blocks to empty object for section "${id}".`);
      }
    } else {
      section.blocks = {};
    }

    // Validate and fix each block
    const blockIdsToRemove: string[] = [];
    for (const [blockId, rawBlock] of Object.entries(section.blocks)) {
      const block = rawBlock as any;
      if (!block || typeof block !== 'object') {
        blockIdsToRemove.push(blockId);
        autoFixes.push(`Removed invalid block "${blockId}" in section "${id}".`);
        continue;
      }

      // Must have type
      if (!block.type || typeof block.type !== 'string') {
        block.type = 'text';
        autoFixes.push(`Set missing block type to "text" for block "${blockId}" in section "${id}".`);
      }

      // Must have settings object
      if (!block.settings || typeof block.settings !== 'object' || Array.isArray(block.settings)) {
        block.settings = {};
        autoFixes.push(`Created missing settings for block "${blockId}" in section "${id}".`);
      }

      fixStringifiedJson(block.settings, `block "${blockId}" settings`, autoFixes);
      fixFieldNames(block.settings, `block "${blockId}" in section "${id}"`, autoFixes);
    }

    for (const bid of blockIdsToRemove) {
      delete section.blocks[bid];
    }

    // Fix block_order
    if (!Array.isArray(section.block_order)) {
      section.block_order = Object.keys(section.blocks);
      if (section.block_order.length > 0) {
        autoFixes.push(`Generated block_order from block keys for section "${id}".`);
      }
    } else {
      // Remove references to non-existent blocks
      const validBlockIds = new Set(Object.keys(section.blocks));
      const before = section.block_order.length;
      section.block_order = section.block_order
        .map((bid: any) => String(bid))
        .filter((bid: string) => validBlockIds.has(bid));

      if (section.block_order.length < before) {
        autoFixes.push(`Removed ${before - section.block_order.length} orphaned block_order refs in section "${id}".`);
      }

      // Add blocks missing from block_order
      for (const bid of Object.keys(section.blocks)) {
        if (!section.block_order.includes(bid)) {
          section.block_order.push(bid);
          autoFixes.push(`Added missing block "${bid}" to block_order in section "${id}".`);
        }
      }
    }

    // Check for duplicate block IDs (shouldn't happen with object keys, but check block_order)
    const seenBlocks = new Set<string>();
    const dedupedOrder: string[] = [];
    for (const bid of section.block_order) {
      if (seenBlocks.has(bid)) {
        autoFixes.push(`Removed duplicate block_order entry "${bid}" in section "${id}".`);
        continue;
      }
      seenBlocks.add(bid);
      dedupedOrder.push(bid);
    }
    section.block_order = dedupedOrder;

    // Ensure section has a name
    if (!section.name || typeof section.name !== 'string') {
      section.name = section.type;
      autoFixes.push(`Set missing section name to "${section.type}" for section "${id}".`);
    }
  }

  // Remove flagged sections
  for (const id of sectionIdsToRemove) {
    delete sections[id];
  }
}

// ── Prune content_for_* to only reference surviving sections ─────────

function pruneContentForReferences(
  current: Record<string, any>,
  autoFixes: string[],
) {
  const validSectionIds = new Set(Object.keys(current.sections || {}));

  for (const key of Object.keys(current)) {
    if (!key.startsWith('content_for_') || !Array.isArray(current[key])) continue;

    const before = current[key].length;
    current[key] = current[key].filter((id: string) => {
      if (validSectionIds.has(id)) return true;
      autoFixes.push(`Removed reference to non-existent section "${id}" from ${key}.`);
      return false;
    });
  }
}

// ── Remove header/footer from content arrays ────────────────────────

function removeLayoutSectionsFromContentArrays(
  current: Record<string, any>,
  autoFixes: string[],
) {
  const sections = current.sections || {};
  for (const key of Object.keys(current)) {
    if (!key.startsWith('content_for_') || !Array.isArray(current[key])) continue;

    current[key] = current[key].filter((id: string) => {
      const section = sections[id];
      if (section && LAYOUT_SECTION_TYPES.has(section.type)) {
        autoFixes.push(`Removed layout section "${id}" (type: ${section.type}) from ${key}.`);
        return false;
      }
      return true;
    });
  }
}

// ── Zip structure validation ─────────────────────────────────────────

function validateZipStructure(theme: KajabiThemeData, warnings: string[]) {
  const hasSettingsData = 'config/settings_data.json' in theme.files ||
    Object.keys(theme.files).some(p => p.endsWith('settings_data.json'));
  if (!hasSettingsData) {
    warnings.push('Base theme has no config/settings_data.json file.');
  }

  const hasSections = Object.keys(theme.files).some(p =>
    p.startsWith('sections/') || p.includes('/sections/')
  );
  if (!hasSections) {
    warnings.push('Base theme has no sections/ directory.');
  }
}

// ── Helper: fix stringified JSON in settings objects ─────────────────

function fixStringifiedJson(
  settings: Record<string, any>,
  context: string,
  autoFixes: string[],
) {
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) continue;

    try {
      settings[key] = JSON.parse(trimmed);
      autoFixes.push(`Parsed stringified JSON in ${context}.${key}.`);
    } catch {
      // Leave as string
    }
  }
}

// ── Helper: fix padding fields ───────────────────────────────────────

function fixPaddingField(
  settings: Record<string, any>,
  field: string,
  sectionId: string,
  autoFixes: string[],
) {
  const val = settings[field];
  if (val === undefined) return;

  if (typeof val === 'string') {
    try {
      settings[field] = JSON.parse(val);
      autoFixes.push(`Parsed stringified ${field} in section "${sectionId}".`);
    } catch {
      settings[field] = { top: '60', bottom: '60' };
      autoFixes.push(`Replaced malformed ${field} with defaults in section "${sectionId}".`);
    }
  } else if (typeof val !== 'object' || Array.isArray(val)) {
    settings[field] = { top: '60', bottom: '60' };
    autoFixes.push(`Replaced non-object ${field} with defaults in section "${sectionId}".`);
  }
}

// ── Helper: fix known Kajabi field name mismatches ───────────────────

function fixFieldNames(
  settings: Record<string, any>,
  context: string,
  autoFixes: string[],
) {
  for (const [wrongKey, rightKey] of Object.entries(FIELD_RENAMES)) {
    if (wrongKey in settings && !(rightKey in settings)) {
      settings[rightKey] = settings[wrongKey];
      delete settings[wrongKey];
      autoFixes.push(`Renamed "${wrongKey}" → "${rightKey}" in ${context}.`);
    }
  }
}

// ── Helper: normalize a block ────────────────────────────────────────

function normalizeBlock(block: any) {
  if (!block || typeof block !== 'object') {
    return { type: 'text', settings: {} };
  }
  return {
    ...block,
    type: typeof block.type === 'string' && block.type.trim() ? block.type : 'text',
    settings: block.settings && typeof block.settings === 'object' && !Array.isArray(block.settings)
      ? block.settings
      : {},
  };
}

function createNumericId() {
  return String(Math.floor(1000000000000 + Math.random() * 9000000000000));
}