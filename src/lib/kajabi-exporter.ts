import JSZip from 'jszip';
import type { TransformationPlan, KajabiThemeData, TransformationOperation } from '@/types';
import { validateAndFix, type ValidationResult } from '@/lib/export-validator';

export type { ValidationResult } from '@/lib/export-validator';

/**
 * Run pre-export validation without building the zip.
 * Returns the validation report so the UI can show it.
 */
export function preValidateExport(
  plan: TransformationPlan,
  theme: KajabiThemeData,
): ValidationResult {
  const settingsData = JSON.parse(JSON.stringify(theme.settingsData));
  const current = settingsData.current;
  let overridesCss = theme.files['assets/overrides.css'] || '';

  for (const op of plan.operations) {
    applyOperation(op, current, (css) => { overridesCss += '\n' + css; });
  }

  return validateAndFix(settingsData, theme);
}

export async function applyPlanAndExport(
  plan: TransformationPlan,
  theme: KajabiThemeData,
): Promise<Blob> {
  // Deep clone settings data
  const settingsData = JSON.parse(JSON.stringify(theme.settingsData));
  const current = settingsData.current;
  let overridesCss = theme.files['assets/overrides.css'] || '';

  // Apply each operation
  for (const op of plan.operations) {
    applyOperation(op, current, (css) => { overridesCss += '\n' + css; });
  }

  // Sanitize the entire current object to fix common AI output issues
  sanitizeSettingsData(current);

  // Run the full validation + auto-fix pipeline
  const validation = validateAndFix(settingsData, theme);
  if (!validation.ready) {
    const msg = validation.errors.join('; ');
    throw new Error(`Export blocked by structural errors: ${msg}`);
  }

  // Build the zip — Kajabi requires STORE compression (no deflation)
  const zip = new JSZip();
  const prefix = theme.rootPrefix || '';
  const zipOpts = { compression: 'STORE' as const };
  
  // Write settings_data.json
  zip.file(prefix + 'config/settings_data.json', JSON.stringify(settingsData, null, 2), zipOpts);

  // Write all other files
  for (const [path, content] of Object.entries(theme.files)) {
    if (path === 'config/settings_data.json') continue;
    if (path === 'assets/overrides.css') continue;
    zip.file(prefix + path, content, zipOpts);
  }

  // Write updated overrides.css
  zip.file(prefix + 'assets/overrides.css', overridesCss, zipOpts);

  // Write binary assets
  for (const [path, data] of Object.entries(theme.assets)) {
    zip.file(prefix + path, data, zipOpts);
  }

  // Write any new assets from operations
  for (const op of plan.operations) {
    if (op.type === 'addAsset') {
      zip.file(prefix + `assets/${op.fileName}`, op.data, zipOpts);
    }
  }

  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

/**
 * Sanitize settings_data to fix common AI output issues before zipping.
 */
// Valid block types for Kajabi "section" type
const VALID_BLOCK_TYPES = new Set([
  "text", "feature", "card", "cta", "image", "accordion", "form", "video",
  "video_embed", "audio", "blog", "code", "countdown", "course_outline",
  "event", "external_widget", "link_list", "multi_video", "offer", "pricing",
  "social_icons", "social_share",
  // Header/footer block types
  "logo", "menu", "dropdown", "user", "hello_bar", "copyright",
]);

const BLOCK_TYPE_REMAP: Record<string, string> = {
  "text_column": "feature",
  "text-column": "feature",
  "textcolumn": "feature",
  "stat": "feature",
  "testimonial": "text",
  "quote": "text",
  "heading": "text",
  "paragraph": "text",
  "button": "cta",
};

function sanitizeSettingsData(current: Record<string, any>) {
  // Fix content_for_* arrays
  for (const key of Object.keys(current)) {
    if (key.startsWith('content_for_')) {
      let val = current[key];
      if (typeof val === 'string') {
        try { val = JSON.parse(val.replace(/'/g, '"')); } catch {
          val = val.match(/[\w\d]+/g) || [];
        }
      }
      if (Array.isArray(val)) {
        current[key] = val.filter((id: string) => typeof id === 'string' && id.trim() !== '');
      }
    }
  }

  // Validate link_lists
  if (current.link_lists && typeof current.link_lists === 'object') {
    for (const [menuId, menu] of Object.entries(current.link_lists)) {
      if (typeof menu === 'string') {
        try { current.link_lists[menuId] = JSON.parse(menu); } catch { delete current.link_lists[menuId]; }
      }
    }
  }

  // Fix sections
  const sections = current.sections || {};
  for (const [id, section] of Object.entries(sections)) {
    const s = section as any;
    
    if (!s.type) {
      delete sections[id];
      for (const key of Object.keys(current)) {
        if (key.startsWith('content_for_') && Array.isArray(current[key])) {
          current[key] = current[key].filter((sid: string) => sid !== id);
        }
      }
      continue;
    }

    // Remove invalid section-level settings that belong in blocks
    if (s.settings && typeof s.settings === 'object') {
      const invalidSectionKeys = ['heading', 'subheading', 'text', 'heading_color', 'text_color'];
      for (const key of invalidSectionKeys) {
        delete s.settings[key];
      }
      // Fix stringified objects
      for (const [sk, sv] of Object.entries(s.settings)) {
        if (typeof sv === 'string' && (sv.startsWith('{') || sv.startsWith('['))) {
          try { s.settings[sk] = JSON.parse(sv); } catch { /* leave */ }
        }
      }
    }

    // Fix blocks
    if (s.blocks && typeof s.blocks === 'object') {
      for (const [bid, block] of Object.entries(s.blocks)) {
        const b = block as any;
        
        // Fix block type
        if (b.type) {
          const lower = b.type.toLowerCase();
          if (BLOCK_TYPE_REMAP[lower]) {
            b.type = BLOCK_TYPE_REMAP[lower];
          }
          if (!VALID_BLOCK_TYPES.has(b.type)) {
            b.type = "text";
          }
        }

        // Fix block settings
        if (b.settings && typeof b.settings === 'object') {
          // Build text from heading/body if text is missing
          if (!b.settings.text && (b.settings.heading || b.settings.body || b.settings.description)) {
            let html = '';
            if (b.settings.heading) html += `<h4>${b.settings.heading}</h4>`;
            if (b.settings.body) html += `<p>${b.settings.body}</p>`;
            else if (b.settings.description) html += `<p>${b.settings.description}</p>`;
            b.settings.text = html;
            delete b.settings.heading;
            delete b.settings.body;
            delete b.settings.description;
          }

          // Fix field names
          if (b.settings.btn_url && !b.settings.btn_action) { b.settings.btn_action = b.settings.btn_url; delete b.settings.btn_url; }
          if (b.settings.button_label && !b.settings.btn_text) { b.settings.btn_text = b.settings.button_label; delete b.settings.button_label; }
          if (b.settings.image_link && !b.settings.img_action) { b.settings.img_action = b.settings.image_link; delete b.settings.image_link; }

          // Ensure width default
          if (!b.settings.width) b.settings.width = "12";

          // Fix stringified objects
          for (const [bk, bv] of Object.entries(b.settings)) {
            if (typeof bv === 'string' && (bv.startsWith('{') || bv.startsWith('['))) {
              try { b.settings[bk] = JSON.parse(bv); } catch { /* leave */ }
            }
          }
        }
      }
    }
  }
}

function applyOperation(
  op: TransformationOperation,
  current: Record<string, any>,
  addCss: (css: string) => void,
) {
  const sections = current.sections || {};

  switch (op.type) {
    case 'updateGlobalSetting':
      current[op.key] = op.value;
      break;

    case 'updateSectionSetting':
      if (sections[op.sectionId]?.settings) {
        sections[op.sectionId].settings[op.key] = op.value;
      }
      break;

    case 'updateBlockSetting':
      if (sections[op.sectionId]?.blocks?.[op.blockId]?.settings) {
        sections[op.sectionId].blocks[op.blockId].settings[op.key] = op.value;
      }
      break;

    case 'replaceText':
      if (sections[op.sectionId]?.blocks?.[op.blockId]?.settings) {
        sections[op.sectionId].blocks[op.blockId].settings[op.key] = op.value;
      }
      break;

    case 'hideSection':
      if (sections[op.sectionId]) {
        sections[op.sectionId].hidden = 'true';
      }
      break;

    case 'showSection':
      if (sections[op.sectionId]) {
        sections[op.sectionId].hidden = 'false';
      }
      break;

    case 'updateNavigation':
      if (!current.link_lists) current.link_lists = {};
      current.link_lists[op.menuId] = { links: op.links };
      break;

    case 'addCssOverride':
      addCss(op.css);
      break;

    case 'addSection':
      if (!current.sections) current.sections = {};
      current.sections[op.sectionId] = {
        ...op.section,
        hidden: 'false',
      };
      // Auto-add to content_for_index so Kajabi actually renders the section
      if (!current.content_for_index) current.content_for_index = [];
      if (typeof current.content_for_index === 'string') {
        try {
          current.content_for_index = JSON.parse(current.content_for_index.replace(/'/g, '"'));
        } catch { current.content_for_index = []; }
      }
      if (Array.isArray(current.content_for_index) && !current.content_for_index.includes(op.sectionId)) {
        current.content_for_index.push(op.sectionId);
      }
      break;

    case 'addBlock':
      if (sections[op.sectionId]) {
        if (!sections[op.sectionId].blocks) sections[op.sectionId].blocks = {};
        sections[op.sectionId].blocks[op.blockId] = op.block;
        if (!sections[op.sectionId].block_order) sections[op.sectionId].block_order = [];
        if (!sections[op.sectionId].block_order.includes(op.blockId)) {
          sections[op.sectionId].block_order.push(op.blockId);
        }
      }
      break;

    case 'replaceLogo':
    case 'replaceImage':
    case 'moveSection':
    case 'addAsset':
      // Handled separately
      break;
  }
}

export function generateChangeSummary(plan: TransformationPlan): string[] {
  return plan.operations.map(op => {
    switch (op.type) {
      case 'updateGlobalSetting': return `Set ${op.label}: ${op.value}`;
      case 'updateSectionSetting': return `Set ${op.label} on section ${op.sectionId}`;
      case 'updateBlockSetting': return `Set ${op.label} on block ${op.blockId}`;
      case 'replaceText': return `Replace ${op.label}`;
      case 'hideSection': return `Hide section ${op.sectionId}`;
      case 'showSection': return `Show section ${op.sectionId}`;
      case 'updateNavigation': return `Update ${op.menuId} navigation (${op.links.length} items)`;
      case 'addCssOverride': return `Add CSS: ${op.label}`;
      case 'replaceLogo': return `Replace logo with ${op.fileName}`;
      case 'replaceImage': return `Replace image: ${op.fileName}`;
      case 'moveSection': return `Move section ${op.sectionId}`;
      case 'addAsset': return `Add asset: ${op.fileName}`;
      case 'addSection': return `Add section: ${op.label}`;
      case 'addBlock': return `Add block: ${op.label}`;
      default: return 'Unknown operation';
    }
  });
}
