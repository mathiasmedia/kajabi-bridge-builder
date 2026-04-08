import type { ExtractedDesign, ExtractedColor, ExtractedSection, ExtractedAsset, SectionIntent, ExtractionWarning, MediaIntent, ImageTarget, ImageTargetRole } from '@/types';

// Source project extractor - analyzes a Lovable project's code to extract design information
// This runs in the browser and uses cross-project tools via the store

export interface SourceProjectFiles {
  indexCss?: string;
  tailwindConfig?: string;
  indexPage?: string;
  appTsx?: string;
  components: Record<string, string>;
  assets: string[];
  imageUrls?: Record<string, string>; // asset path → public URL in storage bucket
  pages: Record<string, string>;
}

export function extractDesignFromSource(files: SourceProjectFiles): { design: ExtractedDesign; warnings: ExtractionWarning[] } {
  const colors = extractColors(files.indexCss || '', files.tailwindConfig || '');
  const fonts = extractFonts(files.indexCss || '', files.tailwindConfig || '');
  const buttonStyle = extractButtonStyle(files);
  const header = extractHeader(files);
  const hero = extractHero(files);
  const { sections, warnings } = extractSectionsV2(files);
  const footer = extractFooter(files);
  const assets = extractAssets(files);

  return {
    design: {
      colors,
      headingFont: fonts.heading,
      bodyFont: fonts.body,
      buttonStyle,
      header,
      hero,
      sections,
      footer,
      assets,
    },
    warnings,
  };
}

function extractColors(css: string, tailwindConfig: string): ExtractedColor[] {
  const colors: ExtractedColor[] = [];
  
  // Parse CSS custom properties from index.css
  const hslRegex = /--(\w[\w-]*):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g;
  let match;
  
  while ((match = hslRegex.exec(css)) !== null) {
    const [, name, h, s, l] = match;
    const value = `hsl(${h}, ${s}%, ${l}%)`;
    
    let usage: ExtractedColor['usage'] = 'other';
    if (name === 'primary' || name.includes('primary')) usage = 'primary';
    else if (name === 'secondary' || name.includes('secondary')) usage = 'secondary';
    else if (name === 'background' || name.includes('background')) usage = 'background';
    else if (name === 'foreground' || name.includes('text') || name.includes('foreground')) usage = 'text';
    else if (name === 'accent' || name.includes('accent')) usage = 'accent';
    
    // Only pick :root (light mode) colors, skip dark mode duplicates
    colors.push({ name, value, usage });
  }
  
  // Also look for hex colors in tailwind config
  const hexRegex = /["']#([0-9a-fA-F]{3,8})["']/g;
  while ((match = hexRegex.exec(tailwindConfig)) !== null) {
    colors.push({ name: `custom-${match[1]}`, value: `#${match[1]}`, usage: 'other' });
  }
  
  // Deduplicate by name (keep first occurrence = light mode)
  const seen = new Set<string>();
  return colors.filter(c => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });
}

