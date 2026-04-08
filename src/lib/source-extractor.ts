import type { ExtractedDesign, ExtractedColor, ExtractedSection, ExtractedAsset } from '@/types';

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

export function extractDesignFromSource(files: SourceProjectFiles): ExtractedDesign {
  const colors = extractColors(files.indexCss || '', files.tailwindConfig || '');
  const fonts = extractFonts(files.indexCss || '', files.tailwindConfig || '');
  const buttonStyle = extractButtonStyle(files);
  const header = extractHeader(files);
  const hero = extractHero(files);
  const sections = extractSections(files);
  const footer = extractFooter(files);
  const assets = extractAssets(files);

  return {
    colors,
    headingFont: fonts.heading,
    bodyFont: fonts.body,
    buttonStyle,
    header,
    hero,
    sections,
    footer,
    assets,
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

function extractSections(files: SourceProjectFiles): ExtractedSection[] {
  const sections: ExtractedSection[] = [];
  const indexPage = files.indexPage || files.pages['src/pages/Index.tsx'] || '';
  
  // Look for component usage in index page to determine section order
  const componentRegex = /<(\w+)/g;
  let match;
  let sectionIndex = 0;
  const sectionNames = new Set<string>();
  
  while ((match = componentRegex.exec(indexPage)) !== null) {
    const name = match[1];
    // Skip HTML elements (lowercase) and common wrappers
    if (name[0] === name[0].toLowerCase()) continue;
    if (['Routes', 'Route', 'BrowserRouter', 'QueryClientProvider', 'TooltipProvider'].includes(name)) continue;
    if (sectionNames.has(name)) continue;
    sectionNames.add(name);
    
    const type = inferSectionType(name);
    
    // Try to find this component's file and extract rich content
    let heading = name.replace(/([A-Z])/g, ' $1').trim();
    let body: string | undefined;
    let ctaText: string | undefined;
    let ctaUrl: string | undefined;
    let items: ExtractedSection['items'] = [];
    
    for (const [path, content] of Object.entries(files.components)) {
      const fileName = path.split('/').pop()?.replace(/\.(tsx|jsx)$/, '') || '';
      if (fileName === name) {
        // Extract heading
        const h2Match = content.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/);
        if (h2Match) {
          heading = cleanJsxText(h2Match[1]) || heading;
        }
        
        // Extract body text from paragraphs
        const pMatches = [...content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)];
        const bodyTexts = pMatches
          .map(m => cleanJsxText(m[1]))
          .filter(t => t && t.length > 15);
        if (bodyTexts.length > 0) {
          body = bodyTexts.join(' ');
        }
        
        // Extract CTA buttons
        const btnMatch = content.match(/<Button[^>]*>([A-Za-z][^<]{1,40})<\/Button>/);
        if (btnMatch) {
          ctaText = btnMatch[1].trim();
          const hrefMatch = content.match(/(?:to|href)=["']([^"']+)["'][^>]*>\s*<Button|<Button[^>]*(?:to|href)=["']([^"']+)["']/);
          ctaUrl = hrefMatch ? (hrefMatch[1] || hrefMatch[2]) : '/';
        }
        
        // Extract repeated items (cards, features, stats, testimonials)
        const mapMatch = content.match(/\.map\(\s*\(\s*(\w+)/);
        if (mapMatch) {
          const arrayMatch = content.match(/(?:const|let)\s+\w+\s*=\s*\[([\s\S]*?)\]/);
          if (arrayMatch) {
            const itemMatches = [...arrayMatch[1].matchAll(/\{([^}]+)\}/g)];
            items = itemMatches.slice(0, 8).map(m => {
              const itemStr = m[1];
              const titleMatch = itemStr.match(/(?:title|heading|name|label|author)\s*:\s*["']([^"']+)["']/);
              const descMatch = itemStr.match(/(?:description|body|text|quote|testimonial|copy)\s*:\s*["']([^"']+)["']/);
              const metaMatch = itemStr.match(/(?:meta|subtitle|role|duration|location|details)\s*:\s*["']([^"']+)["']/);
              const valueMatch = itemStr.match(/(?:value|stat|number|count|amount|price)\s*:\s*["']([^"']+)["']/);
              const iconMatch = itemStr.match(/(?:icon|image)\s*:\s*["']?(\w+)["']?/);
              const hasPriceLikeValue = /(?:price|amount)\s*:/.test(itemStr);

              const heading = titleMatch?.[1] || valueMatch?.[1];
              const bodyParts: string[] = [];

              if (descMatch?.[1]) bodyParts.push(descMatch[1]);
              if (metaMatch?.[1]) bodyParts.push(metaMatch[1]);
              if (hasPriceLikeValue && valueMatch?.[1]) bodyParts.push(valueMatch[1]);
              if (!descMatch?.[1] && !metaMatch?.[1] && titleMatch?.[1] && valueMatch?.[1] && !hasPriceLikeValue) {
                bodyParts.push(titleMatch[1]);
              }

              return {
                heading,
                body: bodyParts.length > 0 ? bodyParts.join(' · ') : undefined,
                icon: iconMatch?.[1],
                value: valueMatch?.[1],
              };
            }).filter(item => item.heading || item.body);
          }
        }
        
        // Also extract items from repeated JSX patterns (e.g. multiple cards)
        if (items.length === 0) {
          const cardMatches = [...content.matchAll(/<(?:Card|div)[^>]*class[^>]*>[\s\S]*?<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g)];
          if (cardMatches.length >= 2) {
            items = cardMatches.slice(0, 8).map(m => ({
              heading: cleanJsxText(m[1]),
              body: cleanJsxText(m[2]),
            })).filter(item => item.heading);
          }
        }
        
        break;
      }
    }
    
    sections.push({
      id: `extracted-${sectionIndex++}`,
      type,
      heading,
      body,
      ctaText,
      ctaUrl,
      items: items && items.length > 0 ? items : undefined,
    });
  }
  
  return sections;
}

function cleanJsxText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\{["']\s*["']\}/g, ' ')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferSectionType(name: string): ExtractedSection['type'] {
  const lower = name.toLowerCase();
  if (lower.includes('hero')) return 'hero';
  if (lower.includes('feature') || lower.includes('course')) return 'features';
  if (lower.includes('testimonial')) return 'testimonials';
  if (lower.includes('cta') || lower.includes('calltoaction')) return 'cta';
  if (lower.includes('pricing')) return 'pricing';
  if (lower.includes('faq')) return 'faq';
  if (lower.includes('contact')) return 'contact';
  if (lower.includes('gallery')) return 'gallery';
  if (lower.includes('stat')) return 'content';
  if (lower.includes('footer')) return 'content';
  return 'content';
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
