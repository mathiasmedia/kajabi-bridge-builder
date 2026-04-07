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
  const globals = getThemeGlobalSettings(theme);
  const sections = getThemeSections(theme);
  const contentFor = getContentForPage(theme, page);

  // 1. Global color settings
  const primaryColor = extracted.colors.find(c => c.usage === 'primary');
  if (primaryColor) {
    const hex = primaryColor.value.startsWith('#') ? primaryColor.value : hslToHex(primaryColor.value);
    operations.push({ type: 'updateGlobalSetting', key: 'color_primary', value: hex, label: 'Primary color' });
    operations.push({ type: 'updateGlobalSetting', key: 'btn_background_color', value: hex, label: 'Button background color' });
    operations.push({ type: 'updateGlobalSetting', key: 'color_accent', value: hex, label: 'Accent color' });
  }

  const bgColor = extracted.colors.find(c => c.usage === 'background');
  if (bgColor) {
    const hex = bgColor.value.startsWith('#') ? bgColor.value : hslToHex(bgColor.value);
    operations.push({ type: 'updateGlobalSetting', key: 'background_color', value: hex, label: 'Background color' });
  }

  const textColor = extracted.colors.find(c => c.usage === 'text');
  if (textColor) {
    const hex = textColor.value.startsWith('#') ? textColor.value : hslToHex(textColor.value);
    operations.push({ type: 'updateGlobalSetting', key: 'color_heading', value: hex, label: 'Heading color' });
    operations.push({ type: 'updateGlobalSetting', key: 'color_body', value: hex, label: 'Body text color' });
  }

  // 2. Font settings
  operations.push({ type: 'updateGlobalSetting', key: 'font_family_heading', value: extracted.headingFont, label: 'Heading font' });
  operations.push({ type: 'updateGlobalSetting', key: 'font_family_body', value: extracted.bodyFont, label: 'Body font' });

  // 3. Button settings
  operations.push({ type: 'updateGlobalSetting', key: 'btn_text_color', value: extracted.buttonStyle.textColor, label: 'Button text color' });
  operations.push({ type: 'updateGlobalSetting', key: 'btn_style', value: extracted.buttonStyle.style, label: 'Button style' });
  const radiusNum = parseFloat(extracted.buttonStyle.borderRadius) * 16;
  operations.push({ type: 'updateGlobalSetting', key: 'btn_border_radius', value: String(Math.round(radiusNum)), label: 'Button border radius' });

  // 4. Header settings
  if (sections.header) {
    operations.push({
      type: 'updateSectionSetting', sectionId: 'header',
      key: 'background_color', value: extracted.header.backgroundColor,
      label: 'Header background',
    });
    operations.push({
      type: 'updateSectionSetting', sectionId: 'header',
      key: 'text_color', value: extracted.header.textColor,
      label: 'Header text color',
    });
    if (extracted.header.sticky) {
      operations.push({
        type: 'updateSectionSetting', sectionId: 'header',
        key: 'sticky', value: true,
        label: 'Sticky header',
      });
    }
    // Logo
    if (extracted.header.logoText) {
      const logoBlock = Object.entries(sections.header.blocks || {}).find(([, b]) => b.type === 'logo');
      if (logoBlock) {
        operations.push({
          type: 'updateBlockSetting', sectionId: 'header', blockId: logoBlock[0],
          key: 'logo_text', value: extracted.header.logoText,
          label: 'Logo text',
        });
      }
    }
  }

  // 5. Navigation
  if (extracted.header.navItems.length > 0) {
    operations.push({
      type: 'updateNavigation',
      menuId: 'main-menu',
      links: extracted.header.navItems,
    });
  }

  // 6. Hero section - map to first content section
  if (extracted.hero && contentFor.length > 0) {
    const heroSectionId = contentFor[0];
    const heroSection = sections[heroSectionId];
    if (heroSection) {
      // Find text block
      const textBlock = Object.entries(heroSection.blocks || {}).find(([, b]) => b.type === 'text');
      if (textBlock) {
        const heroHtml = buildHeroHtml(extracted.hero);
        operations.push({
          type: 'replaceText', sectionId: heroSectionId, blockId: textBlock[0],
          key: 'text', value: heroHtml,
          label: 'Hero text content',
        });
        if (extracted.hero.ctaText) {
          operations.push({
            type: 'updateBlockSetting', sectionId: heroSectionId, blockId: textBlock[0],
            key: 'use_btn', value: 'true',
            label: 'Show hero CTA',
          });
          operations.push({
            type: 'updateBlockSetting', sectionId: heroSectionId, blockId: textBlock[0],
            key: 'btn_text', value: extracted.hero.ctaText,
            label: 'Hero CTA text',
          });
          operations.push({
            type: 'updateBlockSetting', sectionId: heroSectionId, blockId: textBlock[0],
            key: 'btn_action', value: extracted.hero.ctaUrl || '/',
            label: 'Hero CTA link',
          });
        }
      }
      // Hero background
      if (extracted.hero.backgroundColor) {
        operations.push({
          type: 'updateSectionSetting', sectionId: heroSectionId,
          key: 'background_color', value: extracted.hero.backgroundColor,
          label: 'Hero background color',
        });
      }
    }
  }

  // 7. Footer
  if (sections.footer) {
    operations.push({
      type: 'updateSectionSetting', sectionId: 'footer',
      key: 'background_color', value: extracted.footer.backgroundColor,
      label: 'Footer background',
    });
  }

  // 8. CSS overrides for fine-tuning
  const cssOverrides: string[] = [];
  if (extracted.headingFont) {
    cssOverrides.push(`h1, h2, h3, h4, h5, h6 { font-family: '${extracted.headingFont}', sans-serif !important; }`);
  }
  if (cssOverrides.length > 0) {
    operations.push({
      type: 'addCssOverride',
      css: cssOverrides.join('\n'),
      label: 'Font overrides',
    });
  }

  // Validation
  if (contentFor.length === 0) {
    warnings.push({ severity: 'warning', message: `No sections found for page "${page}"` });
  }
  
  for (const sectionId of contentFor) {
    if (!sections[sectionId]) {
      warnings.push({ severity: 'error', message: `Section "${sectionId}" referenced but not defined`, target: sectionId });
    }
  }

  if (!sections.header) {
    warnings.push({ severity: 'warning', message: 'No header section found in base theme' });
  }
  if (!sections.footer) {
    warnings.push({ severity: 'warning', message: 'No footer section found in base theme' });
  }

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

function buildHeroHtml(hero: NonNullable<ExtractedDesign['hero']>): string {
  let html = '';
  if (hero.heading) {
    html += `<h1>${hero.heading}</h1>`;
  }
  if (hero.subheading) {
    html += `<p>${hero.subheading}</p>`;
  }
  return html;
}
