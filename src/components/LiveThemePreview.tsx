import { useEffect, useState, useRef } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { TransformationPlan, KajabiThemeData } from '@/types';
import { applyOperation } from '@/lib/kajabi-exporter';
import { renderPageFromData } from '@/lib/kajabi-renderer-engine';
import { loadKajabiThemeFromZip } from '@/lib/kajabi-theme-loader';

interface LiveThemePreviewProps {
  plan: TransformationPlan;
  /** If a base theme is already loaded, pass it to skip re-fetching */
  baseTheme?: KajabiThemeData | null;
  className?: string;
}

/** Cached base theme so we only fetch the zip once per session */
let cachedBaseTheme: KajabiThemeData | null = null; // reset on theme change

async function getBaseTheme(existing?: KajabiThemeData | null): Promise<KajabiThemeData> {
  if (existing) return existing;
  if (cachedBaseTheme) return cachedBaseTheme;

  const resp = await fetch('/base-themes/pro-template.zip');
  if (!resp.ok) throw new Error('Failed to fetch base theme zip');
  const buf = await resp.arrayBuffer();
  cachedBaseTheme = await loadKajabiThemeFromZip(buf);
  return cachedBaseTheme;
}

function buildThemeDataForRenderer(
  baseTheme: KajabiThemeData,
  modifiedSettingsData: any,
  overridesCss: string,
) {
  const layouts: Record<string, string> = {};
  const templates: Record<string, string> = {};
  const sections: Record<string, string> = {};
  const snippets: Record<string, string> = {};
  const assetsText: Record<string, string> = {};

  for (const [path, content] of Object.entries(baseTheme.files)) {
    const p = path.replace(/^\//, '');
    if (p.startsWith('layouts/')) layouts[p.replace('layouts/', '')] = content;
    else if (p.startsWith('templates/')) templates[p.replace('templates/', '')] = content;
    else if (p.startsWith('sections/')) sections[p.replace('sections/', '')] = content;
    else if (p.startsWith('snippets/')) snippets[p.replace('snippets/', '')] = content;
    else if (p.startsWith('assets/')) assetsText[p.replace('assets/', '')] = content;
  }

  if (overridesCss.trim()) assetsText['overrides.css'] = overridesCss;

  return { settings_data: modifiedSettingsData, layouts, templates, sections, snippets, assets_text: assetsText };
}

export default function LiveThemePreview({ plan, baseTheme: providedTheme, className }: LiveThemePreviewProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const renderIdRef = useRef(0);

  useEffect(() => {
    const id = ++renderIdRef.current;

    async function render() {
      setRendering(true);
      setError(null);

      try {
        const theme = await getBaseTheme(providedTheme);

        // Apply operations
        const settingsData = JSON.parse(JSON.stringify(theme.settingsData));
        const current = settingsData.current;
        let overridesCss = theme.files['assets/overrides.css'] || '';

        console.log(`[LivePreview] Applying ${plan.operations.length} operations`);
        for (const op of plan.operations) {
          applyOperation(op, current, (css) => { overridesCss += '\n' + css; });
        }
        if (overridesCss.trim()) console.log('[LivePreview] Override CSS length:', overridesCss.length);

        const themeData = buildThemeDataForRenderer(theme, settingsData, overridesCss);
        const result = await renderPageFromData(themeData, 'index');

        if (id !== renderIdRef.current) return; // stale

        const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${result.coreCss}</style>
  <style>${result.styles}</style>
  <style>${overridesCss}</style>
  <style>
    /* Hide header/footer nav links in preview */
    .header .link-list,
    .header .link-list__links,
    .header .dropdown,
    .header .block-type--menu,
    .header .block-type--dropdown,
    .header .block-type--user,
    .footer .link-list,
    .footer .link-list__links,
    .footer .block-type--link_list,
    .footer_pro .link-list,
    .footer_pro .link-list__links,
    .footer_pro .block-type--link_list,
    nav, .nav, .navigation,
    .header__nav, .footer__nav { display: none !important; }
  </style>
</head>
<body>
${result.html}
</body>
</html>`;

        setHtml(fullHtml);
      } catch (e: any) {
        if (id !== renderIdRef.current) return;
        console.error('LiveThemePreview render error:', e);
        setError(e.message || 'Render failed');
      } finally {
        if (id === renderIdRef.current) setRendering(false);
      }
    }

    render();
  }, [plan, providedTheme]);

  // Write HTML to iframe via srcdoc
  useEffect(() => {
    if (html && iframeRef.current) {
      iframeRef.current.srcdoc = html;
    }
  }, [html]);

  if (rendering && !html) {
    return (
      <div className={`flex flex-col items-center justify-center py-20 text-muted-foreground ${className || ''}`}>
        <Loader2 className="h-6 w-6 animate-spin mb-2" />
        <span className="text-sm">Rendering through Kajabi engine…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 text-destructive ${className || ''}`}>
        <AlertTriangle className="h-5 w-5 mb-2" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div className={`relative ${className || ''}`}>
      {rendering && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-background/80 backdrop-blur px-2 py-1 rounded text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Re-rendering…
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="Kajabi Theme Preview"
        className="w-full border-0 rounded bg-white"
        style={{ minHeight: '400px', height: '100%' }}
        sandbox="allow-same-origin"
      />
    </div>
  );
}
