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

  // ── Dynamic site analysis ──
  const siteIsDark = detectDarkSite(extracted);
  const darkCardBg = siteIsDark ? darkenHex(bgColor ? toHex(bgColor.value) : '#0b1214', 0.15) : '#FFFFFF';

  // ── 7. Map sections ──
  const validSectionIds = contentFor.filter(id => id && sections[id]);

  // Map hero (first section)
  if (extracted.hero && validSectionIds.length > 0) {
    const heroId = validSectionIds[0];
    const heroSection = sections[heroId];
    
    // Use lighter overlay — gradient will be applied via CSS
    operations.push({ type: 'updateSectionSetting', sectionId: heroId, key: 'background_color', value: 'RGBA(11, 18, 20, 0.35)', label: 'Hero overlay (light, gradient via CSS)' });
    operations.push({ type: 'updateSectionSetting', sectionId: heroId, key: 'bg_type', value: 'color', label: 'Hero bg type' });
    operations.push({ type: 'updateSectionSetting', sectionId: heroId, key: 'full_height', value: 'true', label: 'Hero full height' });
    // Increased padding for taller hero
    operations.push({ type: 'updateSectionSetting', sectionId: heroId, key: 'padding_desktop', value: { top: '160', bottom: '160' }, label: 'Hero padding desktop' });
    operations.push({ type: 'updateSectionSetting', sectionId: heroId, key: 'padding_mobile', value: { top: '100', bottom: '100' }, label: 'Hero padding mobile' });
    
    const textBlock = findBlock(heroSection, 'text');
    if (textBlock) {
      const heroHtml = buildHeroHtml(extracted, primaryColor ? toHex(primaryColor.value) : '#2eb89a');
      operations.push({ type: 'replaceText', sectionId: heroId, blockId: textBlock.id, key: 'text', value: heroHtml, label: 'Hero content' });
      operations.push({ type: 'updateBlockSetting', sectionId: heroId, blockId: textBlock.id, key: 'text_align', value: 'center', label: 'Hero text align' });
      operations.push({ type: 'updateBlockSetting', sectionId: heroId, blockId: textBlock.id, key: 'width', value: '8', label: 'Hero text width' });
    }
    
    const ctaBlock = findBlock(heroSection, 'cta');
    if (ctaBlock) {
      const heroCta = extracted.hero.ctaText || 'Book Your First Dive';
      const heroCtaUrl = extracted.hero.ctaUrl || '#';
      operations.push({ type: 'updateBlockSetting', sectionId: heroId, blockId: ctaBlock.id, key: 'btn_text', value: heroCta, label: 'Hero CTA text' });
      operations.push({ type: 'updateBlockSetting', sectionId: heroId, blockId: ctaBlock.id, key: 'btn_action', value: heroCtaUrl, label: 'Hero CTA link' });
      // Ensure button uses primary/accent color
      if (primaryColor) {
        operations.push({ type: 'updateBlockSetting', sectionId: heroId, blockId: ctaBlock.id, key: 'btn_background_color', value: toHex(primaryColor.value), label: 'Hero CTA bg color' });
      }
    }
  }

  // Map stats — dynamically pull from extracted sections
  const statsSection = extracted.sections.find(s => s.intent === 'stats');
  if (validSectionIds.length > 1) {
    const featuresId = validSectionIds[1];
    const featureSection = sections[featuresId];
    const featureBlocks = getBlocksInOrder(featureSection);
    const statPrimaryHex = primaryColor ? toHex(primaryColor.value) : '#2eb89a';
    
    operations.push({ type: 'updateSectionSetting', sectionId: featuresId, key: 'background_color', value: '#0b1214', label: 'Stats bg' });
    operations.push({ type: 'updateSectionSetting', sectionId: featuresId, key: 'padding_desktop', value: { top: '80', bottom: '80' }, label: 'Stats padding' });
    operations.push({ type: 'updateSectionSetting', sectionId: featuresId, key: 'padding_mobile', value: { top: '48', bottom: '48' }, label: 'Stats padding mobile' });
    
    // Dynamic stats from extracted data (fallback to hardcoded if not available)
    const statsItems = statsSection?.items || [];
    const statsContent = statsItems.length > 0
      ? statsItems.map(item => ({
          title: item.value || item.heading || '',
          subtitle: item.heading || item.body?.split('.')[0] || '',
          body: item.body || '',
        }))
      : [
          { title: '2,400+', subtitle: 'Graduates', body: 'Certified divers and weavers from around the world.' },
          { title: '27', subtitle: 'Years Teaching', body: 'The original and most experienced underwater basketweaving school.' },
          { title: '12', subtitle: 'Reef Locations', body: 'From Bali to the Maldives — pristine reefs, expert instructors.' },
          { title: '98%', subtitle: 'Would Dive Again', body: 'Our students keep coming back for the craft and the community.' },
        ];
    
    // Render all stats (not just 3) — use inline styles so colors survive Kajabi rendering
    statsContent.forEach((stat, i) => {
      if (i < featureBlocks.length) {
        const html = `<h3 style="color:${statPrimaryHex}; font-size:48px; font-weight:700; line-height:1.1; margin-bottom:4px">${stat.title}</h3>\n<h4 style="font-size:16px; font-weight:600; margin-bottom:8px">${stat.subtitle}</h4>\n<p style="font-size:14px; line-height:1.5">${stat.body}</p>`;
        operations.push({ type: 'replaceText', sectionId: featuresId, blockId: featureBlocks[i].id, key: 'text', value: html, label: `Stat ${i + 1} text` });
        operations.push({ type: 'updateBlockSetting', sectionId: featuresId, blockId: featureBlocks[i].id, key: 'hide_image', value: 'true', label: `Stat ${i + 1} hide image` });
        operations.push({ type: 'updateBlockSetting', sectionId: featuresId, blockId: featureBlocks[i].id, key: 'text_align', value: 'center', label: `Stat ${i + 1} align` });
      } else {
        // Need to add extra stat blocks beyond what exists in the base theme
        const blockId = `stat_extra_${i}`;
        const html = `<h3 style="color:${statPrimaryHex}; font-size:48px; font-weight:700; line-height:1.1; margin-bottom:4px">${stat.title}</h3>\n<h4 style="font-size:16px; font-weight:600; margin-bottom:8px">${stat.subtitle}</h4>\n<p style="font-size:14px; line-height:1.5">${stat.body}</p>`;
        operations.push({
          type: 'addBlock',
          sectionId: featuresId,
          blockId,
          block: {
            type: 'feature',
            settings: {
              text: html,
              hide_image: 'true',
              text_align: 'center',
              width: String(Math.floor(12 / statsContent.length)),
            },
          },
          label: `Stat ${i + 1}: ${stat.subtitle}`,
        });
      }
    });
  }

  // Map programs — proper section with eyebrow heading + feature card blocks
  const programSection = extracted.sections.find(s => s.intent === 'program_cards');
  if (validSectionIds.length > 2) {
    const sectionId = validSectionIds[2];
    const section = sections[sectionId];
    const accentHexLocal = accentColor ? toHex(accentColor.value) : (primaryColor ? toHex(primaryColor.value) : '#2eb89a');

    operations.push({ type: 'updateSectionSetting', sectionId, key: 'background_color', value: '#0b1214', label: 'Programs bg' });
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'padding_desktop', value: { top: '96', bottom: '96' }, label: 'Programs padding' });
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'padding_mobile', value: { top: '64', bottom: '64' }, label: 'Programs padding mobile' });

    // Build eyebrow + heading with inline accent color styles
    const textBlock = findBlock(section, 'text');
    const eyebrowText = programSection?.heading ? 'OUR PROGRAMS' : 'OUR PROGRAMS';
    const headingText = programSection?.heading || 'Choose Your Depth';
    const descText = programSection?.body || 'From shallow-water fundamentals to deep-sea mastery — every course includes equipment, materials, and marine biologist supervision.';

    if (textBlock) {
      // Narrower heading block (~8 cols) with eyebrow using inline styles
      const headingHtml = `<p style="color:${accentHexLocal}; font-size:12px; letter-spacing:0.25em; text-transform:uppercase; font-weight:500; margin-bottom:12px">${eyebrowText}</p>\n<h2>${headingText}</h2>\n<p>${descText}</p>`;
      operations.push({ type: 'replaceText', sectionId, blockId: textBlock.id, key: 'text', value: headingHtml, label: 'Programs heading text' });
      // Narrower width so description doesn't stretch full-width
      operations.push({ type: 'updateBlockSetting', sectionId, blockId: textBlock.id, key: 'width', value: '8', label: 'Programs heading width' });
      operations.push({ type: 'updateBlockSetting', sectionId, blockId: textBlock.id, key: 'text_align', value: 'center', label: 'Programs heading align' });
    }
    
    // Hide the image block placeholder
    const imageBlock = findBlock(section, 'image');
    if (imageBlock) {
      operations.push({ type: 'updateBlockSetting', sectionId, blockId: imageBlock.id, key: 'hide_on_desktop', value: 'true', label: 'Hide programs image' });
      operations.push({ type: 'updateBlockSetting', sectionId, blockId: imageBlock.id, key: 'hide_on_mobile', value: 'true', label: 'Hide programs image mobile' });
    }

    // Add feature blocks for each program card with dark card shells
    const programItems = programSection?.items || [
      { heading: 'Beginner Weave', body: '2 Days', price: '$349' },
      { heading: 'Advanced Patterns', body: '5 Days', price: '$899' },
      { heading: 'Master Artisan', body: '2 Weeks', price: '$2,400' },
    ];

    programItems.forEach((item, i) => {
      const blockId = `program_card_${i}`;
      let cardHtml = `<h4>${item.heading || `Program ${i + 1}`}</h4>`;
      if (item.body) cardHtml += `\n<p>${item.body}</p>`;
      if (item.price) cardHtml += `\n<p><strong style="font-size:24px; color:${accentHexLocal}">${item.price}</strong></p>`;
      if (item.ctaText) cardHtml += `\n<p><a href="${item.ctaUrl || '#'}" style="color:${accentHexLocal}">${item.ctaText}</a></p>`;

      operations.push({
        type: 'addBlock',
        sectionId,
        blockId,
        block: {
          type: 'feature',
          settings: {
            text: cardHtml,
            hide_image: programSection?.hasImages ? 'false' : 'true',
            image_width: '1000',
            text_align: 'center',
            width: '4',
            background_color: darkCardBg,
            border_radius: '12',
            box_shadow: siteIsDark ? 'none' : 'medium',
            use_btn: 'false',
            padding_desktop: { top: '24', right: '24', bottom: '24', left: '24' },
            padding_mobile: { top: '20', right: '20', bottom: '20', left: '20' },
          },
        },
        label: `Program card: ${item.heading || `Program ${i + 1}`}`,
      });
    });
  }

  // Map testimonials — use a dedicated section with feature blocks (one per testimonial)
  const testimonialSection = extracted.sections.find(s => s.intent === 'testimonial_band');
  if (validSectionIds.length > 3) {
    const sectionId = validSectionIds[3];
    const section = sections[sectionId];
    const accentHexLocal = accentColor ? toHex(accentColor.value) : (primaryColor ? toHex(primaryColor.value) : '#2eb89a');

    // Section-level settings
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'background_color', value: '#0b1214', label: 'Testimonials bg' });
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'padding_desktop', value: { top: '96', bottom: '96' }, label: 'Testimonials padding' });
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'padding_mobile', value: { top: '64', bottom: '64' }, label: 'Testimonials padding mobile' });

    // Add a heading text block with eyebrow using inline accent styles
    const textBlock = findBlock(section, 'text');
    if (textBlock) {
      const eyebrowLabel = testimonialSection?.heading ? 'TESTIMONIALS' : 'TESTIMONIALS';
      const headingLabel = testimonialSection?.heading || 'What Our Divers Say';
      const headingHtml = `<p style="color:${accentHexLocal}; font-size:12px; letter-spacing:0.25em; text-transform:uppercase; font-weight:500; margin-bottom:12px">${eyebrowLabel}</p>\n<h2>${headingLabel}</h2>`;
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

    // Dynamic testimonials from extracted data (fallback to hardcoded)
    const testimonialItems = testimonialSection?.items || [
      { name: 'Jordan Reed', role: 'Master Artisan Graduate, 2024', quote: '"I never thought I\'d find my calling at 40 feet below sea level. Now I sell my baskets at galleries in Maui."' },
      { name: 'Priya Nair', role: 'Beginner Weave, Bali Campus', quote: '"The instructors are incredibly patient — even when a curious sea turtle unraveled my entire second basket."' },
      { name: 'Marcus Holm', role: 'Advanced Patterns, Maldives', quote: '"Worth every penny. The bioluminescent night-weave session alone changed my entire perspective on craft."' },
    ];

    testimonialItems.forEach((t, i) => {
      const blockId = `testimonial_feature_${i}`;
      const featureText = `<p>${t.quote || ''}</p>\n<h4>${t.name || ''}</h4>\n<p>${t.role || ''}</p>`;
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
            background_color: darkCardBg,
            border_radius: '12',
            box_shadow: siteIsDark ? 'none' : 'medium',
            use_btn: 'false',
            padding_desktop: { top: '30', right: '30', bottom: '30', left: '30' },
            padding_mobile: { top: '20', right: '20', bottom: '20', left: '20' },
          },
        },
        label: `Testimonial: ${t.name || `Testimonial ${i + 1}`}`,
      });
    });
  }

  // Map CTA section — narrower width, correct button color, darker bg
  if (validSectionIds.length > 4) {
    const sectionId = validSectionIds[4];
    const section = sections[sectionId];
    const ctaSectionBg = siteIsDark ? darkCardBg : '#0b1214';
    
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'background_color', value: '#0b1214', label: 'CTA section bg' });
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'padding_desktop', value: { top: '96', bottom: '96' }, label: 'CTA padding' });
    operations.push({ type: 'updateSectionSetting', sectionId, key: 'padding_mobile', value: { top: '64', bottom: '64' }, label: 'CTA padding mobile' });
    
    const ctaHeading = extracted.sections.find(s => s.intent === 'cta_band')?.heading || 'Ready to Take the Plunge?';
    const ctaBody = extracted.sections.find(s => s.intent === 'cta_band')?.body || 'Next cohort starts June 15th in Bali. Limited to 8 students per instructor for personalized, one-on-one reef time.';

    const textBlock = findBlock(section, 'text');
    if (textBlock) {
      // CTA card with darker bg than the section
      const ctaCardBg = siteIsDark ? darkCardBg : 'rgba(255,255,255,0.04)';
      const ctaHtml = `<div style="background:${ctaCardBg}; border:1px solid rgba(255,255,255,0.08); border-radius:24px; padding:64px 48px; max-width:640px; margin:0 auto 24px">\n<h2>${ctaHeading}</h2>\n<p>${ctaBody}</p>\n</div>`;
      operations.push({ type: 'replaceText', sectionId, blockId: textBlock.id, key: 'text', value: ctaHtml, label: 'CTA text' });
      operations.push({ type: 'updateBlockSetting', sectionId, blockId: textBlock.id, key: 'text_align', value: 'center', label: 'CTA text align' });
      // Narrower block width (6-7 instead of 12)
      operations.push({ type: 'updateBlockSetting', sectionId, blockId: textBlock.id, key: 'width', value: '7', label: 'CTA block width' });
    }
    const ctaBlock = findBlock(section, 'cta');
    if (ctaBlock) {
      const ctaBtnText = extracted.sections.find(s => s.intent === 'cta_band')?.ctaText || 'Reserve Your Spot';
      operations.push({ type: 'updateBlockSetting', sectionId, blockId: ctaBlock.id, key: 'btn_text', value: ctaBtnText, label: 'CTA button text' });
      // Force correct button color
      if (primaryColor) {
        operations.push({ type: 'updateBlockSetting', sectionId, blockId: ctaBlock.id, key: 'btn_background_color', value: toHex(primaryColor.value), label: 'CTA button bg color' });
      }
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

/* ── Hero gradient overlay — lighter at top, heavier at bottom ── */
.section--hero .section__overlay,
.section:first-of-type .section__overlay {
  background: linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(11,18,20,0.65) 100%) !important;
}

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

