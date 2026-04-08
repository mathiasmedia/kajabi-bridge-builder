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
  const actionButtons: Array<{ text: string; url: string; variant?: 'primary' | 'outline' }> = [];
  const seen = new Set<string>();
  let logoText: string | undefined;
  let sticky = false;
  
  const addNavItem = (name: string, url: string) => {
    const key = `${name.toLowerCase()}|${url}`;
    if (seen.has(key)) return;
    if (!name || name.length >= 30) return;
    if (/^[<{]|className|onClick|icon|svg/i.test(name)) return;
    seen.add(key);
    navItems.push({ name: name.trim(), url });
  };

  // 1. Extract from header/nav components
  for (const [path, content] of Object.entries(files.components)) {
    const lower = path.toLowerCase();
    
    // Logo text from header or footer
    if (lower.includes('header') || lower.includes('footer')) {
      if (!logoText) {
        const logoMatch = content.match(/(?:font-display|font-heading|font-bold[^>]*text-(?:xl|2xl|lg))[^>]*>([^<]+)/);
        if (logoMatch) logoText = logoMatch[1].trim();
      }
    }
    
    if (lower.includes('nav') || lower.includes('header')) {
      // Detect sticky header
      if (/sticky\s+top-0|fixed\s+top-0/i.test(content)) sticky = true;

      // Array-style nav: const navLinks = [{ name: "Home", path: "/" }, ...]
      const arrayMatch = content.match(/(?:navLinks|links|navItems|menuItems)\s*=\s*\[([\s\S]*?)\];/);
      if (arrayMatch) {
        const itemRegex = /name\s*:\s*["']([^"']+)["'][\s\S]*?(?:path|to|href|url)\s*:\s*["']([^"']+)["']/g;
        let m;
        while ((m = itemRegex.exec(arrayMatch[1])) !== null) {
          addNavItem(m[1], m[2]);
        }
      }
      
      // Inline links
      const linkRegex = /(?:to|href)=["']([^"']+)["'][^>]*>([^<{]+)</g;
      let match;
      while ((match = linkRegex.exec(content)) !== null) {
        const url = match[1];
        const name = match[2].trim();
        if (name && name.length < 30 && !/icon|svg|className/i.test(name)) {
          addNavItem(name, url === '#' ? '/' : url);
        }
      }

      // Detect action buttons in header (right-side CTAs)
      // Pattern: <Link to="/..."><Button ...>Text</Button></Link>
      // Typically after the nav section, often in a div with hidden md:flex
      const actionBtnRegex = /<Link\s+to=["']([^"']+)["'][^>]*>\s*<Button[^>]*(?:variant=["']([^"']+)["'])?[^>]*>([^<]+)<\/Button>/g;
      let abm;
      while ((abm = actionBtnRegex.exec(content)) !== null) {
        const url = abm[1];
        const variant = abm[2];
        const text = abm[3].trim();
        if (text && text.length < 30 && !navItems.some(n => n.name === text)) {
          actionButtons.push({
            text,
            url,
            variant: variant === 'outline' ? 'outline' : 'primary',
          });
        }
      }
    }
  }

  // 2. Fallback: extract routes from App.tsx
  if (navItems.length === 0 && files.appTsx) {
    const routeRegex = /path=["']([^"'*]+)["']/g;
    let match;
    while ((match = routeRegex.exec(files.appTsx)) !== null) {
      const path = match[1];
      if (path === '/') {
        addNavItem('Home', '/');
      } else {
        const name = path.replace(/^\//, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        addNavItem(name, path);
      }
    }
  }

  // 3. Fallback: extract from inline index page nav patterns
  if (navItems.length === 0) {
    const indexPage = files.indexPage || '';
    const linkRegex = /(?:to|href)=["']([^"'#]+)["'][^>]*>([^<{]+)</g;
    let match;
    while ((match = linkRegex.exec(indexPage)) !== null) {
      addNavItem(match[2], match[1]);
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
    sticky,
    actionButtons: actionButtons.length > 0 ? actionButtons : undefined,
  };
}

function extractHero(files: SourceProjectFiles): ExtractedDesign['hero'] | undefined {
  // Check hero components first
  for (const [path, content] of Object.entries(files.components)) {
    if (path.toLowerCase().includes('hero')) {
      const h1Match = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
      const pMatch = content.match(/<p[^>]*>([\s\S]{10,}?)<\/p>/);
      // Extract all Button components
      const btnMatches = [...content.matchAll(/<Button[^>]*>([A-Za-z][^<]{1,40})<\/Button>/g)];
      
      const cleanJsx = (text: string) => text
        .replace(/<[^>]+>/g, '')
        .replace(/\{["']\s*["']\}/g, ' ')
        .replace(/\{[^}]*\}/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      const heading = h1Match ? cleanJsx(h1Match[1]) : undefined;
      const subheading = pMatch ? cleanJsx(pMatch[1]) : undefined;

      // Detect eyebrow text (small text above h1)
      let eyebrow: string | undefined;
      const eyebrowMatch = content.match(/<p[^>]*(?:tracking|uppercase|text-sm|text-xs)[^>]*>([^<]+)<\/p>\s*(?:<[^h]|[\s\S]*?)<h1/);
      if (eyebrowMatch) eyebrow = cleanJsx(eyebrowMatch[1]);

      // Detect inline emphasis (e.g. text-gradient, accent-colored span)
      let emphasisWord: string | undefined;
      if (h1Match) {
        const spanMatch = h1Match[1].match(/<span[^>]*(?:text-gradient|text-accent|text-primary|accent)[^>]*>([^<]+)<\/span>/);
        if (spanMatch) emphasisWord = cleanJsx(spanMatch[1]);
      }
      
      // Look for hero background image reference
      const imgImportMatch = content.match(/import\s+\w+\s+from\s+["'](@\/assets\/[^"']+)["']/);
      const heroImagePath = imgImportMatch?.[1]?.replace('@/', 'src/');
      const heroImageUrl = heroImagePath ? files.imageUrls?.[heroImagePath] : undefined;
      
      if (heading || subheading) {
        return {
          heading: heading || 'Welcome',
          subheading: subheading,
          ctaText: btnMatches[0]?.[1]?.trim(),
          ctaUrl: '/',
          secondaryCtaText: btnMatches[1]?.[1]?.trim(),
          secondaryCtaUrl: btnMatches[1] ? '/' : undefined,
          backgroundImage: heroImageUrl,
          eyebrow,
          emphasisWord,
        };
      }
    }
  }
  
  // Fallback: check index page directly
  const indexPage = files.indexPage || files.pages['src/pages/Index.tsx'] || '';

  // Try inline hero section
  const heroSectionMatch = indexPage.match(/\{\/\*\s*Hero\s*(?:Section)?\s*\*\/\}\s*<section[\s>]([\s\S]*?)<\/section>/);
  const heroContent = heroSectionMatch?.[1] || indexPage;

  const h1Match = heroContent.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const pMatch = heroContent.match(/<p[^>]*>([\s\S]{10,}?)<\/p>/);
  const btnMatches = [...heroContent.matchAll(/<Button[^>]*>([A-Za-z][^<]{1,40})<\/Button>/g)];
  
  if (h1Match || pMatch) {
    // Detect eyebrow
    let eyebrow: string | undefined;
    const eyebrowMatch = heroContent.match(/<span[^>]*(?:text-sm|text-xs)[^>]*>([^<]+)<\/span>\s*(?:[\s\S]*?)<h1/);
    if (eyebrowMatch) eyebrow = cleanJsx(eyebrowMatch[1]);

    // Detect emphasis
    let emphasisWord: string | undefined;
    if (h1Match) {
      const spanMatch = h1Match[1].match(/<span[^>]*(?:text-gradient|accent)[^>]*>([^<]+)<\/span>/);
      if (spanMatch) emphasisWord = cleanJsx(spanMatch[1]);
    }

    return {
      heading: h1Match ? cleanJsx(h1Match[1]) : 'Welcome',
      subheading: pMatch ? cleanJsx(pMatch[1]) : undefined,
      ctaText: btnMatches[0]?.[1]?.trim(),
      ctaUrl: '/',
      secondaryCtaText: btnMatches[1]?.[1]?.trim(),
      secondaryCtaUrl: btnMatches[1] ? '/' : undefined,
      eyebrow,
      emphasisWord,
    };
  }
  
  return undefined;

  function cleanJsx(text: string) {
    return text.replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
  }
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
  let foundComponentSections = false;

  while ((match = componentRegex.exec(indexPage)) !== null) {
    const name = match[1];
    if (name[0] === name[0].toLowerCase()) continue;
    if (['Routes', 'Route', 'BrowserRouter', 'QueryClientProvider', 'TooltipProvider', 'Button', 'Card', 'CardContent', 'Badge', 'Link', 'ArrowRight', 'Sparkles', 'Target', 'Zap', 'Users', 'Star', 'CheckCircle'].includes(name)) continue;
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
    foundComponentSections = true;

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
      secondaryCtaText: analysis.secondaryCtaText,
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
      hasIcons: analysis.hasIcons,
      hasChecklist: analysis.hasChecklist,
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

  // ── Inline section fallback ──
  // If no component-based sections found, parse inline <section> blocks from indexPage
  if (!foundComponentSections && indexPage.length > 200) {
    const inlineSections = extractInlineSections(indexPage, files);
    for (const sec of inlineSections.sections) {
      sec.id = `extracted-${sectionIndex++}`;
      sections.push(sec);
    }
    warnings.push(...inlineSections.warnings);
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
  secondaryCtaText?: string;
  items?: ExtractedSection['items'];
  hasImages: boolean;
  hasPricing: boolean;
  hasIcons?: boolean;
  hasChecklist?: boolean;
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

// ── Inline section extraction ──
// When the indexPage has sections defined inline (not as separate component files),
// parse <section> blocks and analyze each one as if it were a component.

function extractInlineSections(indexPage: string, files: SourceProjectFiles): { sections: ExtractedSection[]; warnings: ExtractionWarning[] } {
  const sections: ExtractedSection[] = [];
  const warnings: ExtractionWarning[] = [];

  // Split by <section> tags — find each section block
  const sectionRegex = /(?:\{\/\*\s*([^*]+?)\s*\*\/\}\s*)?<section[\s>]([\s\S]*?)<\/section>/g;
  let match;

  // Also extract array data defined before the return statement
  // These are shared across inline sections
  const arrayDataMap = extractAllArrayData(indexPage);

  while ((match = sectionRegex.exec(indexPage)) !== null) {
    const comment = (match[1] || '').trim();
    const sectionContent = match[2];

    // Analyze this inline section block
    const analysis = analyzeInlineSection(comment, sectionContent, arrayDataMap, files);
    if (analysis.intent === 'footer_like') continue;

    const legacyType = intentToLegacyType(analysis.intent);

    const section: ExtractedSection = {
      id: '', // will be set by caller
      type: legacyType,
      heading: analysis.heading,
      body: analysis.body,
      ctaText: analysis.ctaText,
      ctaUrl: analysis.ctaUrl,
      secondaryCtaText: analysis.secondaryCtaText,
      items: analysis.items,
      intent: analysis.intent,
      confidence: analysis.confidence,
      evidence: analysis.evidence,
      repeatedItemCount: analysis.items?.length || 0,
      hasHeading: !!analysis.heading,
      hasBody: !!analysis.body,
      hasButtons: !!analysis.ctaText,
      hasImages: analysis.hasImages,
      hasStats: analysis.intent === 'stats',
      hasTestimonials: analysis.intent === 'testimonial_band',
      hasPricing: analysis.hasPricing,
      hasRepeatedCards: (analysis.items?.length || 0) >= 2,
      hasIcons: analysis.hasIcons,
      hasChecklist: analysis.hasChecklist,
      mediaIntent: analysis.media.mediaIntent,
      mediaConfidence: analysis.media.mediaConfidence,
      mediaEvidence: analysis.media.mediaEvidence,
      imageTargets: analysis.media.imageTargets,
    };

    sections.push(section);
  }

  return { sections, warnings };
}

function extractAllArrayData(content: string): Record<string, Record<string, string>[]> {
  const map: Record<string, Record<string, string>[]> = {};
  const arrayRegex = /(?:const|let)\s+(\w+)\s*(?::\s*\w+(?:<[^>]+>)?\s*\[\])?\s*=\s*\[([\s\S]*?)\];/g;
  let match;
  while ((match = arrayRegex.exec(content)) !== null) {
    const name = match[1];
    const items = parseArrayItems(match[2]);
    if (items.length > 0) map[name] = items;
  }
  return map;
}

function analyzeInlineSection(
  comment: string,
  content: string,
  arrayDataMap: Record<string, Record<string, string>[]>,
  files: SourceProjectFiles,
): ComponentAnalysis {
  const evidence: string[] = [];
  let intent: SectionIntent = 'unknown';
  let confidence = 0;
  const commentLower = comment.toLowerCase();

  // Structural signals
  const hasH1 = /<h1[\s>]/.test(content);
  const hasH2 = /<h2[\s>]/.test(content);
  const hasButton = /<Button[\s>]/.test(content);
  const hasImg = /<img[\s>]/.test(content);
  const hasQuote = /quote|testimonial|blockquote/i.test(content);
  const hasPrice = /price|\$\d/i.test(content);
  const hasMap = /\.map\(/.test(content);

  // Find which array variable is used in this section via .map()
  let usedArrayItems: Record<string, string>[] = [];
  const mapMatch = content.match(/\{(\w+)\.map\(/);
  if (mapMatch && arrayDataMap[mapMatch[1]]) {
    usedArrayItems = arrayDataMap[mapMatch[1]];
  }

  // Extract heading
  const h2Match = content.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
  const heading = h2Match ? cleanJsxText(h2Match[1]) : undefined;

  // Extract body
  const pMatches = [...content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)];
  const bodyTexts = pMatches.map(m => cleanJsxText(m[1])).filter(t => t && t.length > 15);
  const body = bodyTexts.length > 0 ? bodyTexts[0] : undefined;

  // Extract CTA
  const btnMatch = content.match(/<Button[^>]*>([A-Za-z][^<]{1,40})/);
  const ctaText = btnMatch?.[1]?.trim();

  // Intent classification using comment hints + structural signals
  if (commentLower.includes('hero') || hasH1) {
    intent = 'hero';
    confidence = commentLower.includes('hero') ? 0.95 : 0.7;
    if (commentLower.includes('hero')) evidence.push('Comment indicates hero section');
    if (hasH1) evidence.push('Contains <h1> tag');
  } else if (hasQuote && hasMap && usedArrayItems.some(it => it.quote)) {
    intent = 'testimonial_band';
    confidence = 0.9;
    evidence.push(`${usedArrayItems.length} items with quote fields`);
    if (commentLower.includes('testimonial') || commentLower.includes('social proof')) {
      evidence.push('Comment indicates testimonials');
      confidence = 0.95;
    }
  } else if (hasMap && usedArrayItems.length >= 2 && usedArrayItems.some(it => it.title && it.description) && !hasQuote) {
    intent = hasPrice ? 'program_cards' : 'feature_grid';
    confidence = 0.85;
    evidence.push(`${usedArrayItems.length} repeated card items`);
    if (commentLower.includes('problem') || commentLower.includes('feature')) {
      evidence.push('Comment indicates feature/problem section');
    }
  } else if (hasButton && hasH2 && !hasMap && content.length < 2000) {
    intent = 'cta_band';
    confidence = 0.8;
    evidence.push('Contains heading + button without repeated items');
    if (commentLower.includes('cta')) { evidence.push('Comment indicates CTA'); confidence = 0.95; }
  } else if (hasH2 && !hasMap && hasButton) {
    intent = 'content_media_split';
    confidence = 0.6;
    evidence.push('Contains heading + content + button');
    if (commentLower.includes('solution')) { evidence.push('Comment indicates solution section'); }
  } else {
    intent = 'unknown';
    confidence = 0.3;
    evidence.push('No strong signals matched');
  }

  // Build items from matched array
  let items: ExtractedSection['items'] | undefined;
  if (usedArrayItems.length >= 2) {
    items = usedArrayItems.map(raw => {
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
      if (raw.author) item.name = raw.author;
      if (raw.price) item.price = raw.price;
      if (raw.icon) item.icon = raw.icon;
      return item;
    }).filter(item => item.heading || item.quote || item.value);
  }

  // Media analysis
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

function analyzeComponent(name: string, content: string, files: SourceProjectFiles): ComponentAnalysis {
  const lower = name.toLowerCase();
  const evidence: string[] = [];
  let intent: SectionIntent = 'unknown';
  let confidence = 0;


  const hasMap = /\.map\(/.test(content);
  const hasH1 = /<h1[\s>]/.test(content);
  const hasH2 = /<h2[\s>]/.test(content);
  const hasButton = /<Button[\s>]/.test(content);
  const hasImg = /<img[\s>]/.test(content) || /import\s+\w+\s+from\s+["']@\/assets\//.test(content);
  const hasQuote = /quote|testimonial/i.test(content);
  const hasPrice = /price|\$\d|price:/i.test(content);
  const hasAccordion = /Accordion|AccordionItem|AccordionTrigger|AccordionContent/i.test(content);

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

  // Detect icon presence in items
  const hasIcons = arrayItems.some(it => it.icon);
  // Detect checklist/bullet pattern
  const hasChecklist = /CheckCircle|Check\b|checklist|bullet/i.test(content) || (content.match(/<li[\s>]/g) || []).length >= 2;
  // Detect dual CTAs
  const btnMatches = [...content.matchAll(/<Button[^>]*>([A-Za-z][^<]{1,40})<\/Button>/g)];
  const secondaryCtaText = btnMatches[1]?.[1]?.trim();

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

  // ICON CARD ROW: repeated items with icon + title + description, no price/quote
  else if (hasMap && arrayItems.length >= 2 && hasIcons && arrayItems.some(it => it.title || it.heading) && !hasPrice && !hasQuote) {
    intent = 'icon_card_row';
    confidence = 0.9;
    evidence.push(`${arrayItems.length} repeated items with icon + heading pattern`);
    if (lower.includes('problem') || lower.includes('feature') || lower.includes('benefit')) {
      evidence.push(`Component name suggests icon cards`);
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

  // FAQ — requires strong structural evidence: accordion components AND repeated Q/A items
  else if (hasAccordion && hasMap && arrayItems.length >= 2 && arrayItems.some(it => (it.question || it.answer))) {
    intent = 'faq';
    confidence = 0.9;
    evidence.push(`Accordion component with ${arrayItems.length} Q/A items`);
    if (lower.includes('faq')) { evidence.push('Component name contains "faq"'); confidence = 0.95; }
  }
  else if (hasAccordion && hasMap && arrayItems.length >= 2) {
    intent = 'faq';
    confidence = 0.7;
    evidence.push(`Accordion component with ${arrayItems.length} repeated items (no explicit Q/A fields)`);
  }

  // FOOTER
  else if (lower.includes('footer') || /<footer[\s>]/.test(content)) {
    intent = 'footer_like';
    confidence = 0.95;
    evidence.push('Component is a footer');
  }

  // CONTENT MEDIA SPLIT: image + text side by side (or checklist + visual)
  else if (hasImg && hasH2 && !hasMap) {
    intent = 'content_media_split';
    confidence = 0.6;
    evidence.push('Contains image + heading without repeated items');
    if (hasChecklist) { evidence.push('Contains checklist/bullet items'); confidence = 0.75; }
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
    secondaryCtaText,
    hasIcons,
    hasChecklist,
  };
}

/** Resolve an image reference (variable name or path) to a public URL */
function resolveImageUrl(imageRef: string, componentContent: string, files: SourceProjectFiles): string | undefined {
  // If it's already a URL, return it
  if (imageRef.startsWith('http')) return imageRef;

  // Check if it's a variable name imported from assets
  // Pattern: import varName from "@/assets/filename.jpg"
  const importRegex = new RegExp(`import\\s+${escapeRegex(imageRef)}\\s+from\\s+["'](@\\/assets\\/[^"']+)["']`);
  const importMatch = componentContent.match(importRegex);
  if (importMatch) {
    const assetPath = importMatch[1].replace('@/', 'src/');
    return files.imageUrls?.[assetPath];
  }

  // Direct path match
  const directPath = imageRef.replace('@/', 'src/');
  return files.imageUrls?.[directPath];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Analyze media intent for a component based on its intent, content, and items */
function analyzeMedia(
  intent: SectionIntent,
  content: string,
  files: SourceProjectFiles,
  items: ExtractedSection['items'] | undefined,
): MediaAnalysis {
  const mediaEvidence: string[] = [];
  const imageTargets: ImageTarget[] = [];

  // Detect image imports
  const importMatches = [...content.matchAll(/import\s+(\w+)\s+from\s+["'](@\/assets\/[^"']+)["']/g)];
  const hasBackgroundImg = /(?:bg-|background|object-cover|absolute\s+inset-0|inset-0.*object-cover)/i.test(content);
  const hasInlineImg = /<img[\s>]/.test(content);
  const itemsWithImages = items?.filter(i => i.image) || [];

  // Resolve all imported images
  for (const im of importMatches) {
    const varName = im[1];
    const assetPath = im[2].replace('@/', 'src/');
    const url = files.imageUrls?.[assetPath];
    if (url) {
      // Determine role based on usage in content
      const isUsedAsBg = new RegExp(`src=\\{${varName}\\}[^>]*(?:object-cover|absolute|inset)`, 'i').test(content) || hasBackgroundImg;
      if (intent === 'hero' && isUsedAsBg) {
        imageTargets.push({ role: 'hero_bg', sourcePath: assetPath, url });
        mediaEvidence.push(`Hero background image: ${assetPath}`);
      } else if (intent === 'hero') {
        imageTargets.push({ role: 'hero_fg', sourcePath: assetPath, url });
        mediaEvidence.push(`Hero foreground image: ${assetPath}`);
      } else if (intent === 'content_media_split') {
        imageTargets.push({ role: 'content_image', sourcePath: assetPath, url });
        mediaEvidence.push(`Content image: ${assetPath}`);
      } else {
        imageTargets.push({ role: 'decorative', sourcePath: assetPath, url });
        mediaEvidence.push(`Decorative image: ${assetPath}`);
      }
    }
  }

  // Resolve item images as card images
  if (itemsWithImages.length > 0) {
    for (let i = 0; i < itemsWithImages.length; i++) {
      const item = itemsWithImages[i];
      if (item.image && (item.image.startsWith('http') || files.imageUrls?.[item.image.replace('@/', 'src/')])) {
        const url = item.image.startsWith('http') ? item.image : files.imageUrls?.[item.image.replace('@/', 'src/')];
        if (url) {
          imageTargets.push({
            role: 'card_image',
            sourcePath: item.image,
            url,
            itemIndex: items?.indexOf(item),
          });
        }
      }
    }
    if (imageTargets.some(t => t.role === 'card_image')) {
      mediaEvidence.push(`${itemsWithImages.length} card images found in repeated items`);
    }
  }

  // Determine media intent
  let mediaIntent: MediaIntent = 'no_media';
  let mediaConfidence = 0;

  if (intent === 'hero' && imageTargets.some(t => t.role === 'hero_bg')) {
    mediaIntent = 'background_image';
    mediaConfidence = 0.95;
  } else if (intent === 'hero' && imageTargets.some(t => t.role === 'hero_fg')) {
    mediaIntent = 'foreground_image';
    mediaConfidence = 0.8;
  } else if (imageTargets.some(t => t.role === 'card_image') && itemsWithImages.length >= 2) {
    mediaIntent = 'repeated_card_images';
    mediaConfidence = 0.9;
  } else if (intent === 'content_media_split' && imageTargets.length > 0) {
    mediaIntent = 'foreground_image';
    mediaConfidence = 0.8;
  } else if (hasInlineImg || importMatches.length > 0) {
    mediaIntent = 'decorative_image';
    mediaConfidence = 0.5;
    if (mediaEvidence.length === 0) mediaEvidence.push('Contains image elements');
  } else {
    mediaConfidence = 0.9; // high confidence there's no media
  }

  return { mediaIntent, mediaConfidence, mediaEvidence, imageTargets };
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
  let copyright: string | undefined;
  let logoText: string | undefined;
  const linkGroups: Record<string, Array<{ name: string; url: string }>> = {};
  
  // Try to extract from footer component
  for (const [path, content] of Object.entries(files.components)) {
    if (!path.toLowerCase().includes('footer')) continue;
    
    const logoMatch = content.match(/(?:font-display|font-heading|font-bold)[^>]*>([^<]+)/);
    if (logoMatch) logoText = logoMatch[1].trim();
    
    const copyrightMatch = content.match(/©\s*\d{4}\s*([^<"]+)/);
    if (copyrightMatch) copyright = `© ${copyrightMatch[0].trim()}`;
    
    // Extract link groups from footer
    // Pattern: footerLinks = { company: [...], resources: [...] }
    const groupRegex = /(\w+)\s*:\s*\[\s*((?:\{[^}]*\}\s*,?\s*)+)\]/g;
    let gMatch;
    while ((gMatch = groupRegex.exec(content)) !== null) {
      const groupName = gMatch[1];
      const groupContent = gMatch[2];
      const links: Array<{ name: string; url: string }> = [];
      const linkRegex = /name\s*:\s*["']([^"']+)["'][\s\S]*?(?:path|to|href|url)\s*:\s*["']([^"']+)["']/g;
      let lm;
      while ((lm = linkRegex.exec(groupContent)) !== null) {
        links.push({ name: lm[1], url: lm[2] });
      }
      if (links.length > 0) linkGroups[groupName] = links;
    }
    
    // Fallback: inline links (including href="#" placeholder links)
    if (Object.keys(linkGroups).length === 0) {
      const inlineLinks: Array<{ name: string; url: string }> = [];
      const linkRegex = /(?:to|href)=["']([^"']+)["'][^>]*>([^<{]+)</g;
      let lm;
      while ((lm = linkRegex.exec(content)) !== null) {
        const name = lm[2].trim();
        const url = lm[1];
        if (name && name.length < 30 && !/icon|svg|className/i.test(name)) {
          inlineLinks.push({ name, url: url === '#' ? '/' : url });
      }
    }
      if (inlineLinks.length > 0) linkGroups['main'] = inlineLinks;
    }
  }
  
  // Detect footer colors from CSS
  const primaryMatch = files.indexCss?.match(/--primary:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  const bgColorMatch = files.indexCss?.match(/--background:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  const isDark = bgColorMatch && parseFloat(bgColorMatch[3]) < 20;
  const footerBg = primaryMatch
    ? hslToHex(`hsl(${primaryMatch[1]}, ${primaryMatch[2]}%, ${primaryMatch[3]}%)`)
    : isDark ? '#0d1520' : '#1a1a2e';
  
  return {
    backgroundColor: footerBg,
    textColor: '#ffffff',
    columns: Object.keys(linkGroups).length > 1 ? Object.keys(linkGroups).length + 1 : 2,
    copyright: copyright || `© ${new Date().getFullYear()} ${logoText || ''} All rights reserved.`.trim(),
    linkGroups: Object.keys(linkGroups).length > 0 ? linkGroups : undefined,
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
