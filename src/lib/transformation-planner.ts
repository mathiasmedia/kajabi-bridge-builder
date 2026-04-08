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

  // ── 7. Map sections ──
  const validSectionIds = contentFor.filter(id => id && sections[id]);

  // Map hero (first section)
  if (extracted.hero && validSectionIds.length > 0) {
    const heroId = validSectionIds[0];
    const heroSection = sections[heroId];
    
    operations.push({ type: 'updateSectionSetting', sectionId: heroId, key: 'background_color', value: 'RGBA(11, 18, 20, 0.65)', label: 'Hero overlay' });
    operations.push({ type: 'updateSectionSetting', sectionId: heroId, key: 'bg_type', value: 'color', label: 'Hero bg type' });
    operations.push({ type: 'updateSectionSetting', sectionId: heroId, key: 'full_height', value: 'true', label: 'Hero full height' });
    operations.push({ type: 'updateSectionSetting', sectionId: heroId, key: 'padding_desktop', value: { top: '120', bottom: '120' }, label: 'Hero padding desktop' });
    operations.push({ type: 'updateSectionSetting', sectionId: heroId, key: 'padding_mobile', value: { top: '80', bottom: '80' }, label: 'Hero padding mobile' });
    
    const textBlock = findBlock(heroSection, 'text');
    if (textBlock) {
      const heroHtml = buildHeroHtml(extracted);
      operations.push({ type: 'replaceText', sectionId: heroId, blockId: textBlock.id, key: 'text', value: heroHtml, label: 'Hero content' });
      operations.push({ type: 'updateBlockSetting', sectionId: heroId, blockId: textBlock.id, key: 'text_align', value: 'center', label: 'Hero text align' });
      operations.push({ type: 'updateBlockSetting', sectionId: heroId, blockId: textBlock.id, key: 'width', value: '8', label: 'Hero text width' });
    }
    
    const ctaBlock = findBlock(heroSection, 'cta');
    if (ctaBlock) {
      operations.push({ type: 'updateBlockSetting', sectionId: heroId, blockId: ctaBlock.id, key: 'btn_text', value: 'Book Your First Dive', label: 'Hero CTA text' });
      operations.push({ type: 'updateBlockSetting', sectionId: heroId, blockId: ctaBlock.id, key: 'btn_action', value: '#', label: 'Hero CTA link' });
    }
  }

  // Map stats into the 3-feature-columns section
  if (validSectionIds.length > 1) {
    const featuresId = validSectionIds[1];
    const featureSection = sections[featuresId];
    const featureBlocks = getBlocksInOrder(featureSection);
    
    operations.push({ type: 'updateSectionSetting', sectionId: featuresId, key: 'background_color', value: '#0b1214', label: 'Stats bg' });
    operations.push({ type: 'updateSectionSetting', sectionId: featuresId, key: 'padding_desktop', value: { top: '80', bottom: '80' }, label: 'Stats padding' });
    operations.push({ type: 'updateSectionSetting', sectionId: featuresId, key: 'padding_mobile', value: { top: '48', bottom: '48' }, label: 'Stats padding mobile' });
    
    const statsContent = [
      { title: '2,400+', subtitle: 'Graduates', body: 'Certified divers and weavers from around the world.' },
      { title: '27', subtitle: 'Years Teaching', body: 'The original and most experienced underwater basketweaving school.' },
      { title: '12', subtitle: 'Reef Locations', body: 'From Bali to the Maldives — pristine reefs, expert instructors.' },
    ];
    
    featureBlocks.forEach((block, i) => {
      if (i < statsContent.length) {
        const html = `<h3 class="stat-number">${statsContent[i].title}</h3>\n<h4 class="stat-label">${statsContent[i].subtitle}</h4>\n<p class="stat-desc">${statsContent[i].body}</p>`;
        operations.push({ type: 'replaceText', sectionId: featuresId, blockId: block.id, key: 'text', value: html, label: `Stat ${i + 1} text` });
        operations.push({ type: 'updateBlockSetting', sectionId: featuresId, blockId: block.id, key: 'hide_image', value: 'true', label: `Stat ${i + 1} hide image` });
        operations.push({ type: 'updateBlockSetting', sectionId: featuresId, blockId: block.id, key: 'text_align', value: 'center', label: `Stat ${i + 1} align` });
      }
    });
  }

  // Map courses into the first Text & Image section
  if (validSectionIds.length > 2) {
    const sectionId = validSectionIds[2];
    const section = sections[sectionId];
    const textBlock = findBlock(section, 'text');
    if (textBlock) {
      const coursesHtml = `<p class="section-eyebrow">OUR PROGRAMS</p>\n<h2>Choose Your Depth</h2>\n<p>From shallow-water fundamentals to deep-sea mastery — every course includes equipment, materials, and marine biologist supervision.</p>\n<div class="course-list"><p><strong>Beginner Weave</strong> · 2 Days · <span class="price">$349</span></p>\n<p><strong>Advanced Patterns</strong> · 5 Days · <span class="price">$899</span></p>\n<p><strong>Master Artisan</strong> · 2 Weeks · <span class="price">$2,400</span></p></div>`;
      operations.push({ type: 'replaceText', sectionId, blockId: textBlock.id, key: 'text', value: coursesHtml, label: 'Courses section text' });
    }
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'background_color', value: '#0b1214', label: 'Courses bg' });
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'padding_desktop', value: { top: '96', bottom: '96' }, label: 'Courses padding' });
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'padding_mobile', value: { top: '64', bottom: '64' }, label: 'Courses padding mobile' });
    
    // Hide the image block placeholder
    const imageBlock = findBlock(section, 'image');
    if (imageBlock) {
      operations.push({ type: 'updateBlockSetting', sectionId, blockId: imageBlock.id, key: 'hide_on_desktop', value: 'true', label: 'Hide courses image' });
      operations.push({ type: 'updateBlockSetting', sectionId, blockId: imageBlock.id, key: 'hide_on_mobile', value: 'true', label: 'Hide courses image mobile' });
    }
  }

  // Map testimonials — use a dedicated section with feature blocks (one per testimonial)
  if (validSectionIds.length > 3) {
    const sectionId = validSectionIds[3];
    const section = sections[sectionId];

    // Section-level settings
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'background_color', value: '#0b1214', label: 'Testimonials bg' });
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'padding_desktop', value: { top: '96', bottom: '96' }, label: 'Testimonials padding' });
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'padding_mobile', value: { top: '64', bottom: '64' }, label: 'Testimonials padding mobile' });

    // Add a heading text block first
    const textBlock = findBlock(section, 'text');
    if (textBlock) {
      const headingHtml = `<p class="section-eyebrow">TESTIMONIALS</p>\n<h2>What Our Divers Say</h2>`;
      operations.push({ type: 'replaceText', sectionId, blockId: textBlock.id, key: 'text', value: headingHtml, label: 'Testimonials heading' });
      operations.push({ type: 'updateBlockSetting', sectionId, blockId: textBlock.id, key: 'width', value: '12', label: 'Testimonials heading width' });
      operations.push({ type: 'updateBlockSetting', sectionId, blockId: textBlock.id, key: 'text_align', value: 'center', label: 'Testimonials heading align' });
    }

    // Hide the image block if present
    const imageBlock = findBlock(section, 'image');
    if (imageBlock) {
      operations.push({ type: 'updateBlockSetting', sectionId, blockId: imageBlock.id, key: 'hide_on_desktop', value: 'true', label: 'Hide testimonial image' });
      operations.push({ type: 'updateBlockSetting', sectionId, blockId: imageBlock.id, key: 'hide_on_mobile', value: 'true', label: 'Hide testimonial image mobile' });
    }

    // Add 3 feature blocks — one per testimonial, using the correct Kajabi feature block schema
    const testimonials = [
      { name: 'Jordan Reed', role: 'Master Artisan Graduate, 2024', quote: '"I never thought I\'d find my calling at 40 feet below sea level. Now I sell my baskets at galleries in Maui."' },
      { name: 'Priya Nair', role: 'Beginner Weave, Bali Campus', quote: '"The instructors are incredibly patient — even when a curious sea turtle unraveled my entire second basket."' },
      { name: 'Marcus Holm', role: 'Advanced Patterns, Maldives', quote: '"Worth every penny. The bioluminescent night-weave session alone changed my entire perspective on craft."' },
    ];

    testimonials.forEach((t, i) => {
      const blockId = `testimonial_feature_${i}`;
      const featureText = `<p>${t.quote}</p>\n<h4>${t.name}</h4>\n<p>${t.role}</p>`;
      operations.push({
        type: 'addBlock',
        sectionId,
        blockId,
        block: {
          type: 'feature',
          settings: {
            text: featureText,
            hide_image: 'true',
            text_align: 'center',
            width: '4',
            background_color: '#111a1e',
            border_radius: '12',
            box_shadow: 'none',
            use_btn: 'false',
            padding_desktop: { top: '30', right: '30', bottom: '30', left: '30' },
            padding_mobile: { top: '20', right: '20', bottom: '20', left: '20' },
          },
        },
        label: `Testimonial: ${t.name}`,
      });
    });
  }

  // Map CTA section
  if (validSectionIds.length > 4) {
    const sectionId = validSectionIds[4];
    const section = sections[sectionId];
    
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'background_color', value: '#0b1214', label: 'CTA bg' });
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'padding_desktop', value: { top: '96', bottom: '96' }, label: 'CTA padding' });
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'padding_mobile', value: { top: '64', bottom: '64' }, label: 'CTA padding mobile' });
    
    const textBlock = findBlock(section, 'text');
    if (textBlock) {
      const ctaHtml = `<div class="cta-card">\n<h2>Ready to Take the Plunge?</h2>\n<p>Next cohort starts June 15th in Bali. Limited to 8 students per instructor for personalized, one-on-one reef time.</p>\n</div>`;
      operations.push({ type: 'replaceText', sectionId, blockId: textBlock.id, key: 'text', value: ctaHtml, label: 'CTA text' });
      operations.push({ type: 'updateBlockSetting', sectionId, blockId: textBlock.id, key: 'text_align', value: 'center', label: 'CTA text align' });
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
/* === DeepWeave Academy — Woven Waves Theme === */
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=DM+Sans:wght@400;500;700&display=swap');

/* ── Global Reset ── */
html, body { background-color: ${bgHex} !important; color: ${bodyTextHex} !important; }
body, p, span, a, li, td, th, label, input, textarea, select, blockquote { font-family: '${extracted.bodyFont}', 'DM Sans', sans-serif !important; }
h1, h2, h3, h4, h5, h6 { font-family: '${extracted.headingFont}', 'Playfair Display', Georgia, serif !important; color: ${fgHex} !important; letter-spacing: -0.01em !important; }

/* Force dark bg on all sections & wrappers */
.section, .section__inner, .section__background, .page__content, .page, .template,
[class*="section"], [class*="page"] { background-color: ${bgHex} !important; }
.section .section__overlay { background: transparent !important; }

/* Kill any stray white/light backgrounds */
[style*="background-color: rgb(255"], [style*="background-color: #fff"],
[style*="background-color: #f9"], [style*="background-color: rgb(249"],
[style*="background: rgb(255"], [style*="background: #fff"],
[style*="background-color: white"] { background-color: ${bgHex} !important; }

/* ── Links & Buttons ── */
a { color: ${primaryHex} !important; text-decoration: none !important; }
a:hover { opacity: 0.85 !important; }
.btn, .btn-primary, [class*="btn-primary"], button[type="submit"] {
  background-color: ${primaryHex} !important;
  color: ${bgHex} !important;
  border: none !important;
  border-radius: 12px !important;
  padding: 14px 32px !important;
  font-family: '${extracted.bodyFont}', sans-serif !important;
  font-weight: 600 !important;
  font-size: 16px !important;
  letter-spacing: 0 !important;
  transition: opacity 0.2s ease !important;
}
.btn:hover, .btn-primary:hover { opacity: 0.88 !important; }
.btn-outline, [class*="btn-outline"] {
  background-color: transparent !important;
  border: 1px solid rgba(255,255,255,0.25) !important;
  color: ${fgHex} !important;
  border-radius: 12px !important;
  padding: 14px 32px !important;
}

/* ── Header ── */
.header, .header__inner { background-color: ${bgHex} !important; border-bottom: 1px solid rgba(255,255,255,0.06) !important; }
.header a, .header .nav__link { color: ${bodyTextHex} !important; font-size: 14px !important; font-weight: 500 !important; }
.header a:hover, .header .nav__link:hover { color: ${fgHex} !important; }
.header .logo__text { color: ${fgHex} !important; font-family: '${extracted.headingFont}', serif !important; font-weight: 700 !important; font-size: 22px !important; }

/* ── Hero Section ── */
.section--hero, .section:first-of-type { text-align: center !important; }
.section--hero h1, .hero h1, .section:first-of-type h1 {
  font-size: 64px !important; line-height: 1.0 !important; font-weight: 700 !important;
  color: ${fgHex} !important; margin-bottom: 16px !important;
}
@media (max-width: 768px) {
  .section--hero h1, .hero h1, .section:first-of-type h1 { font-size: 40px !important; }
}
.hero-eyebrow { color: ${primaryHex} !important; font-size: 13px !important; letter-spacing: 0.3em !important; text-transform: uppercase !important; font-weight: 500 !important; margin-bottom: 20px !important; display: block !important; }
.hero-description { color: ${bodyTextHex} !important; font-size: 18px !important; line-height: 1.7 !important; max-width: 560px !important; margin: 0 auto 32px !important; }

/* ── Stats Section ── */
.stat-number { color: ${primaryHex} !important; font-size: 48px !important; font-weight: 700 !important; margin-bottom: 4px !important; line-height: 1.1 !important; }
.stat-label { color: ${fgHex} !important; font-size: 16px !important; font-weight: 600 !important; margin-bottom: 8px !important; font-family: '${extracted.bodyFont}', sans-serif !important; }
.stat-desc { color: ${bodyTextHex} !important; font-size: 14px !important; line-height: 1.5 !important; }
.block__feature { text-align: center !important; }

/* ── Eyebrow labels ── */
.section-eyebrow { color: ${primaryHex} !important; font-size: 12px !important; letter-spacing: 0.25em !important; text-transform: uppercase !important; font-weight: 500 !important; margin-bottom: 12px !important; }

/* ── Courses Section ── */
.course-list p { margin-bottom: 6px !important; }
.course-list .price { color: ${primaryHex} !important; font-weight: 600 !important; }

/* ── Testimonials ── */
.testimonial-grid { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 24px !important; margin-top: 40px !important; text-align: left !important; }
@media (max-width: 768px) { .testimonial-grid { grid-template-columns: 1fr !important; } }
.testimonial-card {
  background: rgba(255,255,255,0.04) !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  border-radius: 16px !important;
  padding: 28px !important;
}
.testimonial-quote { color: ${bodyTextHex} !important; font-style: italic !important; font-size: 15px !important; line-height: 1.6 !important; margin-bottom: 16px !important; }
.testimonial-author { color: ${fgHex} !important; font-size: 15px !important; margin-bottom: 2px !important; }
.testimonial-role { color: ${bodyTextHex} !important; font-size: 13px !important; opacity: 0.7 !important; }

/* ── CTA Section ── */
.cta-card {
  background: rgba(255,255,255,0.04) !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  border-radius: 24px !important;
  padding: 64px 48px !important;
  max-width: 640px !important;
  margin: 0 auto 24px !important;
}
@media (max-width: 768px) { .cta-card { padding: 40px 24px !important; } }
.cta-card h2 { margin-bottom: 16px !important; }
.cta-card p { color: ${bodyTextHex} !important; max-width: 480px !important; margin: 0 auto !important; }

/* ── Footer ── */
.footer, .footer__inner { background-color: ${bgHex} !important; border-top: 1px solid rgba(255,255,255,0.06) !important; }
.footer, .footer a, .footer p, .footer span { color: ${bodyTextHex} !important; font-size: 14px !important; }
.footer a:hover { color: ${fgHex} !important; }
.footer .logo__text { color: ${fgHex} !important; font-family: '${extracted.headingFont}', serif !important; font-weight: 700 !important; }

/* ── General text ── */
p, span { color: ${bodyTextHex} !important; }
h1, h2 { color: ${fgHex} !important; }
h2 { font-size: 40px !important; line-height: 1.1 !important; font-weight: 700 !important; }
h3 { font-size: 28px !important; }
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
    let html = '';
    if (hero.subheading) {
      html += `<p class="hero-eyebrow">${hero.subheading}</p>\n`;
    }
    if (hero.heading) {
      html += `<h1>${hero.heading}</h1>\n`;
    }
    // Add the description from source
    html += `<p class="hero-description">Dive deep into the world's most exclusive craft. Certified instructors, pristine reefs, and the finest seagrass materials — all 30 feet below the surface.</p>`;
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