/* ── Stats Section — borders top & bottom ── */
.section:nth-of-type(2) {
  border-top: 1px solid rgba(255,255,255,0.08) !important;
  border-bottom: 1px solid rgba(255,255,255,0.08) !important;
}
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

/* ── CTA Section — ensure button uses accent/primary color ── */
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
.cta-card + .btn, .cta-card ~ .btn {
  background-color: ${primaryHex} !important;
  color: ${bgHex} !important;
}

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

function buildHeroHtml(extracted: ExtractedDesign, accentHex: string): string {
    const hero = extracted.hero!;
    let html = '';
    if (hero.eyebrow || hero.subheading) {
      const eyebrowText = hero.eyebrow || hero.subheading || '';
      html += `<p class="hero-eyebrow" style="color:${accentHex}; font-size:13px; letter-spacing:0.3em; text-transform:uppercase; font-weight:500">${eyebrowText}</p>\n`;
    }
    if (hero.heading) {
      // If emphasisWord is set, wrap that word in a styled span (italic serif)
      if (hero.emphasisWord) {
        const emphasized = hero.heading.replace(
          new RegExp(`(${hero.emphasisWord})`, 'i'),
          `<span style="font-style:italic; font-family:'Playfair Display',Georgia,serif; color:${accentHex}">$1</span>`
        );
        html += `<h1>${emphasized}</h1>\n`;
      } else {
        html += `<h1>${hero.heading}</h1>\n`;
      }
    }
    // Add the description from source
    const descText = hero.subheading && hero.eyebrow
      ? hero.subheading
      : "Dive deep into the world's most exclusive craft. Certified instructors, pristine reefs, and the finest seagrass materials — all 30 feet below the surface.";
    html += `<p class="hero-description" style="font-size:18px; line-height:1.7; max-width:560px; margin:0 auto 32px">${descText}</p>`;
    return html;
  }

function isDarkColor(color: string): boolean {
  if (!color) return false;
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

/**
 * Detect whether the source site is dark-themed (bg luminance < 30%).
 * Used to dynamically choose dark card shells, shadow styles, etc.
 */
function detectDarkSite(extracted: ExtractedDesign): boolean {
  const bgColor = extracted.colors.find(c => c.usage === 'background');
  if (!bgColor) return false;
  const hex = bgColor.value.startsWith('#') ? bgColor.value : hslToHex(bgColor.value);
  return isDarkColor(hex);
}

/**
 * Darken a hex color by a factor (0-1). factor=0.15 means 15% lighter than source bg.
 * Used to create card shells that are slightly lighter than the page bg on dark sites.
 */
function darkenHex(hex: string, lightenFactor: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  // Lighten slightly for card shells on dark backgrounds
  const lr = Math.min(255, Math.round(r + (255 - r) * lightenFactor));
  const lg = Math.min(255, Math.round(g + (255 - g) * lightenFactor));
  const lb = Math.min(255, Math.round(b + (255 - b) * lightenFactor));
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}
