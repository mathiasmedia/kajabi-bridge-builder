import JSZip from 'jszip';
import type { TransformationPlan, KajabiThemeData, TransformationOperation } from '@/types';

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
