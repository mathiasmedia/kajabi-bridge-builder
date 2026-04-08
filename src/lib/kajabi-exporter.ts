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
      } else {
        console.warn(`updateSectionSetting SKIPPED: section "${op.sectionId}" not found`);
      }
      break;

    case 'updateBlockSetting':
      if (sections[op.sectionId]?.blocks?.[op.blockId]?.settings) {
        sections[op.sectionId].blocks[op.blockId].settings[op.key] = op.value;
      } else {
        console.warn(`updateBlockSetting SKIPPED: section "${op.sectionId}" block "${op.blockId}" not found`);
      }
      break;

    case 'replaceText':
      if (sections[op.sectionId]?.blocks?.[op.blockId]?.settings) {
        sections[op.sectionId].blocks[op.blockId].settings[op.key] = op.value;
      } else {
        console.warn(`replaceText SKIPPED: section "${op.sectionId}" block "${op.blockId}" not found`);
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

export interface ChangeSummaryItem {
  type: string;
  label: string;
  detail: string;
  json?: string;
}

export function generateChangeSummary(plan: TransformationPlan): ChangeSummaryItem[] {
  return plan.operations.map(op => {
    switch (op.type) {
      case 'updateGlobalSetting': return { type: op.type, label: op.label, detail: `Key: ${op.key} → ${typeof op.value === 'string' ? op.value : JSON.stringify(op.value).slice(0, 80)}` };
      case 'updateSectionSetting': return { type: op.type, label: op.label, detail: `Section: ${op.sectionId} · Key: ${op.key} → ${typeof op.value === 'string' ? op.value : JSON.stringify(op.value).slice(0, 60)}` };
      case 'updateBlockSetting': return { type: op.type, label: op.label, detail: `Section: ${op.sectionId} · Block: ${op.blockId} · Key: ${op.key}` };
      case 'replaceText': return { type: op.type, label: op.label, detail: `Section: ${op.sectionId} · Block: ${op.blockId} · ${op.value.slice(0, 60)}…` };
      case 'hideSection': return { type: op.type, label: `Hide section`, detail: `Section ID: ${op.sectionId}` };
      case 'showSection': return { type: op.type, label: `Show section`, detail: `Section ID: ${op.sectionId}` };
      case 'updateNavigation': return { type: op.type, label: `Update navigation`, detail: `Menu: ${op.menuId} · ${op.links.length} links: ${op.links.map(l => l.name).join(', ')}` };
      case 'addCssOverride': return { type: op.type, label: op.label, detail: `${op.css.length} chars of CSS` };
      case 'replaceLogo': return { type: op.type, label: `Replace logo`, detail: `File: ${op.fileName}` };
      case 'replaceImage': return { type: op.type, label: `Replace image`, detail: `Target: ${op.target} · File: ${op.fileName}` };
      case 'moveSection': return { type: op.type, label: `Move section`, detail: `Section: ${op.sectionId}${op.afterSectionId ? ` after ${op.afterSectionId}` : ''}` };
      case 'addAsset': return { type: op.type, label: `Add asset`, detail: `File: ${op.fileName}` };
      case 'addSection': {
        const blocks = op.section?.blocks || {};
        const blockEntries = Object.entries(blocks);
        const bgColor = op.section?.settings?.background_color || 'none';
        const blockDetails = blockEntries.map(([bid, b]: [string, any], i: number) => {
          const type = b.type || '?';
          const text = b.settings?.text || '';
          const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          const preview = stripped.slice(0, 60);
          const btnText = b.settings?.btn_text;
          const width = b.settings?.width;
          let desc = `[${type}${width ? ` w${width}` : ''}]`;
          if (preview) desc += ` "${preview}${stripped.length > 60 ? '…' : ''}"`;
          if (btnText) desc += ` [btn: ${btnText}]`;
          return `  ${i + 1}. ${desc}`;
        });
        const jsonDump = JSON.stringify({ sectionId: op.sectionId, type: op.section.type, settings: op.section.settings, block_order: op.section.block_order, blocks: op.section.blocks }, null, 2);
        return { 
          type: op.type, 
          label: op.label, 
          detail: `${blockEntries.length} blocks · bg: ${bgColor}\n${blockDetails.join('\n')}`,
          json: jsonDump,
        };
      }
      case 'addBlock': return { type: op.type, label: op.label, detail: `Section: ${op.sectionId} · Block: ${op.blockId} · Type: ${op.block.type}` };
      default: return { type: 'unknown', label: 'Unknown operation', detail: '' };
    }
  });
}