function extractFonts(css: string, tailwindConfig: string): { heading: string; body: string } {
  let heading = 'Montserrat';
  let body = 'Open Sans';
  
  // Check tailwind config for font families
  const fontMatch = tailwindConfig.match(/fontFamily[\s\S]*?{([\s\S]*?)}/);
  if (fontMatch) {
    const headingMatch = fontMatch[1].match(/(?:display|heading|serif).*?["']([^"']+)["']/);
    const bodyMatch = fontMatch[1].match(/(?:sans|body|base).*?["']([^"']+)["']/);
    if (headingMatch) heading = headingMatch[1];
    if (bodyMatch) body = bodyMatch[1];
  }
  
  // Check CSS for Google Fonts imports
  const googleFontsMatch = css.match(/fonts\.googleapis\.com\/css2?\?family=([^"' \s)]+)/);
  if (googleFontsMatch) {
    const families = decodeURIComponent(googleFontsMatch[1]).split('&family=');
    if (families[0]) heading = families[0].split(':')[0].replace(/\+/g, ' ');
    if (families[1]) body = families[1].split(':')[0].replace(/\+/g, ' ');
  }
  
  return { heading, body };
}

function extractButtonStyle(files: SourceProjectFiles): ExtractedDesign['buttonStyle'] {
  // Look for button component or common button patterns
  const css = files.indexCss || '';
  
  // Extract primary color for button bg
  const primaryMatch = css.match(/--primary:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  const bgColor = primaryMatch ? `hsl(${primaryMatch[1]}, ${primaryMatch[2]}%, ${primaryMatch[3]}%)` : '#E8552D';
  
  // Check radius
  const radiusMatch = css.match(/--radius:\s*([\d.]+rem)/);
  const radius = radiusMatch ? radiusMatch[1] : '0.5rem';
  
  return {
    backgroundColor: bgColor,
    textColor: '#ffffff',
    borderRadius: radius,
    style: 'solid',
  };
}

function extractHeader(files: SourceProjectFiles): ExtractedDesign['header'] {
  const navItems: Array<{ name: string; url: string }> = [];
  let logoText: string | undefined;
  
  // Search for footer component for brand name (often contains the logo text)
  for (const [path, content] of Object.entries(files.components)) {
    if (path.toLowerCase().includes('footer')) {
      const logoMatch = content.match(/font-display[^>]*>([^<]+)/);
      if (logoMatch) logoText = logoMatch[1].trim();
    }
    // Search for navigation links
    if (path.toLowerCase().includes('nav') || path.toLowerCase().includes('header') || path.toLowerCase().includes('footer')) {
      const linkRegex = /(?:to|href)=["']([^"'#]+)["'][^>]*>([^<]+)</g;
      let match;
      while ((match = linkRegex.exec(content)) !== null) {
        const name = match[2].trim();
        if (name && name.length < 30) {
          navItems.push({ name, url: match[1] });
        }
      }
    }
  }
  
  // Detect background from CSS
  const bgColorMatch = files.indexCss?.match(/--background:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  const isDark = bgColorMatch && parseFloat(bgColorMatch[3]) < 20;
  
  return {
    backgroundColor: isDark ? hslToHex(`hsl(${bgColorMatch![1]}, ${bgColorMatch![2]}%, ${bgColorMatch![3]}%)`) : '#ffffff',
    textColor: isDark ? '#e0e8e4' : '#333333',
    navItems: navItems.length > 0 ? navItems : [
      { name: 'Home', url: '/' },
      { name: 'About', url: '/about' },
    ],
    logoText,
    sticky: false,
  };
}

function extractHero(files: SourceProjectFiles): ExtractedDesign['hero'] | undefined {
  // Check hero components first
  for (const [path, content] of Object.entries(files.components)) {
    if (path.toLowerCase().includes('hero')) {
      const h1Match = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
      const pMatch = content.match(/<p[^>]*>([\s\S]{10,}?)<\/p>/);
      const btnMatch = content.match(/<Button[^>]*>([A-Za-z][^<]{1,40})<\/Button>/);
      
      const cleanJsx = (text: string) => text
        .replace(/<[^>]+>/g, '')
        .replace(/\{["']\s*["']\}/g, ' ')
        .replace(/\{[^}]*\}/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      const heading = h1Match ? cleanJsx(h1Match[1]) : undefined;
      const subheading = pMatch ? cleanJsx(pMatch[1]) : undefined;
      
      // Look for hero background image reference
      const imgImportMatch = content.match(/import\s+\w+\s+from\s+["'](@\/assets\/[^"']+)["']/);
      const heroImagePath = imgImportMatch?.[1]?.replace('@/', 'src/');
      const heroImageUrl = heroImagePath ? files.imageUrls?.[heroImagePath] : undefined;
      
      if (heading || subheading) {
        return {
          heading: heading || 'Welcome',
          subheading: subheading,
          ctaText: btnMatch?.[1]?.trim(),
          ctaUrl: '/',
          backgroundImage: heroImageUrl,
        };
      }
    }
  }
  
  // Fallback: check index page directly
  const indexPage = files.indexPage || files.pages['src/pages/Index.tsx'] || '';
  const h1Match = indexPage.match(/<h1[^>]*>([^<]+)</);
  const pMatch = indexPage.match(/<p[^>]*>([^<]{10,})/);
  const btnMatch = indexPage.match(/(?:Button|button|CTA)[^>]*>([^<]+)</);
  
  if (h1Match || pMatch) {
    return {
      heading: h1Match?.[1]?.trim() || 'Welcome',
      subheading: pMatch?.[1]?.trim(),
      ctaText: btnMatch?.[1]?.trim(),
      ctaUrl: '/',
    };
  }
  
  return undefined;
}

function extractSectionsV2(files: SourceProjectFiles): { sections: ExtractedSection[]; warnings: ExtractionWarning[] } {
  const sections: ExtractedSection[] = [];
  const warnings: ExtractionWarning[] = [];
  const indexPage = files.indexPage || files.pages['src/pages/Index.tsx'] || '';

  // Find component usage order in index page
  const componentRegex = /<(\w+)/g;
  let match;
  let sectionIndex = 0;
  const sectionNames = new Set<string>();

  while ((match = componentRegex.exec(indexPage)) !== null) {
    const name = match[1];
    if (name[0] === name[0].toLowerCase()) continue;
    if (['Routes', 'Route', 'BrowserRouter', 'QueryClientProvider', 'TooltipProvider', 'Button', 'Card', 'CardContent', 'Badge'].includes(name)) continue;
    if (sectionNames.has(name)) continue;
    sectionNames.add(name);

    // Find corresponding component file
    let sourceFile: string | undefined;
    let content = '';
    for (const [path, src] of Object.entries(files.components)) {
      const fileName = path.split('/').pop()?.replace(/\.(tsx|jsx)$/, '') || '';
      if (fileName === name) {
        sourceFile = path;
        content = src;
        break;
      }
    }

    if (!content) continue;

    const id = `extracted-${sectionIndex++}`;
    const analysis = analyzeComponent(name, content, files);

    // Skip footer-like sections
    if (analysis.intent === 'footer_like') continue;

    const legacyType = intentToLegacyType(analysis.intent);

    const section: ExtractedSection = {
      id,
      type: legacyType,
      heading: analysis.heading,
      body: analysis.body,
      ctaText: analysis.ctaText,
      ctaUrl: analysis.ctaUrl,
      items: analysis.items,
      intent: analysis.intent,
      confidence: analysis.confidence,
      evidence: analysis.evidence,
      sourceFile,
      repeatedItemCount: analysis.items?.length || 0,
      hasHeading: !!analysis.heading,
      hasBody: !!analysis.body,
      hasButtons: !!analysis.ctaText,
      hasImages: analysis.hasImages,
      hasStats: analysis.intent === 'stats',
      hasTestimonials: analysis.intent === 'testimonial_band',
      hasPricing: analysis.hasPricing,
      hasRepeatedCards: (analysis.items?.length || 0) >= 2,
      mediaIntent: analysis.media.mediaIntent,
      mediaConfidence: analysis.media.mediaConfidence,
      mediaEvidence: analysis.media.mediaEvidence,
      imageTargets: analysis.media.imageTargets,
    };

    sections.push(section);

    // Generate warnings
    if (analysis.intent === 'unknown') {
      warnings.push({ sectionId: id, severity: 'warning', message: `Unknown intent for component "${name}" — may produce generic output` });
    }
    if (analysis.confidence < 0.5) {
      warnings.push({ sectionId: id, severity: 'warning', message: `Low confidence (${(analysis.confidence * 100).toFixed(0)}%) for "${name}" as ${analysis.intent}` });
    }
    if (analysis.intent === 'stats' && (!analysis.items || analysis.items.length === 0)) {
      warnings.push({ sectionId: id, severity: 'warning', message: `Stats section "${name}" detected but no stat values extracted` });
    }
    if (analysis.intent === 'testimonial_band' && (!analysis.items || analysis.items.length === 0)) {
      warnings.push({ sectionId: id, severity: 'warning', message: `Testimonial section "${name}" detected but no quotes extracted` });
    }
    if (analysis.intent === 'program_cards' && (!analysis.items || analysis.items.length === 0)) {
      warnings.push({ sectionId: id, severity: 'warning', message: `Program/cards section "${name}" detected but no repeated items extracted` });
    }
    if (analysis.intent === 'cta_band' && !analysis.ctaText) {
      warnings.push({ sectionId: id, severity: 'warning', message: `CTA section "${name}" detected but no CTA text found` });
    }
  }

  return { sections, warnings };
}

interface MediaAnalysis {
  mediaIntent: MediaIntent;
  mediaConfidence: number;
  mediaEvidence: string[];
  imageTargets: ImageTarget[];
}

interface ComponentAnalysis {
  intent: SectionIntent;
  confidence: number;
  evidence: string[];
  heading?: string;
  body?: string;
  ctaText?: string;
  ctaUrl?: string;
  items?: ExtractedSection['items'];
  hasImages: boolean;
  hasPricing: boolean;
  media: MediaAnalysis;
}

function cleanJsxText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\{["']\s*["']\}/g, ' ')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function analyzeComponent(name: string, content: string, files: SourceProjectFiles): ComponentAnalysis {
  const lower = name.toLowerCase();
  const evidence: string[] = [];
  let intent: SectionIntent = 'unknown';
  let confidence = 0;

  // ── Structural signals ──
  const hasMap = /\.map\(/.test(content);
  const hasH1 = /<h1[\s>]/.test(content);
  const hasH2 = /<h2[\s>]/.test(content);
  const hasButton = /<Button[\s>]/.test(content);
  const hasImg = /<img[\s>]/.test(content) || /import\s+\w+\s+from\s+["']@\/assets\//.test(content);
  const hasQuote = /quote|testimonial/i.test(content);
  const hasPrice = /price|\$\d|price:/i.test(content);
  const hasAccordion = /accordion|faq|question|answer/i.test(content);

  // ── Extract repeated array data ──
  const arrayMatch = content.match(/(?:const|let)\s+(\w+)\s*(?::\s*\w+(?:<[^>]+>)?\s*\[\])?\s*=\s*\[([\s\S]*?)\];/);
  const arrayItems = arrayMatch ? parseArrayItems(arrayMatch[2]) : [];

  // ── Extract heading ──
  const h2Match = content.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
  const heading = h2Match ? cleanJsxText(h2Match[1]) : undefined;

  // ── Extract body ──
  const pMatches = [...content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)];
  const bodyTexts = pMatches.map(m => cleanJsxText(m[1])).filter(t => t && t.length > 15);
  const body = bodyTexts.length > 0 ? bodyTexts[0] : undefined;

  // ── Extract CTA ──
  const btnMatch = content.match(/<Button[^>]*>([A-Za-z][^<]{1,40})<\/Button>/);
  const ctaText = btnMatch?.[1]?.trim();

  // ── Intent classification ──

  // HERO: has h1, usually first section, background image
  if (lower.includes('hero') || (hasH1 && hasImg)) {
    intent = 'hero';
    confidence = lower.includes('hero') ? 0.95 : 0.7;
    if (lower.includes('hero')) evidence.push('Component name contains "hero"');
    if (hasH1) evidence.push('Contains <h1> tag');
    if (hasImg) evidence.push('Contains background image');
    if (hasButton) evidence.push('Has CTA button');
  }

  // STATS: repeated items with value/label pattern, no prices
  else if (hasMap && arrayItems.length >= 2 && arrayItems.every(it => it.value && it.label) && !hasPrice) {
    intent = 'stats';
    confidence = 0.9;
    evidence.push(`${arrayItems.length} repeated items with value/label pattern`);
    if (lower.includes('stat')) { evidence.push('Component name contains "stat"'); confidence = 0.95; }
  }

  // TESTIMONIALS: repeated items with quote/name pattern
  else if (hasMap && arrayItems.length >= 2 && arrayItems.some(it => it.quote)) {
    intent = 'testimonial_band';
    confidence = 0.9;
    evidence.push(`${arrayItems.length} items with quote fields`);
    if (hasQuote) { evidence.push('Component name/content contains "testimonial"'); confidence = 0.95; }
  }

  // PROGRAM CARDS: repeated items with title/description/price
  else if (hasMap && arrayItems.length >= 2 && arrayItems.some(it => it.title && it.description)) {
    intent = hasPrice ? 'program_cards' : 'feature_grid';
    confidence = 0.85;
    evidence.push(`${arrayItems.length} repeated card items with title/description`);
    if (hasPrice) evidence.push('Contains pricing data');
    if (hasImg) evidence.push('Cards include images');
    if (lower.includes('course') || lower.includes('program') || lower.includes('pricing')) {
      evidence.push(`Component name suggests programs/courses`);
      confidence = 0.95;
    }
  }

  // FEATURE GRID: repeated items with title/body but no price
  else if (hasMap && arrayItems.length >= 2 && arrayItems.some(it => it.title || it.heading)) {
    intent = 'feature_grid';
    confidence = 0.75;
    evidence.push(`${arrayItems.length} repeated items with heading pattern`);
    if (lower.includes('feature')) { evidence.push('Component name contains "feature"'); confidence = 0.9; }
  }

  // CTA BAND: heading + button, no repeated items, short content
  else if (hasButton && hasH2 && !hasMap && content.length < 1500) {
    intent = 'cta_band';
    confidence = 0.8;
    evidence.push('Contains heading + button without repeated items');
    if (lower.includes('cta') || lower.includes('calltoaction')) { evidence.push('Component name suggests CTA'); confidence = 0.95; }
  }

  // FAQ
  else if (hasAccordion || lower.includes('faq')) {
    intent = 'faq';
    confidence = lower.includes('faq') ? 0.9 : 0.7;
    evidence.push('Contains FAQ/accordion patterns');
  }

  // FOOTER
  else if (lower.includes('footer') || /<footer[\s>]/.test(content)) {
    intent = 'footer_like';
    confidence = 0.95;
    evidence.push('Component is a footer');
  }

  // CONTENT MEDIA SPLIT: image + text side by side
  else if (hasImg && hasH2 && !hasMap) {
    intent = 'content_media_split';
    confidence = 0.6;
    evidence.push('Contains image + heading without repeated items');
  }

  // HEADING DIVIDER: just a heading, minimal content
  else if (hasH2 && !hasButton && !hasMap && content.length < 500) {
    intent = 'heading_divider';
    confidence = 0.5;
    evidence.push('Short component with heading only');
  }

  // Fallback
  else {
    intent = 'unknown';
    confidence = 0.3;
    evidence.push('No strong signals matched');
    if (lower.includes('stat')) { intent = 'stats'; confidence = 0.6; evidence.push('Name hint: "stat"'); }
    else if (lower.includes('feature')) { intent = 'feature_grid'; confidence = 0.6; evidence.push('Name hint: "feature"'); }
    else if (lower.includes('testimonial')) { intent = 'testimonial_band'; confidence = 0.6; evidence.push('Name hint: "testimonial"'); }
    else if (lower.includes('cta')) { intent = 'cta_band'; confidence = 0.6; evidence.push('Name hint: "cta"'); }
  }

  // ── Build items based on intent ──
  let items: ExtractedSection['items'] | undefined;
  if (arrayItems.length >= 2) {
    items = arrayItems.map((raw, idx) => {
      const item: NonNullable<ExtractedSection['items']>[0] = {};
      if (raw.value) item.value = raw.value;
      if (raw.label) item.heading = raw.label;
      if (raw.title) item.heading = raw.title;
      if (raw.heading) item.heading = raw.heading;
      if (raw.description) item.body = raw.description;
      if (raw.body) item.body = raw.body;
      if (raw.quote) item.quote = raw.quote;
      if (raw.name) item.name = raw.name;
      if (raw.role) item.role = raw.role;
      if (raw.price) item.price = raw.price;
      if (raw.meta && !item.body) item.body = raw.meta;
      else if (raw.meta && item.body) item.body = `${raw.meta} · ${item.body}`;
      if (raw.icon) item.icon = raw.icon;
      if (raw.badge) item.body = item.body ? `${item.body} [${raw.badge}]` : raw.badge;
      // Resolve image URLs for items
      if (raw.image) {
        // raw.image may be a JS variable name referencing an import
        const resolvedUrl = resolveImageUrl(raw.image, content, files);
        item.image = resolvedUrl || raw.image;
      }
      return item;
    }).filter(item => item.heading || item.quote || item.value);
  }

  // ── Media analysis ──
  const media = analyzeMedia(intent, content, files, items);

  return {
    intent,
    confidence,
    evidence,
    heading,
    body,
    ctaText,
    ctaUrl: ctaText ? '/' : undefined,
    items,
    hasImages: hasImg,
    hasPricing: hasPrice,
    media,
  };
}

/** Parse a JS array literal into objects */
function parseArrayItems(arrayContent: string): Record<string, string>[] {
  const items: Record<string, string>[] = [];
  const objectRegex = /\{([^}]+)\}/g;
  let match;
  while ((match = objectRegex.exec(arrayContent)) !== null) {
    const obj: Record<string, string> = {};
    const kvRegex = /(\w+)\s*:\s*(?:"([^"]*?)"|'([^']*?)'|`([^`]*?)`|(\w+))/g;
    let kv;
    while ((kv = kvRegex.exec(match[1])) !== null) {
      const key = kv[1];
      const value = kv[2] ?? kv[3] ?? kv[4] ?? kv[5];
      if (value && !['true', 'false', 'null', 'undefined'].includes(value)) {
        obj[key] = value;
      }
    }
    if (Object.keys(obj).length > 0) items.push(obj);
  }
  return items;
}

function intentToLegacyType(intent: SectionIntent): ExtractedSection['type'] {
  switch (intent) {
    case 'hero': return 'hero';
    case 'stats': return 'content';
    case 'feature_grid': return 'features';
    case 'program_cards': return 'features';
    case 'testimonial_band': return 'testimonials';
    case 'cta_band': return 'cta';
    case 'content_media_split': return 'content';
    case 'heading_divider': return 'content';
    case 'faq': return 'faq';
    case 'footer_like': return 'content';
    case 'unknown': return 'content';
  }
}

function extractFooter(files: SourceProjectFiles): ExtractedDesign['footer'] {
  // Try to extract from footer component
  for (const [path, content] of Object.entries(files.components)) {
    if (path.toLowerCase().includes('footer')) {
      const logoMatch = content.match(/font-display[^>]*>([^<]+)/);
      const copyrightMatch = content.match(/©\s*\d{4}\s*([^<"]+)/);
      const linkMatches = [...content.matchAll(/href=["']#["'][^>]*>([^<]+)/g)];
      
      return {
        backgroundColor: '#0d1520',
        textColor: '#ffffff',
        columns: linkMatches.length > 0 ? 2 : 1,
        copyright: copyrightMatch ? `© ${copyrightMatch[0]}` : `© ${new Date().getFullYear()} All rights reserved.`,
      };
    }
  }
  
  return {
    backgroundColor: '#1a1a2e',
    textColor: '#ffffff',
    columns: 2,
    copyright: `© ${new Date().getFullYear()} All rights reserved.`,
  };
}

function extractAssets(files: SourceProjectFiles): ExtractedAsset[] {
  return files.assets.map(path => ({
    sourcePath: path,
    fileName: path.split('/').pop() || path,
    type: 'image' as const,
    url: files.imageUrls?.[path],
  }));
}

// Convert HSL CSS value to hex for Kajabi
export function hslToHex(hslString: string): string {
  const match = hslString.match(/hsl\(([\d.]+),?\s*([\d.]+)%,?\s*([\d.]+)%\)/);
  if (!match) return hslString;
  
  const h = parseFloat(match[1]);
  const s = parseFloat(match[2]) / 100;
  const l = parseFloat(match[3]) / 100;
  
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; g = c; }
  else { r = c; g = x; }
  
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
