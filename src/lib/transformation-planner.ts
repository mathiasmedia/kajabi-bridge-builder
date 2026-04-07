import type { ExtractedDesign, TransformationPlan, TransformationOperation, ValidationWarning, KajabiThemeData } from '@/types';
import { getThemeSections, getContentForPage, getThemeGlobalSettings } from './kajabi-theme-loader';
import { hslToHex } from './source-extractor';

export function buildTransformationPlan(
  extracted: ExtractedDesign,
  theme: KajabiThemeData,
  sourceProjectId: string,
  sourceProjectName: string,
  page: string = 'index',
): TransformationPlan {
  const operations: TransformationOperation[] = [];
  const warnings: ValidationWarning[] = [];
  const sections = getThemeSections(theme);
  const contentFor = getContentForPage(theme, page);

  // Helper to convert extracted HSL colors to hex
  const toHex = (color: string) => color.startsWith('#') ? color : hslToHex(color);

  // ── 1. Global colors ──
  const primaryColor = extracted.colors.find(c => c.usage === 'primary');
  const bgColor = extracted.colors.find(c => c.usage === 'background');
  const textColor = extracted.colors.find(c => c.usage === 'text');
  const secondaryColor = extracted.colors.find(c => c.usage === 'secondary');
  const accentColor = extracted.colors.find(c => c.usage === 'accent');

  if (primaryColor) {
    const hex = toHex(primaryColor.value);
    operations.push({ type: 'updateGlobalSetting', key: 'color_primary', value: hex, label: 'Primary color' });
    operations.push({ type: 'updateGlobalSetting', key: 'btn_background_color', value: hex, label: 'Button background' });
  }
  if (bgColor) {
    const hex = toHex(bgColor.value);
    operations.push({ type: 'updateGlobalSetting', key: 'background_color', value: hex, label: 'Background color' });
  }
  if (textColor) {
    const hex = toHex(textColor.value);
    operations.push({ type: 'updateGlobalSetting', key: 'color_body', value: hex, label: 'Body text color' });
  }
  const headingColor = extracted.colors.find(c => c.name === 'foreground');
  if (headingColor) {
    operations.push({ type: 'updateGlobalSetting', key: 'color_heading', value: toHex(headingColor.value), label: 'Heading color' });
  }

  // ── 2. Fonts ──
  operations.push({ type: 'updateGlobalSetting', key: 'font_family_heading', value: extracted.headingFont, label: 'Heading font' });
  operations.push({ type: 'updateGlobalSetting', key: 'font_family_body', value: extracted.bodyFont, label: 'Body font' });

  // ── 3. Button style ──
  operations.push({ type: 'updateGlobalSetting', key: 'btn_text_color', value: extracted.buttonStyle.textColor, label: 'Button text color' });
  operations.push({ type: 'updateGlobalSetting', key: 'btn_style', value: extracted.buttonStyle.style, label: 'Button style' });
  const radiusNum = parseFloat(extracted.buttonStyle.borderRadius) * 16;
  operations.push({ type: 'updateGlobalSetting', key: 'btn_border_radius', value: String(Math.round(radiusNum || 4)), label: 'Button radius' });

  // ── 4. Header ──
  if (sections.header) {
    const darkBg = isDarkColor(extracted.header.backgroundColor);
    operations.push({ type: 'updateSectionSetting', sectionId: 'header', key: 'background_color', value: extracted.header.backgroundColor, label: 'Header bg' });
    operations.push({ type: 'updateSectionSetting', sectionId: 'header', key: 'text_color', value: extracted.header.textColor, label: 'Header text' });
    if (extracted.header.sticky) {
      operations.push({ type: 'updateSectionSetting', sectionId: 'header', key: 'sticky', value: 'true', label: 'Sticky header' });
    }
    // Logo block
    const logoBlock = findBlock(sections.header, 'logo');
    if (logoBlock) {
      operations.push({ type: 'updateBlockSetting', sectionId: 'header', blockId: logoBlock.id, key: 'logo_text', value: extracted.header.logoText || 'DeepWeave Academy', label: 'Logo text' });
      operations.push({ type: 'updateBlockSetting', sectionId: 'header', blockId: logoBlock.id, key: 'logo_type', value: 'text', label: 'Logo type' });
      if (darkBg) {
        operations.push({ type: 'updateBlockSetting', sectionId: 'header', blockId: logoBlock.id, key: 'logo_text_color', value: '#e8e8e8', label: 'Logo color' });
      }
    }
  }

  // ── 5. Navigation ──
  if (extracted.header.navItems.length > 0) {
    operations.push({ type: 'updateNavigation', menuId: 'main-menu', links: extracted.header.navItems });
  }

  // ── 6. Footer ──
  if (sections.footer) {
    operations.push({ type: 'updateSectionSetting', sectionId: 'footer', key: 'background_color', value: extracted.footer.backgroundColor, label: 'Footer bg' });
    operations.push({ type: 'updateSectionSetting', sectionId: 'footer', key: 'text_color', value: extracted.footer.textColor, label: 'Footer text' });
    const copyrightBlock = findBlock(sections.footer, 'copyright');
    if (copyrightBlock) {
      operations.push({ type: 'updateBlockSetting', sectionId: 'footer', blockId: copyrightBlock.id, key: 'copyright', value: 'DeepWeave Academy', label: 'Copyright' });
    }
    const footerLogoBlock = findBlock(sections.footer, 'logo');
    if (footerLogoBlock) {
      operations.push({ type: 'updateBlockSetting', sectionId: 'footer', blockId: footerLogoBlock.id, key: 'logo_text', value: 'DeepWeave Academy', label: 'Footer logo' });
      operations.push({ type: 'updateBlockSetting', sectionId: 'footer', blockId: footerLogoBlock.id, key: 'logo_type', value: 'text', label: 'Footer logo type' });
      operations.push({ type: 'updateBlockSetting', sectionId: 'footer', blockId: footerLogoBlock.id, key: 'logo_text_color', value: '#e8e8e8', label: 'Footer logo color' });
    }
  }

  // ── 7. Map sections (the core content mapping) ──
  // contentFor has ['', '1575400116835', '1575400143733', '1575400154555', '1575400199758', '1575400289798']
  // Base theme sections: Hero, 3 Feature Columns, Text & Image, Text & Image, Call to Action
  // Source sections: HeroSection, StatsSection, CoursesSection, TestimonialsSection, CTASection, Footer

  const validSectionIds = contentFor.filter(id => id && sections[id]);

  // Map hero (first section)
  if (extracted.hero && validSectionIds.length > 0) {
    const heroId = validSectionIds[0];
    const heroSection = sections[heroId];
    
    // Set dark background
    operations.push({ type: 'updateSectionSetting', sectionId: heroId, key: 'background_color', value: 'RGBA(13, 21, 32, 0.90)', label: 'Hero overlay' });
    operations.push({ type: 'updateSectionSetting', sectionId: heroId, key: 'bg_type', value: 'color', label: 'Hero bg type' });
    
    // Hero text block
    const textBlock = findBlock(heroSection, 'text');
    if (textBlock) {
      const heroHtml = buildHeroHtml(extracted);
      operations.push({ type: 'replaceText', sectionId: heroId, blockId: textBlock.id, key: 'text', value: heroHtml, label: 'Hero content' });
    }
    
    // Hero CTA block
    const ctaBlock = findBlock(heroSection, 'cta');
    if (ctaBlock && extracted.hero.ctaText) {
      operations.push({ type: 'updateBlockSetting', sectionId: heroId, blockId: ctaBlock.id, key: 'btn_text', value: extracted.hero.ctaText, label: 'Hero CTA text' });
      if (extracted.hero.ctaUrl) {
        operations.push({ type: 'updateBlockSetting', sectionId: heroId, blockId: ctaBlock.id, key: 'btn_action', value: extracted.hero.ctaUrl, label: 'Hero CTA link' });
      }
    }
  }

  // Map stats into the 3-feature-columns section
  if (validSectionIds.length > 1) {
    const featuresId = validSectionIds[1];
    const featureSection = sections[featuresId];
    const featureBlocks = getBlocksInOrder(featureSection);
    
    // Stats from the source: 2400+ Graduates, 27 Years, 12 Locations, 98% Would Dive Again
    // We have 3 feature blocks, map 3 stats
    const statsContent = [
      { title: '2,400+ Graduates', body: 'Certified divers and weavers from around the world.' },
      { title: '27 Years Teaching', body: 'The original and most experienced underwater basketweaving school.' },
      { title: '12 Reef Locations', body: 'From Bali to the Maldives — pristine reefs, expert instructors.' },
    ];
    
    featureBlocks.forEach((block, i) => {
      if (i < statsContent.length) {
        const html = `<h4>${statsContent[i].title}</h4>\n<p>${statsContent[i].body}</p>`;
        operations.push({ type: 'replaceText', sectionId: featuresId, blockId: block.id, key: 'text', value: html, label: `Feature ${i + 1} text` });
        operations.push({ type: 'updateBlockSetting', sectionId: featuresId, blockId: block.id, key: 'hide_image', value: 'true', label: `Feature ${i + 1} hide image` });
      }
    });
  }

  // Map courses into the first Text & Image section
  if (validSectionIds.length > 2) {
    const sectionId = validSectionIds[2];
    const section = sections[sectionId];
    const textBlock = findBlock(section, 'text');
    if (textBlock) {
      const coursesHtml = `<h2>Choose Your Depth</h2>\n<p>From shallow-water fundamentals to deep-sea mastery — every course includes equipment, materials, and marine biologist supervision.</p>\n<p><strong>Beginner Weave</strong> · 2 Days · $349<br/><strong>Advanced Patterns</strong> · 5 Days · $899<br/><strong>Master Artisan</strong> · 2 Weeks · $2,400</p>`;
      operations.push({ type: 'replaceText', sectionId, blockId: textBlock.id, key: 'text', value: coursesHtml, label: 'Courses section text' });
    }
    // Light bg for courses
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'background_color', value: '#0d1520', label: 'Courses bg' });
  }

  // Map testimonials into second Text & Image section
  if (validSectionIds.length > 3) {
    const sectionId = validSectionIds[3];
    const section = sections[sectionId];
    const textBlock = findBlock(section, 'text');
    if (textBlock) {
      const testimonialsHtml = `<h2>What Our Divers Say</h2>\n<p><em>"I never thought I'd find my calling at 40 feet below sea level. Now I sell my baskets at galleries in Maui."</em><br/>— Jordan Reed, Master Artisan Graduate</p>\n<p><em>"The instructors are incredibly patient — even when a curious sea turtle unraveled my entire second basket."</em><br/>— Priya Nakamura, Beginner Weave, Bali</p>\n<p><em>"Worth every penny. The bioluminescent night-weave session alone changed my entire perspective on craft."</em><br/>— Marcus Holm, Advanced Patterns, Maldives</p>`;
      operations.push({ type: 'replaceText', sectionId, blockId: textBlock.id, key: 'text', value: testimonialsHtml, label: 'Testimonials text' });
      operations.push({ type: 'updateBlockSetting', sectionId, blockId: textBlock.id, key: 'width', value: '10', label: 'Testimonials width' });
    }
    // Hide the image block since we don't need it for testimonials
    const imageBlock = findBlock(section, 'image');
    if (imageBlock) {
      operations.push({ type: 'updateBlockSetting', sectionId, blockId: imageBlock.id, key: 'hide_on_desktop', value: 'true', label: 'Hide testimonial image' });
      operations.push({ type: 'updateBlockSetting', sectionId, blockId: imageBlock.id, key: 'hide_on_mobile', value: 'true', label: 'Hide testimonial image mobile' });
    }
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'background_color', value: '#0d1520', label: 'Testimonials bg' });
  }

  // Map CTA section (last section)
  if (validSectionIds.length > 4) {
    const sectionId = validSectionIds[4];
    const section = sections[sectionId];
    
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'background_color', value: 'RGBA(13, 21, 32, 0.90)', label: 'CTA overlay' });
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'bg_type', value: 'color', label: 'CTA bg type' });
    
    const textBlock = findBlock(section, 'text');
    if (textBlock) {
      const ctaHtml = `<h2>Ready to Take the Plunge?</h2>\n<p>Next cohort starts June 15th in Bali. Limited to 8 students per instructor for personalized, one-on-one reef time.</p>`;
      operations.push({ type: 'replaceText', sectionId, blockId: textBlock.id, key: 'text', value: ctaHtml, label: 'CTA text' });
    }
    const ctaBlock = findBlock(section, 'cta');
    if (ctaBlock) {
      operations.push({ type: 'updateBlockSetting', sectionId, blockId: ctaBlock.id, key: 'btn_text', value: 'Reserve Your Spot', label: 'CTA button text' });
    }
  }

  // ── 8. Comprehensive CSS overrides ──
  const primaryHex = primaryColor ? toHex(primaryColor.value) : '#2eb89a';
  const bgHex = bgColor ? toHex(bgColor.value) : '#0d1520';
  const fgHex = headingColor ? toHex(headingColor.value) : '#d6e8e2';
  const bodyTextHex = textColor ? toHex(textColor.value) : '#8a9ba8';
  const accentHex = accentColor ? toHex(accentColor.value) : primaryHex;

  const cssOverrides = `
/* === Woven Waves Landing Theme Overrides === */

/* Global dark background */
body { background-color: ${bgHex} !important; color: ${bodyTextHex} !important; }

/* Typography */
h1, h2, h3, h4, h5, h6 { font-family: '${extracted.headingFont}', serif !important; color: ${fgHex} !important; }
body, p, span, a, li { font-family: '${extracted.bodyFont}', sans-serif !important; }

/* Primary accent color */
a { color: ${primaryHex} !important; }
.btn, .btn-primary, [class*="btn"] { background-color: ${primaryHex} !important; color: ${bgHex} !important; border-color: ${primaryHex} !important; }
.btn:hover { opacity: 0.9; }

/* Section backgrounds */
.section { background-color: ${bgHex} !important; }
.section .section__overlay { background-color: transparent !important; }

/* Cards and feature blocks */
.block__feature, .block__text { color: ${bodyTextHex} !important; }
.block__feature h4 { color: ${fgHex} !important; }

/* Header */
.header { background-color: ${bgHex} !important; border-bottom: 1px solid rgba(255,255,255,0.08) !important; }
.header a, .header .nav__link { color: ${fgHex} !important; }
.header .logo__text { color: ${fgHex} !important; }

/* Footer */
.footer { background-color: ${bgHex} !important; border-top: 1px solid rgba(255,255,255,0.08) !important; }
.footer, .footer a, .footer p, .footer span { color: ${bodyTextHex} !important; }
.footer .logo__text { color: ${fgHex} !important; }

/* Feature section */
.section[style*="f9f9f9"], .section[style*="rgb(249"] { background-color: ${bgHex} !important; }

/* Override any light backgrounds */
[style*="background-color: rgb(255"], [style*="background-color: #fff"], [style*="background-color: #f9f9f9"] {
  background-color: ${bgHex} !important;
}

/* Ensure text visibility on dark bg */
p, span { color: ${bodyTextHex} !important; }
h1, h2 { color: ${fgHex} !important; }
`.trim();

  operations.push({ type: 'addCssOverride', css: cssOverrides, label: 'Full dark theme overrides' });

  // ── 9. Global CSS injection ──
  operations.push({ type: 'updateGlobalSetting', key: 'css', value: `/* Google Fonts */\n@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(extracted.headingFont)}:wght@400;700;900&family=${encodeURIComponent(extracted.bodyFont)}:wght@400;500;700&display=swap');`, label: 'Google Fonts import' });

  // ── Validation ──
  if (contentFor.length === 0) {
    warnings.push({ severity: 'warning', message: `No sections found for page "${page}"` });
  }
  for (const sectionId of contentFor) {
    if (sectionId && !sections[sectionId]) {
      warnings.push({ severity: 'error', message: `Section "${sectionId}" referenced but not defined`, target: sectionId });
    }
  }
  if (!sections.header) warnings.push({ severity: 'warning', message: 'No header section in base theme' });
  if (!sections.footer) warnings.push({ severity: 'warning', message: 'No footer section in base theme' });

  return {
    sourceProjectId,
    sourceProjectName,
    sourcePage: page,
    baseThemeId: 'streamlined-home',
    extractedDesign: extracted,
    operations,
    validationWarnings: warnings,
  };
}

