/**
 * Renderer Integration Module
 * 
 * Clean boundary between Export to Kajabi (extraction/mapping/generation)
 * and Kajabi Theme Renderer (actual Liquid-based rendering).
 * 
 * This module is abstract enough that later it could call a shared module,
 * a reusable library, or a service endpoint.
 */

import type { KajabiThemeData, TransformationPlan, ExtractedDesign } from '@/types';
import { applyOperation } from '@/lib/kajabi-exporter';
import { renderPageFromData } from '@/lib/kajabi-renderer-engine';
import { runStructuralComparison, type ComparisonResult } from '@/lib/render-check-compare';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RenderCheckInput {
  projectId: string;
  projectName: string;
  sourcePage: string;
  baseThemeId: string;
  generatedTheme: {
    settingsData: any;
    files: Record<string, string>;
    assets?: Record<string, any>;
    rootPrefix?: string;
  };
}

export interface RenderCheckOutput {
  success: boolean;
  renderedHtml?: string;
  renderedPages?: Array<{
    page: string;
    html?: string;
    screenshotUrl?: string;
  }>;
  diagnostics?: RenderDiagnostics;
  comparison?: ComparisonResult;
  error?: string;
}

export interface RenderDiagnostics {
  renderedSectionIds: string[];
  missingSectionIds: string[];
  warnings: string[];
  renderTimeMs: number;
}

// ── Main render-check function ─────────────────────────────────────────────

/**
 * Run a render check: take the generated theme, render it through the
 * Kajabi Liquid engine, and compare structurally against the source design.
 */
export async function runRenderCheck(
  plan: TransformationPlan,
  baseTheme: KajabiThemeData,
  extractedDesign: ExtractedDesign,
  onProgress?: (message: string) => void,
): Promise<RenderCheckOutput> {
  const progress = onProgress || (() => {});

  try {
    // Step 1: Build the modified settings_data by applying all operations
    progress('Applying operations to theme...');
    const settingsData = JSON.parse(JSON.stringify(baseTheme.settingsData));
    const current = settingsData.current;
    let overridesCss = baseTheme.files['assets/overrides.css'] || '';

    for (const op of plan.operations) {
      applyOperationToSettings(op, current, (css) => { overridesCss += '\n' + css; });
    }

    // Step 2: Build theme data structure for renderer
    progress('Preparing theme data for renderer...');
    const themeData = buildThemeDataForRenderer(baseTheme, settingsData, overridesCss);

    // Step 3: Render the page through LiquidJS
    progress('Rendering homepage through Kajabi engine...');
    const startTime = performance.now();
    
    const renderResult = await renderPageFromData(themeData, 'index');
    
    const renderTimeMs = Math.round(performance.now() - startTime);

    // Step 4: Extract diagnostics from rendered HTML
    progress('Analyzing rendered output...');
    const diagnostics = extractDiagnostics(renderResult.html, current, renderTimeMs);

    // Step 5: Run structural comparison against source design
    progress('Comparing against source design...');
    const comparison = runStructuralComparison(renderResult.html, extractedDesign, diagnostics);

    // Step 6: Build full HTML document with styles
    const fullHtml = buildFullHtml(renderResult.html, renderResult.styles, renderResult.coreCss, overridesCss);

    return {
      success: true,
      renderedHtml: fullHtml,
      renderedPages: [{ page: 'index', html: fullHtml }],
      diagnostics,
      comparison,
    };
  } catch (err: any) {
    console.error('Render check failed:', err);
    return {
      success: false,
      error: err.message || 'Unknown render error',
      diagnostics: {
        renderedSectionIds: [],
        missingSectionIds: [],
        warnings: [`Render check failed: ${err.message}`],
        renderTimeMs: 0,
      },
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildThemeDataForRenderer(
  baseTheme: KajabiThemeData,
  modifiedSettingsData: any,
  overridesCss: string,
) {
  // Extract liquid files by category from baseTheme.files
  const layouts: Record<string, string> = {};
  const templates: Record<string, string> = {};
  const sections: Record<string, string> = {};
  const snippets: Record<string, string> = {};
  const assetsText: Record<string, string> = {};

  for (const [path, content] of Object.entries(baseTheme.files)) {
    const normalizedPath = path.replace(/^\//, '');
    if (normalizedPath.startsWith('layouts/')) {
      layouts[normalizedPath.replace('layouts/', '')] = content;
    } else if (normalizedPath.startsWith('templates/')) {
      templates[normalizedPath.replace('templates/', '')] = content;
    } else if (normalizedPath.startsWith('sections/')) {
      sections[normalizedPath.replace('sections/', '')] = content;
    } else if (normalizedPath.startsWith('snippets/')) {
      snippets[normalizedPath.replace('snippets/', '')] = content;
    } else if (normalizedPath.startsWith('assets/')) {
      assetsText[normalizedPath.replace('assets/', '')] = content;
    }
  }

  // Inject overrides CSS into assets
  if (overridesCss.trim()) {
    assetsText['overrides.css'] = overridesCss;
  }

  return {
    settings_data: modifiedSettingsData,
    layouts,
    templates,
    sections,
    snippets,
    assets_text: assetsText,
  };
}

function extractDiagnostics(
  html: string,
  current: any,
  renderTimeMs: number,
): RenderDiagnostics {
  const warnings: string[] = [];

  // Extract section IDs from rendered HTML
  const sectionIdRegex = /id="section-([^"]+)"/g;
  const renderedSectionIds: string[] = [];
  let match;
  while ((match = sectionIdRegex.exec(html)) !== null) {
    renderedSectionIds.push(match[1]);
  }

  // Find expected sections from content_for_index
  const expectedIds: string[] = Array.isArray(current.content_for_index)
    ? current.content_for_index
    : [];

  const missingSectionIds = expectedIds.filter(id => !renderedSectionIds.includes(id));

  if (missingSectionIds.length > 0) {
    warnings.push(`${missingSectionIds.length} expected section(s) not found in rendered output: ${missingSectionIds.join(', ')}`);
  }

  // Check for error comments in rendered HTML
  const errorComments = html.match(/<!-- Error rendering section [^>]+-->/g) || [];
  if (errorComments.length > 0) {
    warnings.push(`${errorComments.length} section(s) had rendering errors`);
  }

  // Check if HTML seems too short (likely a failed render)
  const strippedText = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (strippedText.length < 100) {
    warnings.push('Rendered output has very little visible text content');
  }

  return { renderedSectionIds, missingSectionIds, warnings, renderTimeMs };
}

function buildFullHtml(
  bodyHtml: string,
  styles: string,
  coreCss: string,
  overridesCss: string,
): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${coreCss}</style>
  <style>${styles}</style>
  <style>${overridesCss}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