// ── Helpers ──

function findBlock(section: any, type: string): { id: string; settings: any } | null {
  const blocks = section?.blocks || {};
  const order = section?.block_order || [];
  for (const id of order) {
    if (blocks[id]?.type === type) {
      return { id, settings: blocks[id].settings || {} };
    }
  }
  return null;
}

function getBlocksInOrder(section: any): Array<{ id: string; type: string; settings: any }> {
  const blocks = section?.blocks || {};
  const order = section?.block_order || [];
  return order.map((id: string) => ({ id, type: blocks[id]?.type, settings: blocks[id]?.settings || {} })).filter((b: any) => b.type);
}

function buildHeroHtml(extracted: ExtractedDesign): string {
  const hero = extracted.hero!;
  const primaryColor = extracted.colors.find(c => c.usage === 'primary');
  const primaryHex = primaryColor ? (primaryColor.value.startsWith('#') ? primaryColor.value : hslToHex(primaryColor.value)) : '#2eb89a';
  
  let html = '';
  if (hero.heading) {
    html += `<h1 style="color: #e0e8e4; font-size: 56px; line-height: 1.05; font-weight: 700;">${hero.heading}</h1>\n`;
  }
  if (hero.subheading) {
    html += `<p style="font-size: 20px; color: #8a9ba8; max-width: 600px; margin: 0 auto;">${hero.subheading}</p>`;
  }
  return html;
}

function isDarkColor(color: string): boolean {
  if (!color) return false;
  // Simple heuristic
  if (color.includes('RGBA') || color.includes('rgba')) {
    const match = color.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const [, r, g, b] = match.map(Number);
      return (r + g + b) / 3 < 128;
    }
  }
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (r + g + b) / 3 < 128;
  }
  return false;
}
