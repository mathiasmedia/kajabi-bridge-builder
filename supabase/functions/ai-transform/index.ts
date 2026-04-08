const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── Types ──────────────────────────────────────────────────────────────

type SourceFiles = {
  indexCss?: string;
  tailwindConfig?: string;
  components?: Record<string, string>;
  pages?: Record<string, string>;
};

type TransformPayload = {
  operations?: any[];
  cssOverrides?: string;
};

/*
 * KAJABI SCHEMA REFERENCE (streamlined-home base theme)
 *
 * Available section types: section, page_content, carousel, newsletter_hero,
 *   header, footer, sales_page_body, page_embedded_checkout, exit_pop, two_step,
 *   products, store_builder, blog_listings, blog_post_body, etc.
 *
 * For homepage content, ONLY use "section" type. Others are special-purpose.
 *
 * "section" type settings:
 *   bg_type: "none"|"color"|"image"|"video"
 *   background_color: CSS color (e.g. "RGBA(22, 30, 42, 0.86)")
 *   bg_image, bg_video, bg_position, full_width, full_height, vertical, horizontal
 *   multiple_columns_on_desktop, column_one_width, column_two_width, column_three_width, multiple_column_gap
 *   padding_desktop/padding_mobile: {top,left,right,bottom}
 *   equal_height: "true"|"false"
 *
 * Valid block types for "section":
 *   text, feature, card, cta, image, accordion, form, video, video_embed,
 *   audio, blog, code, countdown, course_outline, event, external_widget,
 *   link_list, multi_video, offer, pricing, social_icons, social_share
 *
 * Block "text" settings:
 *   text: rich HTML (<h1>, <h2>, <h4>, <p>, <span style="...">)
 *   width: "4"|"6"|"8"|"12" (grid columns, 12 = full width)
 *   block_column: "first"|"second"|"third"
 *   text_align: "left"|"center"|"right"
 *   mobile_text_align: "left"|"center"|"right"
 *   use_btn: "true"|"false"
 *   btn_text, btn_action, new_tab
 *   background_color, padding_desktop, padding_mobile, margin_desktop, margin_mobile
 *   drop_cap: "true"|"false"
 *
 * Block "feature" settings:
 *   text: rich HTML (<h4>Title</h4><p>Description</p>)
 *   image, image_alt, image_width, hide_image
 *   width: "4"|"6"|"12" (for multi-column layouts or desktop columns)
 *   block_column, text_align, mobile_text_align, use_btn, btn_text, btn_action
 *   background_color, padding_desktop, padding_mobile
 *
 * Block "cta" settings:
 *   btn_text, btn_action, new_tab
 *   width, block_column, text_align, mobile_text_align
 *   btn_text_color, btn_background_color, btn_border_radius
 *
 * Block "card" settings:
 *   Similar to feature, with image + text + optional button
 *
 * Block "image" settings:
 *   image, image_alt, width, img_action
 *
 * IMPORTANT: Section does NOT have heading/subheading settings!
 * All content including headings goes inside blocks as rich HTML.
 */

// ── Entry ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json();
    const step: string = body.step || "globals";

    if (step === "globals") {
      return await handleGlobalsStep(LOVABLE_API_KEY, body);
    } else if (step === "section") {
      return await handleSectionStep(LOVABLE_API_KEY, body);
    } else if (step === "refine") {
      return await handleRefineStep(LOVABLE_API_KEY, body);
    } else {
      return jsonResponse({ error: `Unknown step: ${step}` }, 400);
    }
  } catch (e) {
    console.error("ai-transform error:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});

// ── Step 1: Globals ──

async function handleGlobalsStep(apiKey: string, body: any) {
  const {
    sourceFiles = {},
    extractedDesign = {},
    themeStructure = {},
    availableSectionTypes = [],
    heroSectionId,
    heroBlockMap,
    pastTemplateLearnings = '',
  } = body;

  const systemPrompt = `You are an expert web-to-Kajabi theme transformer.

In THIS step you handle: global settings, header block updates, footer block updates, hero section block updates, navigation menus, and CSS overrides.
Do NOT add new sections in this step. Do NOT output addSection operations.

KAJABI SCHEMA RULES:
- Sections do NOT have heading/subheading/text settings. All content goes in BLOCKS.
- Section settings: bg_type, background_color, bg_image, full_width, padding_desktop, padding_mobile, vertical, horizontal, multiple_columns_on_desktop, column_one_width, column_two_width, column_three_width, multiple_column_gap
- Block types: text, feature, card, cta, image (use these exact names)
- Text block settings: text (rich HTML), width, text_align, use_btn, btn_text, btn_action, background_color
- CTA block settings: btn_text, btn_action, btn_text_color, btn_background_color
- Header block types: logo, menu, dropdown, user, cta
- Footer block types: logo, link_list, copyright, social_icons
- Menu/link_list blocks have settings.menu referencing a link_list ID

BACKGROUND COLOR RULES:
- Do NOT set a global "background_color" key. Instead, set bg_type and background_color on EACH SECTION individually when needed.
- For normal light/white sections, use bg_type="none" and omit background_color rather than adding a faint translucent wash.
- NEVER use barely-visible or near-transparent section background colors.
- For intentionally dark sections like hero/CTA bands, use a clearly visible solid or high-opacity background_color.
- Set readable global/body text colors. Never use very light paragraph text on light sections.

OPERATION TYPES (allowed in this step):
- updateGlobalSetting: { type, key, value, label } — for fonts, NOT for background_color
- updateSectionSetting: { type, sectionId, key, value, label }
- updateBlockSetting: { type, sectionId, blockId, key, value, label }
- replaceText: { type, sectionId, blockId, key:"text", value:"<html>", label }
- hideSection / showSection: { type, sectionId }
- addCssOverride: { type, css, label }
- updateNavigation: { type, menuId, links:[{name,url}], label }

NAVIGATION RULES:
- The header references menus: "main-menu" and "about-menu"
- The footer references menu: "main-menu"
- Generate updateNavigation ops for these menus using source nav items
- Format: { type: "updateNavigation", menuId: "main-menu", links: [{name: "Home", url: "/"}], label: "..." }

CSS RULES:
- Put all CSS in cssOverrides (fonts @import, typography, buttons, spacing)
- Do NOT set page-wide background colors in CSS. Each section controls its own background.
- Match the source design. Use !important when needed.

CRITICAL — BLOCK IDs:
You MUST use the EXACT block IDs from the theme structure. Do NOT fabricate or invent block IDs.
The block IDs are the keys under each section's "blocks" object in the theme structure below.

ID FORMAT: 13-digit numeric-only strings.
Use actual source text, no placeholders.

IMAGE RULES:
- If available image URLs are provided, use them for hero backgrounds (bg_type="image", bg_image=URL)
- For hero sections with a background image, set bg_type="image" and bg_image to the hero image URL
- Only use the provided URLs — do NOT invent image URLs${pastTemplateLearnings ? `

LEARNINGS FROM PAST EXPORTS (apply these patterns and avoid these mistakes):
${pastTemplateLearnings}` : ''}`;


  // Build explicit hero block reference so the AI can't get IDs wrong
  let heroBlockRef = '';
  if (heroSectionId && heroBlockMap) {
    heroBlockRef = `\n\n## Hero section block IDs (USE THESE EXACT IDs)
Hero sectionId: "${heroSectionId}"
Blocks:\n${Object.entries(heroBlockMap).map(([bid, b]: [string, any]) => {
      const textPreview = (b.settings?.text || '').slice(0, 100);
      return `- blockId: "${bid}" (type: ${b.type}) — current text: "${textPreview}..."`;
    }).join('\n')}

For hero content, generate replaceText operations using sectionId="${heroSectionId}" and the exact blockId values listed above.`;
  }

  const userPrompt = `## Source design
### index.css
\`\`\`css
${trimText(sourceFiles.indexCss, 1800)}
\`\`\`
### tailwind.config.ts
\`\`\`ts
${trimText(sourceFiles.tailwindConfig, 800)}
\`\`\`

## Source components
${buildRelevantSourceContext(sourceFiles)}

## Extracted design
${JSON.stringify({
    headingFont: extractedDesign?.headingFont,
    bodyFont: extractedDesign?.bodyFont,
    colors: extractedDesign?.colors,
    header: extractedDesign?.header,
    hero: extractedDesign?.hero,
    footer: extractedDesign?.footer,
    buttonStyle: extractedDesign?.buttonStyle,
  }, null, 2)}

## Current Kajabi theme structure
${JSON.stringify(themeStructure, null, 2)}
${heroBlockRef}

${(() => {
  const imgs = (extractedDesign?.assets || []).filter((a: any) => a.url && a.type === 'image');
  return imgs.length > 0
    ? `## Available images\n${imgs.map((a: any) => `- ${a.fileName}: ${a.url}`).join('\n')}\nUse the hero image as bg_image on the hero section (set bg_type="image").`
    : '';
})()}

Generate operations for: header, footer, hero blocks, navigation menus, and CSS overrides.
IMPORTANT: For the hero, you MUST generate replaceText ops targeting the exact block IDs listed above.
IMPORTANT: Generate updateNavigation for "main-menu" and "about-menu" using the source nav items.
${(extractedDesign?.assets || []).some((a: any) => a.url && a.fileName?.includes('hero')) ? 'IMPORTANT: Set the hero section bg_type="image" and bg_image to the hero image URL.' : ''}`;

  const result = await requestTransform({
    apiKey,
    model: "google/gemini-3-flash-preview",
    systemPrompt,
    userPrompt,
    maxTokens: 12000,
  });

  console.log(`ai-transform [globals] finish_reason=${result.finishReason ?? "unknown"}`);

  const parsed = normalizeTransformPayload(result.parsed, availableSectionTypes);
  // Remove addSection ops (not allowed in globals) and global background_color (use per-section instead)
  parsed.operations = parsed.operations.filter((op: any) => {
    if (op.type === 'addSection') return false;
    if (op.type === 'updateGlobalSetting' && op.key === 'background_color') return false;
    return true;
  });

  if (parsed.operations.length === 0 && !parsed.cssOverrides) {
    return jsonResponse({ error: "AI returned no valid global operations. Please retry." }, 500);
  }

  return jsonResponse({
    operations: parsed.operations,
    cssOverrides: parsed.cssOverrides,
  });
}

// ── Step 2: Single section generation ──

async function handleSectionStep(apiKey: string, body: any) {
  const {
    sourceFiles = {},
    extractedDesign = {},
    themeStructure = {},
    availableSectionTypes = [],
    sectionToGenerate,
    existingSectionHeadings = [],
  } = body;

  if (!sectionToGenerate) {
    return jsonResponse({ error: "sectionToGenerate is required for section step" }, 400);
  }

  const sectionContext = findSectionSourceContext(sourceFiles, sectionToGenerate);
  // Use upstream intent from extractor (primary), fall back to local classification
  const intent: SectionIntent = mapUpstreamIntent(sectionToGenerate.intent) || classifySectionIntent(sectionToGenerate);
  const blockPattern = getBlockPatternForIntent(intent);

  // Build richness requirements based on intent + upstream metadata
  const richnessGuard = buildRichnessGuard(intent, sectionToGenerate);

  const dedupWarning = existingSectionHeadings.length > 0
    ? `\n\nDEDUPLICATION: These headings already exist. Do NOT repeat them:\n${existingSectionHeadings.map((h: string) => `- "${h}"`).join("\n")}\nIf already covered, return {"operations":[],"cssOverrides":""}.`
    : "";

  const systemPrompt = `You are an expert web-to-Kajabi theme transformer.

Create exactly ONE addSection operation that faithfully recreates a source section.

CRITICAL KAJABI SCHEMA RULES:
- Section type MUST be "section" (the only type that supports rich content blocks)
- Section settings: bg_type ("none"|"color"|"image"), background_color, padding_desktop, padding_mobile, full_width, vertical, horizontal, equal_height, multiple_columns_on_desktop, column_one_width, column_two_width, column_three_width, multiple_column_gap
- Default full_width to false. Only use full_width=true if the user explicitly wants a full-bleed section.
- Do NOT set background_color on every section.
- For normal light sections, use bg_type="none" and leave background_color empty/omitted.
- If you use background_color, it must be clearly intentional and visibly opaque — never a faint low-alpha wash.
- Body text on light sections must be dark and readable.
- Section does NOT have heading, subheading, or text settings! ALL content goes in BLOCKS.
- Section does NOT have heading, subheading, or text settings! ALL content goes in BLOCKS.

VALID BLOCK TYPES: text, feature, card, cta, image
- "text" block: settings.text = rich HTML (<h1>/<h2>/<h4>/<p>), settings.width ("4"|"6"|"8"|"12"), block_column, text_align, mobile_text_align, use_btn, btn_text, btn_action, background_color
- "feature" block: settings.text = rich HTML (<h4>Title</h4><p>Desc</p>), settings.image, settings.width ("4"|"6"|"12"), block_column, text_align, mobile_text_align, use_btn, btn_text, btn_action, hide_image
- "cta" block: settings.btn_text, settings.btn_action, settings.width, block_column, text_align, mobile_text_align, btn_text_color, btn_background_color
- "image" block: settings.image, settings.image_alt, settings.width, block_column
- "card" block: similar to feature

${blockPattern}

COMPLETE EXAMPLE — Stats section with 3 stat columns:
{
  "type": "addSection",
  "sectionId": "1718825317433",
  "label": "Stats Section",
  "section": {
    "type": "section",
    "name": "Stats",
    "settings": {
      "bg_type": "color",
      "background_color": "#0b1214",
      "padding_desktop": {"top":"80","bottom":"80"},
      "padding_mobile": {"top":"48","bottom":"48"},
      "horizontal": "center",
      "equal_height": "true"
    },
    "block_order": ["1718825317501","1718825317502","1718825317503"],
    "blocks": {
      "1718825317501": {
        "type": "feature",
        "settings": {"text":"<h4>2,400+</h4><p>Graduates certified worldwide</p>","width":"4","text_align":"center","hide_image":"true"}
      },
      "1718825317502": {
        "type": "feature",
        "settings": {"text":"<h4>27</h4><p>Years of teaching excellence</p>","width":"4","text_align":"center","hide_image":"true"}
      },
      "1718825317503": {
        "type": "feature",
        "settings": {"text":"<h4>12</h4><p>Reef locations globally</p>","width":"4","text_align":"center","hide_image":"true"}
      }
    }
  }
}

CONTENT RULES:
- ALL text content goes in block settings.text as rich HTML
- Use <h1>/<h2> for main headings, <h4> for sub-headings, <p> for body
- Use width to create multi-column layouts (width "4" = 3 columns, "6" = 2 columns)
- If a heading introduces cards below it, keep them in the SAME section: heading block width "12", then card blocks width "4" each.
- For split content/image sections, use desktop columns with section settings multiple_columns_on_desktop="yes", column_one_width="4", column_two_width="4", and put text/CTA blocks in block_column="first" and the image in block_column="second". In this pattern, each block should usually have width "12".
- For split content/image sections, left-side text and CTA blocks should be left-aligned on desktop and mobile.
- Include ALL items from source (4 features = 4 feature/card blocks)
- NEVER compress multiple source items into one block
- If items count is N, output at least N item blocks plus any heading/introduction block
- For course/program sections, use one card or feature block per course with title, supporting details, description, and price when present
- For testimonial sections, use one text or card block per testimonial with the quote and the person's name/role when present
- Include buttons via use_btn="true" + btn_text + btn_action
- Use actual source text, no placeholders

IMAGE RULES:
- If available image URLs are provided below, USE them in appropriate blocks
- For "image" blocks: set settings.image to the URL, settings.image_alt to a description
- For "feature" blocks with images: set settings.image to the URL (do NOT set hide_image)
- For section backgrounds: set bg_type="image" and bg_image to the URL
- Match images to sections contextually (hero bg → hero image, product shots → course cards, etc.)
- Only use the provided URLs — do NOT invent image URLs

ID FORMAT: 13-digit numeric-only strings.
FOOTER RULE: If this is a footer section, return {"operations":[],"cssOverrides":""}.${dedupWarning}`;

  const itemsDetail = sectionToGenerate.items?.length
    ? `\n\n## ITEMS TO INCLUDE (MANDATORY — use ALL of these, one block per item):\n${sectionToGenerate.items.map((item: any, i: number) => {
        const parts = [`${i + 1}. "${item.title || item.heading || 'Untitled'}"`];
        if (item.body) parts.push(`   Body: ${item.body}`);
        if (item.price) parts.push(`   Price: ${item.price}`);
        if (item.quote) parts.push(`   Quote: "${item.quote}"`);
        if (item.author) parts.push(`   Author: ${item.author}`);
        if (item.role) parts.push(`   Role: ${item.role}`);
        if (item.meta) parts.push(`   Meta: ${item.meta}`);
        return parts.join('\n');
      }).join('\n')}\n\nYou MUST create one feature/card/text block per item above. Do NOT use placeholder text like "Card Title" or "Lorem ipsum".`
    : '';

  // Build available images reference
  const availableImages = (extractedDesign?.assets || [])
    .filter((a: any) => a.url && a.type === 'image')
    .map((a: any) => `- ${a.fileName}: ${a.url} (from source: ${a.sourcePath})`);
  const imageContext = availableImages.length > 0
    ? `\n\n## Available images (use these URLs in image/feature blocks or section bg_image)\n${availableImages.join('\n')}`
    : '';

  const userPrompt = `## Source section to recreate
${JSON.stringify(sectionToGenerate, null, 2)}
${itemsDetail}
${imageContext}

## Semantic intent (PRIMARY DRIVER — follow this)
- Intent: ${intent}
- Confidence: ${sectionToGenerate.confidence ?? 'unknown'}
- Evidence: ${(sectionToGenerate.evidence || []).join('; ') || 'none'}
- Flags: hasHeading=${sectionToGenerate.hasHeading ?? false}, hasBody=${sectionToGenerate.hasBody ?? false}, hasButtons=${sectionToGenerate.hasButtons ?? false}, hasImages=${sectionToGenerate.hasImages ?? false}, hasStats=${sectionToGenerate.hasStats ?? false}, hasTestimonials=${sectionToGenerate.hasTestimonials ?? false}, hasPricing=${sectionToGenerate.hasPricing ?? false}, hasRepeatedCards=${sectionToGenerate.hasRepeatedCards ?? false}
- Repeated items: ${sectionToGenerate.repeatedItemCount ?? 0}
- Media intent: ${sectionToGenerate.mediaIntent || 'no_media'} (confidence: ${sectionToGenerate.mediaConfidence ?? 0})
- Media evidence: ${(sectionToGenerate.mediaEvidence || []).join('; ') || 'none'}
- Image targets: ${(sectionToGenerate.imageTargets || []).map((t: any) => `${t.role}${t.url ? ': ' + t.url : ''}`).join(', ') || 'none'}

## Source section content
- Heading: ${sectionToGenerate.heading || "none"}
- Body: ${sectionToGenerate.body || "none"}
- CTA: ${sectionToGenerate.ctaText || "none"} → ${sectionToGenerate.ctaUrl || "none"}
- Items count: ${sectionToGenerate.items?.length || 0}

${richnessGuard}

## Relevant source code
${sectionContext}

## Design tokens
${JSON.stringify({
    headingFont: extractedDesign?.headingFont,
    bodyFont: extractedDesign?.bodyFont,
    colors: extractedDesign?.colors?.slice(0, 6),
    buttonStyle: extractedDesign?.buttonStyle,
  }, null, 2)}

Create ONE addSection with type "section" and rich content blocks.
Remember: section settings do NOT have heading/subheading/text fields. Put ALL content in blocks.
Block text must be rich HTML. Use width for column layouts.
CRITICAL: Use the ACTUAL text from the items list above. Never use generic placeholder text.
${availableImages.length > 0 ? 'IMPORTANT: Use the available image URLs where contextually appropriate (hero backgrounds, course/feature cards, etc.).' : ''}`;

  const models = ["google/gemini-2.5-flash", "google/gemini-3-flash-preview"];
  let lastError = "";

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        // Use plain JSON output (no tool calling) to avoid additionalProperties blocks bug
        const result = await requestJsonTransform({
          apiKey,
          model,
          systemPrompt,
          userPrompt,
          maxTokens: 12000,
        });

        const fr = result.finishReason ?? "unknown";
        console.log(`ai-transform [section:${sectionToGenerate.type}] [${model}] attempt=${attempt} finish_reason=${fr}`);

        if (fr === "length" || fr === "max_tokens") {
          console.warn(`ai-transform [section] TRUNCATED on attempt ${attempt}`);
          lastError = "Response truncated";
          continue;
        }

        const parsed = normalizeTransformPayload(result.parsed, availableSectionTypes);
        const addSectionOp = parsed.operations.find((op: any) => op.type === "addSection");

        if (addSectionOp) {
          const finalBlockCount = Object.keys(addSectionOp.section?.blocks || {}).length;
          console.log(`ai-transform [section] NORMALIZED addSection: blocks=${finalBlockCount}`);
          if (addSectionOp.section) {
            addSectionOp.section.type = "section";
          }
          if (finalBlockCount > 0) {
            return jsonResponse({ operations: [addSectionOp] });
          }
          console.warn(`ai-transform [section] AI returned 0 blocks on attempt ${attempt}, retrying...`);
          lastError = "AI returned section with 0 blocks";
          continue;
        }

        if (intent === 'footer') {
          return jsonResponse({ operations: [] });
        }

        lastError = "No valid addSection operation produced";
        console.warn(`ai-transform [section] [${model}] ${lastError}`, JSON.stringify(result.parsed).slice(0, 500));
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(`ai-transform [section] [${model}] attempt=${attempt} failed: ${lastError}`);
        if (attempt < 2) continue;
      }
    }
  }

  // Gracefully skip sections that couldn't be generated instead of failing the whole pipeline
  console.warn(`ai-transform [section] SKIPPING "${sectionToGenerate.heading || sectionToGenerate.type}": ${lastError}`);
  return jsonResponse({ operations: [], cssOverrides: "" });
}

// ── Step 3: Refine existing plan ──

async function handleRefineStep(apiKey: string, body: any) {
  const {
    extractedDesign = {},
    currentPlan = {},
    sourceFiles = {},
  } = body;

  const currentOps = currentPlan.operations || [];

  // Build a compact summary of current operations for the AI
  const opsSummary = currentOps.map((op: any, i: number) => {
    if (op.type === 'addSection') {
      const blocks = Object.values(op.section?.blocks || {}) as any[];
      const blockSummary = blocks.map((b: any) => {
        const text = (b.settings?.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
        return `  - [${b.type}] "${text}"${b.settings?.btn_text ? ` [btn: ${b.settings.btn_text}]` : ''}`;
      }).join('\n');
      return `${i}: addSection "${op.label}" (${blocks.length} blocks)\n${blockSummary}`;
    }
    if (op.type === 'replaceText') return `${i}: replaceText "${op.label}" → ${(op.value || '').slice(0, 60)}`;
    if (op.type === 'addCssOverride') return `${i}: addCssOverride (${(op.css || '').length} chars)`;
    return `${i}: ${op.type} "${op.label || ''}"`;
  }).join('\n\n');

  const systemPrompt = `You are an expert web-to-Kajabi theme reviewer. You are given:
1. The original source design (extracted sections, colors, fonts, hero, etc.)
2. The current transformation plan (list of operations already generated)

Your job: Review the plan and return a REPLACEMENT set of operations that improves the page.

Focus on:
- Missing content: Are all source sections represented? Are testimonial quotes, course details, prices present?
- Placeholder text: Replace any generic "Card Title", "Lorem ipsum", or "Call To Action" with actual source content.
- Visual consistency: Do background colors match the source dark theme? Are fonts applied correctly?
- Block completeness: Do sections have the right number of blocks matching the source items?
- CTA buttons: Are button texts and URLs from the source correctly applied?

RULES:
- Return a COMPLETE operations array — it replaces the current one entirely.
- Keep operations that are already correct (don't break what works).
- Fix or replace operations that have placeholder content or missing data.
- Section type MUST be "section". Block types: text, feature, card, cta, image.
- All content goes in block settings.text as rich HTML.
- Use actual source text, no placeholders.
- ID FORMAT: 13-digit numeric-only strings. Reuse existing IDs where possible.

Return JSON: {"operations": [...], "cssOverrides": "...", "improvements": ["list of what you changed"]}`;

  const userPrompt = `## Source design (what the page should look like)
${JSON.stringify({
    hero: extractedDesign?.hero,
    header: extractedDesign?.header,
    footer: extractedDesign?.footer,
    sections: extractedDesign?.sections,
    colors: extractedDesign?.colors,
    headingFont: extractedDesign?.headingFont,
    bodyFont: extractedDesign?.bodyFont,
    buttonStyle: extractedDesign?.buttonStyle,
  }, null, 2)}

## Current plan operations (review and improve these)
${opsSummary}

## Current plan (full JSON for reference)
${JSON.stringify(currentOps, null, 2).slice(0, 12000)}

Review, improve, and return the complete replacement operations array.`;

  try {
    const result = await requestJsonTransform({
      apiKey,
      model: "google/gemini-2.5-flash",
      systemPrompt,
      userPrompt,
      maxTokens: 16000,
    });

    console.log(`ai-transform [refine] finish_reason=${result.finishReason ?? "unknown"}`);

    const parsed = result.parsed;
    const operations = Array.isArray(parsed.operations) ? parsed.operations : [];
    const improvements = Array.isArray(parsed.improvements) ? parsed.improvements : [];

    if (operations.length === 0) {
      return jsonResponse({ error: "Refine pass returned no operations" }, 500);
    }

    // Ensure all addSection ops have type "section"
    for (const op of operations) {
      if (op.type === 'addSection' && op.section) {
        op.section.type = 'section';
      }
    }

    console.log(`ai-transform [refine] ${operations.length} ops, ${improvements.length} improvements`);

    return jsonResponse({
      operations,
      cssOverrides: parsed.cssOverrides || '',
      improvements,
    });
  } catch (e) {
    console.error("ai-transform [refine] error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Refine failed" }, 500);
  }
}

// ── Block pattern templates ──

function getBlockPatternForIntent(intent: SectionIntent): string {
  const patterns: Record<SectionIntent, string> = {
    'hero': `PATTERN for hero:
- 1 text block (width "8"-"12"): Rich HTML heading with inline emphasis where source has it.
  Example: <h1>Master the Art of <span style="color:#ACCENT">Underwater Basketweaving</span></h1>
  <p style="font-size:20px">Subheading paragraph with full source text</p>
- use_btn="true" with btn_text and btn_action for the primary CTA
- If source has a secondary CTA, include it as a styled link in the text:
  <p><a href="/secondary-url" style="font-size:16px; text-decoration:underline">Secondary CTA Text</a></p>
- If source has an eyebrow/pre-heading, include it as: <p style="text-transform:uppercase; letter-spacing:0.2em; font-size:14px">Eyebrow Text</p>
- Section: bg_type="color" or "image", background_color for dark bg
- CRITICAL: Preserve any pre-heading/eyebrow text as a separate <p> before the <h1>`,

    'stats': `PATTERN for stats:
- Multiple feature blocks (width "3" or "4" each, hide_image="true")
- Each feature block: <h4>Number/Value</h4><p>Label/Description</p>
- CRITICAL: Every stat MUST have a numeric value in <h4> and a label in <p>. Never output label-only blocks.
- Section: equal_height="true"`,

    'feature-grid': `PATTERN for features:
- 1 text block (width "12"): <h2>Section Title</h2><p>Intro text</p>
- Multiple feature blocks (width "4" or "6" each): <h4>Feature Title</h4><p>Description</p>
- Include ALL features from source, with use_btn if source has CTAs`,

    'icon-card-row': `PATTERN for icon card row:
- 1 text block (width "12", make_block="true"): <h2>Section Title</h2><p>Intro text</p>
- Multiple feature blocks (width "4" each, one per icon card):
  - <h4>Card Title</h4><p>Description text</p>
  - If source has icons: you can reference them in text or use a decorative emoji/symbol as placeholder
  - Set background_color, box_shadow="medium", border_radius="12" for card shell appearance
  - Set padding_desktop={"top":"24","right":"24","bottom":"24","left":"24"}
  - Set hide_image="true" (icons are inline, not image blocks)
- Section: equal_height="true"
- CRITICAL: One block per card. Do NOT merge multiple cards into one text block.
- CRITICAL: These are distinct CARDS with visual separation, not plain text columns.`,

    'program-cards': `PATTERN for program/course cards:
- 1 text block (width "12", make_block="true"): <h2>Section Title</h2><p>Intro paragraph</p>
- Multiple feature blocks (width "4" each, one per program/course):
  - <h4>Course Title</h4><p class="meta">Duration/Level</p><p>Description</p><p><strong style="font-size:24px">Price</strong></p>
  - Include use_btn="true" + btn_text for CTAs when available
  - Include image if available (do NOT set hide_image="true")
  - Set image_width="1000" for prominent card images
- Section: equal_height="true"
- CRITICAL: One block per course/program. Do NOT merge multiple courses into one block.
- CRITICAL: Include badge labels like "Most Popular" or "Limited Spots" if they exist in the source.`,

    'testimonial-band': `PATTERN for testimonials:
- 1 text block (width "12", make_block="true"): <h2>Section Title</h2><p>Subtitle if present</p>
- Multiple text blocks (width "4", one per testimonial):
  - <p style="font-style:italic; font-size:16px">"Quote text — use the FULL quote from source"</p>
  - <h4>Person Name</h4><p>Role/Title</p>
- Section: equal_height="true"
- CRITICAL: One block per testimonial. Each MUST have the actual quote text from source.
- CRITICAL: Do NOT invent or shorten quotes. Use the full source quote.`,

    'cta-band': `PATTERN for CTA:
- 1 text block (width "8", text_align "center"):
  <h2>CTA Heading</h2><p>Supporting text</p>
  use_btn="true", btn_text="Button Text", btn_action="/url"
- If source has TWO CTAs: include the secondary CTA as a styled link below the button:
  <p><a href="/secondary-url" style="font-size:16px; text-decoration:underline">Secondary CTA Text</a></p>
- Do NOT use a separate cta block. Keep button INSIDE the text block via use_btn.
- CRITICAL: The heading, body, and button must be in the SAME block for unified background.`,

    'content-media-split': `PATTERN for content/media split:
- 1 text block (width "5"-"6"): heading + body text + optional checklist
  - If source has a checklist/bullet list, preserve as: <ul><li>✓ Item 1</li><li>✓ Item 2</li></ul>
  - Do NOT collapse checklist items into a single paragraph
  - Include use_btn="true" + btn_text if source has a CTA
- 1 image block (width "5"-"6"): image, image_alt
  - If no image URL is available, use a styled text block as visual placeholder
- CRITICAL: Preserve BOTH sides of the split. Do not collapse into centered text.`,

    'footer': `Return empty operations.`,

    'heading-separator': `PATTERN for heading separator:
- 1 text block (width "8"-"12"): <h2>Heading</h2>`,

    'faq': `PATTERN for FAQ:
- 1 text block (width "12"): <h2>FAQ Heading</h2>
- Multiple text blocks (width "12" each) for Q&A pairs: <h4>Question?</h4><p>Answer text</p>
- If an accordion block type is available, use that instead.`,

    'content': `PATTERN for content:
- 1 text block (width "8"-"12"): <h2>Heading</h2><p>Body text</p>
- Optional: use_btn="true" with btn_text + btn_action (NOT a separate cta block)`,
  };

  return patterns[intent] || patterns['content'];
}

// ── Plain JSON request (no tool calling — avoids additionalProperties blocks bug) ──

async function requestJsonTransform({
  apiKey, model, systemPrompt, userPrompt, maxTokens,
}: {
  apiKey: string; model: string; systemPrompt: string; userPrompt: string; maxTokens: number;
}) {
  const maxRetries = 3;
  const requestBody = JSON.stringify({
    model,
    max_completion_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt + "\n\nRespond with ONLY a JSON object. No markdown, no code fences, just raw JSON." },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  let lastError = "";
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      if (response.ok) {
        const aiResult = await response.json();
        const content = aiResult.choices?.[0]?.message?.content || "";
        if (!content?.trim()) throw new Error("AI returned empty response");
        const parsed = extractJson(content);
        return { parsed, finishReason: aiResult.choices?.[0]?.finish_reason ?? null };
      }

      const errText = await response.text();
      if (response.status === 429) throw new Error("Rate limited, please try again shortly.");
      if (response.status === 402) throw new Error("Credits exhausted.");
      if (response.status >= 500 && attempt < maxRetries) {
        lastError = `AI gateway returned ${response.status}`;
        await new Promise(r => setTimeout(r, attempt * 2000));
        continue;
      }
      throw new Error(`AI gateway returned ${response.status}: ${errText}`);
    } catch (e) {
      if (e instanceof Error && (e.message.includes("Rate limited") || e.message.includes("Credits exhausted"))) throw e;
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < maxRetries) { await new Promise(r => setTimeout(r, attempt * 2000)); continue; }
    }
  }
  throw new Error(`AI gateway failed after ${maxRetries} attempts: ${lastError}`);
}



function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requestTransform({
  apiKey, model, systemPrompt, userPrompt, maxTokens,
}: {
  apiKey: string; model: string; systemPrompt: string; userPrompt: string; maxTokens: number;
}) {
  const maxRetries = 3;
  const requestBody = JSON.stringify({
    model,
    max_completion_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    tools: [{
        type: "function",
        function: {
          name: "apply_transformations",
          description: "Apply Kajabi theme transformations",
          parameters: {
            type: "object",
            properties: {
              operations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    sectionId: { type: "string" },
                    blockId: { type: "string" },
                    key: { type: "string" },
                    value: {},
                    label: { type: "string" },
                    menuId: { type: "string" },
                    links: { type: "array", items: { type: "object", properties: { name: { type: "string" }, url: { type: "string" } }, required: ["name", "url"] } },
                    section: {
                      type: "object",
                      description: "Full section definition with blocks",
                      properties: {
                        type: { type: "string", enum: ["section"] },
                        name: { type: "string" },
                        settings: {
                          type: "object",
                          properties: {
                            bg_type: { type: "string", enum: ["none", "color", "image"] },
                            background_color: { type: "string" },
                            padding_desktop: { type: "object" },
                            padding_mobile: { type: "object" },
                            horizontal: { type: "string" },
                            equal_height: { type: "string" },
                          },
                        },
                        block_order: { type: "array", items: { type: "string" }, description: "Array of 13-digit block IDs matching keys in blocks" },
                        blocks: {
                          type: "object",
                          description: "Map of 13-digit block ID to block object. MUST contain at least 1 block.",
                          additionalProperties: {
                            type: "object",
                            properties: {
                              type: { type: "string", enum: ["text", "feature", "card", "cta", "image"] },
                              settings: {
                                type: "object",
                                properties: {
                                  text: { type: "string", description: "Rich HTML content e.g. <h2>Title</h2><p>Body</p>" },
                                  width: { type: "string", enum: ["3", "4", "6", "8", "12"] },
                                  text_align: { type: "string", enum: ["left", "center", "right"] },
                                  use_btn: { type: "string", enum: ["true", "false"] },
                                  btn_text: { type: "string" },
                                  btn_action: { type: "string" },
                                  hide_image: { type: "string", enum: ["true", "false"] },
                                },
                              },
                            },
                            required: ["type", "settings"],
                          },
                        },
                      },
                      required: ["type", "name", "settings", "block_order", "blocks"],
                    },
                    block: { type: "object" },
                    css: { type: "string" },
                  },
                  required: ["type"],
                },
              },
              cssOverrides: {
                type: "string",
                description: "CSS string with @import and all overrides",
              },
            },
            required: ["operations", "cssOverrides"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "apply_transformations" } },
    });

  let lastError = "";
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      if (response.ok) {
        const aiResult = await response.json();
        const parsed = parseAiResponse(aiResult);
        const rawToolCallArgs = aiResult.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || null;
        return { parsed, finishReason: aiResult.choices?.[0]?.finish_reason ?? null, rawToolCallArgs };
      }

      const errText = await response.text();
      console.error(`AI gateway error (attempt ${attempt}/${maxRetries}):`, response.status, errText);

      if (response.status === 429) throw new Error("Rate limited, please try again shortly.");
      if (response.status === 402) throw new Error("Credits exhausted. Add funds in Settings > Workspace > Usage.");

      // Retry on 5xx errors
      if (response.status >= 500 && attempt < maxRetries) {
        lastError = `AI gateway returned ${response.status}: ${errText}`;
        const delay = attempt * 2000; // 2s, 4s backoff
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      throw new Error(`AI gateway returned ${response.status}: ${errText}`);
    } catch (e) {
      if (e instanceof Error && (e.message.includes("Rate limited") || e.message.includes("Credits exhausted"))) throw e;
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < maxRetries) {
        const delay = attempt * 2000;
        console.log(`Retrying after error in ${delay}ms: ${lastError}`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    }
  }
  throw new Error(`AI gateway failed after ${maxRetries} attempts: ${lastError}`);
}

function parseAiResponse(aiResult: any): TransformPayload {
  const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try { return extractJson(toolCall.function.arguments); } catch {
      console.error("Failed to parse tool call args:", toolCall.function.arguments.slice(0, 500));
    }
  }
  let content = aiResult.choices?.[0]?.message?.content || "";
  if (!content && toolCall?.function?.arguments) content = toolCall.function.arguments;
  if (!content?.trim()) throw new Error("AI returned an empty response. Please retry.");
  return extractJson(content);
}

function extractJson(raw: string): TransformPayload {
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* continue */ }

  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error("AI returned invalid JSON — no object found");
  }
  cleaned = cleaned.substring(jsonStart, jsonEnd + 1)
    .replace(/,\s*}/g, "}").replace(/,\s*]/g, "]")
    .replace(/[\x00-\x1F\x7F]/g, (ch) => "\n\r\t".includes(ch) ? ch : "");
  try { return JSON.parse(cleaned); } catch { /* continue */ }

  let braces = 0, brackets = 0;
  for (const char of cleaned) {
    if (char === "{") braces++; if (char === "}") braces--;
    if (char === "[") brackets++; if (char === "]") brackets--;
  }
  while (brackets > 0) { cleaned += "]"; brackets--; }
  while (braces > 0) { cleaned += "}"; braces--; }
  try { return JSON.parse(cleaned); } catch (e) {
    throw new Error(`AI returned invalid JSON: ${(e as Error).message}`);
  }
}

// ── Normalization ──

const VALID_BLOCK_TYPES = new Set([
  "text", "feature", "card", "cta", "image", "accordion", "form", "video",
  "video_embed", "audio", "blog", "code", "countdown", "course_outline",
  "event", "external_widget", "link_list", "multi_video", "offer", "pricing",
  "social_icons", "social_share",
]);

function normalizeTransformPayload(
  parsed: TransformPayload,
  availableSectionTypes: string[],
): Required<TransformPayload> {
  // Handle case where AI returns a single addSection directly (not wrapped in operations array)
  let operations: any[];
  if (Array.isArray(parsed?.operations)) {
    operations = parsed.operations;
  } else if ((parsed as any)?.type === 'addSection') {
    // AI returned a single operation directly
    operations = [parsed];
  } else {
    operations = [];
  }
  const cssOverrides = typeof parsed?.cssOverrides === "string" ? parsed.cssOverrides : "";

  const normalizedOperations = operations.filter((op: any) => {
    if (!op || typeof op.type !== "string") return false;

    if (op.type === "updateNavigation") {
      return !!op.menuId && Array.isArray(op.links);
    }

    if (op.type === "updateGlobalSetting" && typeof op.key === "string") {
      if (op.key.startsWith("content_for_")) op.value = normalizeIdArray(op.value);
    }

    if (op.type === "addSection") {
      if (!/^\d{13}$/.test(String(op.sectionId || ""))) op.sectionId = createNumericId();

      if (!isPlainObject(op.section)) op.section = {};

      // Force type to "section" for content sections
      op.section.type = "section";

      if (typeof op.section.name !== "string" || !op.section.name.trim()) {
        op.section.name = typeof op.label === "string" ? op.label.trim() : "Generated Section";
      }

      // Clean section settings — remove invalid keys
      if (!isPlainObject(op.section.settings)) op.section.settings = {};
      cleanSectionSettings(op.section.settings);

      // Normalize blocks
      if (Array.isArray(op.section.blocks)) {
        op.section.blocks = Object.fromEntries(
          op.section.blocks.map((b: any, i: number) => [createNumericId(), normalizeBlock(b)])
        );
      }
      if (!isPlainObject(op.section.blocks)) op.section.blocks = {};

      for (const [bid, block] of Object.entries(op.section.blocks)) {
        op.section.blocks[bid] = normalizeBlock(block);
      }

      // Remap block IDs to 13-digit numeric
      op.section = remapBlockIds(op.section);

      // Fix block_order
      op.section.block_order = Array.isArray(op.section.block_order)
        ? op.section.block_order.map((id: unknown) => String(id)).filter((id: string) => id in op.section.blocks)
        : Object.keys(op.section.blocks);
      if (op.section.block_order.length === 0 && Object.keys(op.section.blocks).length > 0) {
        op.section.block_order = Object.keys(op.section.blocks);
      }
    }

    if (op.type === "addBlock") {
      if (!/^\d{13}$/.test(String(op.blockId || ""))) op.blockId = createNumericId();
      if (!isPlainObject(op.block)) return false;
      op.block = normalizeBlock(op.block);
    }

    return true;
  });

  return { operations: normalizedOperations, cssOverrides };
}

function cleanSectionSettings(settings: Record<string, any>) {
  // Remove keys that don't belong on section settings
  const invalidSectionKeys = ['heading', 'subheading', 'text', 'heading_color', 'text_color', 'button_label'];
  for (const key of invalidSectionKeys) {
    delete settings[key];
  }
  // Ensure padding objects
  for (const key of ['padding_desktop', 'padding_mobile']) {
    if (settings[key] && typeof settings[key] === 'string') {
      try { settings[key] = JSON.parse(settings[key]); } catch { settings[key] = { top: "60", bottom: "60" }; }
    }
  }
}

function normalizeBlock(block: any): { type: string; settings: Record<string, any> } {
  if (!isPlainObject(block)) {
    return { type: "text", settings: typeof block === "string" ? { text: block, width: "12" } : { width: "12" } };
  }

  let blockType = typeof block.type === "string" ? block.type.trim() : "text";
  
  // Fix common wrong block types
  const typeRemap: Record<string, string> = {
    "text_column": "feature",
    "text-column": "feature",
    "textcolumn": "feature",
    "stat": "feature",
    "testimonial": "text",
    "quote": "text",
    "heading": "text",
    "paragraph": "text",
    "button": "cta",
  };
  if (typeRemap[blockType.toLowerCase()]) {
    blockType = typeRemap[blockType.toLowerCase()];
  }
  if (!VALID_BLOCK_TYPES.has(blockType)) {
    blockType = "text";
  }

  let settings = isPlainObject(block.settings) ? { ...block.settings } : {};

  // If block has heading/body at top level but no settings.text, build it
  if (!settings.text) {
    const heading = settings.heading || block.heading || block.title || "";
    const body = settings.body || settings.description || block.body || block.description || block.text || "";
    if (heading || body) {
      let html = "";
      if (heading) html += blockType === "feature" ? `<h4>${escapeHtml(heading)}</h4>` : `<h2>${escapeHtml(heading)}</h2>`;
      if (body) html += typeof body === "string" && body.trim().startsWith("<") ? body : `<p>${escapeHtml(body)}</p>`;
      settings.text = html;
    }
  }

  // Clean up non-standard settings keys
  delete settings.heading;
  delete settings.body;
  delete settings.description;
  delete settings.title;

  // Fix field name mismatches
  if (settings.btn_url && !settings.btn_action) { settings.btn_action = settings.btn_url; delete settings.btn_url; }
  if (settings.button_url && !settings.btn_action) { settings.btn_action = settings.button_url; delete settings.button_url; }
  if (settings.button_label && !settings.btn_text) { settings.btn_text = settings.button_label; delete settings.button_label; }
  if (settings.button_text && !settings.btn_text) { settings.btn_text = settings.button_text; delete settings.button_text; }
  if (settings.image_link && !settings.img_action) { settings.img_action = settings.image_link; delete settings.image_link; }

  // Ensure width has a default
  if (!settings.width) settings.width = "12";

  return { type: blockType, settings };
}

// ── Intent classification ──

type SectionIntent = 'hero' | 'stats' | 'feature-grid' | 'icon-card-row' | 'program-cards' | 'testimonial-band' | 'cta-band' | 'content-media-split' | 'footer' | 'heading-separator' | 'faq' | 'content';

/** Map upstream extractor intent (snake_case) to edge function intent (kebab-case) */
function mapUpstreamIntent(upstreamIntent: string | undefined): SectionIntent | null {
  if (!upstreamIntent) return null;
  const map: Record<string, SectionIntent> = {
    'hero': 'hero',
    'stats': 'stats',
    'feature_grid': 'feature-grid',
    'icon_card_row': 'icon-card-row',
    'program_cards': 'program-cards',
    'testimonial_band': 'testimonial-band',
    'cta_band': 'cta-band',
    'content_media_split': 'content-media-split',
    'heading_divider': 'heading-separator',
    'faq': 'faq',
    'footer_like': 'footer',
    'unknown': 'content',
  };
  return map[upstreamIntent] || null;
}

/** Build richness requirements string based on intent + section flags + media intent */
function buildRichnessGuard(intent: SectionIntent, section: any): string {
  const lines: string[] = ['## RICHNESS REQUIREMENTS (MANDATORY)'];

  switch (intent) {
    case 'stats':
      lines.push('- You MUST create one feature block per stat item with the numeric VALUE in an <h4> and the LABEL in a <p>.');
      lines.push('- Heading-only output is INVALID for stats. Each block must have value + label.');
      lines.push(`- Expected block count: ${section.items?.length || 4} stat blocks.`);
      break;
    case 'program-cards':
      lines.push('- You MUST create one feature/card block per program/course item.');
      lines.push('- Each block MUST include: title, description, and price (if available).');
      lines.push('- Do NOT collapse multiple programs into one text block.');
      lines.push(`- Expected block count: 1 heading block + ${section.items?.length || 3} item blocks.`);
      break;
    case 'testimonial-band':
      lines.push('- You MUST create one text/feature block per testimonial.');
      lines.push('- Each block MUST include the quote text (in italics) and the person\'s name.');
      lines.push('- Do NOT output a heading-only testimonial section.');
      lines.push(`- Expected block count: 1 heading block + ${section.items?.length || 3} testimonial blocks.`);
      break;
    case 'cta-band':
      lines.push('- You MUST include a heading + body text block with use_btn="true" and btn_text.');
      lines.push('- If the source has CTA text/action, preserve it.');
      if (section.secondaryCtaText) {
        lines.push(`- Source has a secondary CTA: "${section.secondaryCtaText}". Include it as a styled link below the primary CTA.`);
      }
      break;
    case 'icon-card-row':
      lines.push('- You MUST create one feature block per icon card item.');
      lines.push('- Each block MUST include: title in <h4> and description in <p>.');
      lines.push('- Set background_color, box_shadow="medium", border_radius="12" on each card block.');
      lines.push('- Set hide_image="true" since icons are represented inline.');
      lines.push('- Do NOT collapse multiple icon cards into one text block.');
      lines.push(`- Expected block count: 1 heading block + ${section.items?.length || 3} card blocks.`);
      break;
    case 'faq':
      lines.push('- IMPORTANT: FAQ MUST only be generated if the source has real Q&A content.');
      lines.push('- If the source has no clear questions and answers, return {"operations":[],"cssOverrides":""}.');
      lines.push('- Use accordion blocks if available. Otherwise use text blocks with <h4>Question?</h4><p>Answer</p> pattern.');
      lines.push('- Each Q&A MUST have a question (ending in ?) and an answer body.');
      if (section.items?.length) {
        lines.push(`- Expected: ${section.items.length} Q&A items. Use ALL of them.`);
      } else {
        lines.push('- WARNING: No Q&A items extracted. If you cannot produce real Q&A content from the source, return empty operations.');
      }
      break;
    case 'content-media-split':
      lines.push('- Create a text block (width "5"-"6") with heading, body, and checklist/bullets if present.');
      lines.push('- Create an image block (width "5"-"6") for the visual side.');
      if (section.hasChecklist) {
        lines.push('- Source has checklist items. Preserve them as <ul><li>✓ Item</li></ul>, NOT as a plain paragraph.');
      }
      if (section.secondaryCtaText) {
        lines.push(`- Source has a secondary CTA: "${section.secondaryCtaText}". Include as styled link.`);
      }
      break;
    case 'feature-grid':
      lines.push('- Create one feature block per item. Include title + description in each.');
      lines.push(`- Expected block count: 1 heading block + ${section.items?.length || 3} feature blocks.`);
      break;
    case 'heading-separator':
      lines.push('- A single text block with the heading is acceptable ONLY for true dividers.');
      break;
    default:
      lines.push('- Include all meaningful content from the source. Do not produce thin/placeholder blocks.');
  }

  // ── Media intent instructions ──
  const mediaIntent = section.mediaIntent || 'no_media';
  const imageTargets: any[] = section.imageTargets || [];

  if (mediaIntent !== 'no_media' && imageTargets.length > 0) {
    lines.push('');
    lines.push('## MEDIA PLACEMENT (MANDATORY when images are available)');

    if (mediaIntent === 'background_image') {
      const bgTarget = imageTargets.find((t: any) => t.role === 'hero_bg' || t.role === 'decorative');
      if (bgTarget?.url) {
        lines.push(`- Set section settings: bg_type="image", bg_image="${bgTarget.url}"`);
        lines.push('- Do NOT ignore this image. The source has a background image and the output MUST too.');
      }
    }

    if (mediaIntent === 'foreground_image') {
      const fgTarget = imageTargets.find((t: any) => t.role === 'content_image' || t.role === 'hero_fg');
      if (fgTarget?.url) {
        lines.push(`- Include an "image" block with settings.image="${fgTarget.url}" and an appropriate image_alt.`);
      }
    }

    if (mediaIntent === 'repeated_card_images') {
      const cardTargets = imageTargets.filter((t: any) => t.role === 'card_image');
      if (cardTargets.length > 0) {
        lines.push('- Each repeated feature/card block that has a matching image MUST set settings.image to the URL.');
        lines.push('- Do NOT set hide_image="true" on blocks with images.');
        for (const ct of cardTargets) {
          if (ct.url && ct.itemIndex !== undefined) {
            lines.push(`  - Item ${ct.itemIndex}: image="${ct.url}"`);
          }
        }
      }
    }

    if (mediaIntent === 'decorative_image') {
      const decTarget = imageTargets[0];
      if (decTarget?.url) {
        lines.push(`- Optionally include an "image" block or set as section background: ${decTarget.url}`);
      }
    }
  }

  return lines.join('\n');
}

function classifySectionIntent(section: any): SectionIntent {
  const type = String(section?.type || '').toLowerCase();
  const heading = String(section?.heading || '').toLowerCase();
  const hasItems = Array.isArray(section?.items) && section.items.length > 0;
  const hasBody = typeof section?.body === 'string' && section.body.length > 20;
  const hasCta = typeof section?.ctaText === 'string' && section.ctaText.trim().length > 0;
  const hasStats = section?.hasStats === true;
  const hasTestimonials = section?.hasTestimonials === true;
  const hasPricing = section?.hasPricing === true;

  if (type === 'hero') return 'hero';
  if (hasTestimonials || type === 'testimonials' || heading.includes('testimonial') || heading.includes('what our') || heading.includes('reviews')) return 'testimonial-band';
  if (heading.includes('footer') || type === 'footer') return 'footer';
  if (hasStats || heading.includes('stat') || heading.includes('number') || heading.includes('impact') || heading.includes('result')) return 'stats';
  if (hasPricing || heading.includes('program') || heading.includes('course') || heading.includes('service')) return 'program-cards';
  if (section?.hasIcons && hasItems) return 'icon-card-row';
  if ((type === 'cta' || heading.includes('ready to') || heading.includes('get started') || heading.includes('sign up') || heading.includes('stand out')) && !hasItems) return 'cta-band';
  if (type === 'features' || heading.includes('feature')) return 'feature-grid';
  if (hasItems && !hasCta) return 'feature-grid';
  if (type === 'content' && !hasBody && !hasItems && !hasCta) return 'heading-separator';
  if (section?.hasChecklist || section?.image || heading.includes('about') || heading.includes('elevated')) return 'content-media-split';
  if (hasCta && !hasItems) return 'cta-band';
  return 'content';
}

// (Fallback functions removed — AI must always produce real sections)

// ── Helpers ──

function findSectionSourceContext(sourceFiles: SourceFiles, section: any): string {
  const keywords = [section.type, section.heading].map(s => String(s || "").toLowerCase()).filter(Boolean);
  const allFiles = { ...sourceFiles.components, ...sourceFiles.pages };
  const snippets: string[] = [];

  for (const [path, content] of Object.entries(allFiles || {})) {
    const lower = path.toLowerCase() + " " + (content || "").toLowerCase();
    if (keywords.some(kw => kw && lower.includes(kw))) {
      snippets.push(`### ${path}\n\`\`\`tsx\n${trimText(stripImports(content), 1200)}\n\`\`\``);
    }
  }
  if (snippets.length === 0) {
    for (const [path, content] of Object.entries(sourceFiles.pages || {}).slice(0, 1)) {
      snippets.push(`### ${path}\n\`\`\`tsx\n${trimText(stripImports(content), 1200)}\n\`\`\``);
    }
  }
  return snippets.join("\n\n") || "No matching source code found.";
}

function buildRelevantSourceContext(sourceFiles: SourceFiles) {
  const snippets: string[] = [];
  const pages = Object.entries(sourceFiles.pages || {}).slice(0, 3);
  const components = Object.entries(sourceFiles.components || {})
    .sort(([a], [b]) => prioritizeFile(a) - prioritizeFile(b) || a.localeCompare(b))
    .slice(0, 8);
  for (const [path, content] of [...pages, ...components]) {
    snippets.push(`### ${path}\n\`\`\`tsx\n${trimText(stripImports(content), 1400)}\n\`\`\``);
  }
  return snippets.join("\n\n");
}

function prioritizeFile(path: string) {
  const lower = path.toLowerCase();
  if (lower.includes("hero")) return 0;
  if (lower.includes("stat")) return 1;
  if (lower.includes("course") || lower.includes("program")) return 2;
  if (lower.includes("testimonial")) return 3;
  if (lower.includes("cta")) return 4;
  if (lower.includes("footer")) return 5;
  return 10;
}

function trimText(value: unknown, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) return "N/A";
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}\n...`;
}

function stripImports(value: string) {
  return value.replace(/^import[^\n]*\n/gm, "").trim();
}

function normalizeIdArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value.replace(/'/g, '"'));
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return Array.from(value.matchAll(/[A-Za-z0-9_-]+/g), (m) => m[0]).filter(Boolean);
  }
}

function createNumericId() {
  return String(Math.floor(1000000000000 + Math.random() * 9000000000000));
}

function remapBlockIds(section: any) {
  if (!isPlainObject(section?.blocks)) return section;
  const remapped: Record<string, any> = {};
  const order = Array.isArray(section.block_order) ? section.block_order : Object.keys(section.blocks);
  const idMap = new Map<string, string>();

  for (const rawId of order.map((id: unknown) => String(id))) {
    const nextId = /^\d{13}$/.test(rawId) ? rawId : createNumericId();
    if (rawId in section.blocks) { remapped[nextId] = section.blocks[rawId]; idMap.set(rawId, nextId); }
  }
  for (const [rawId, block] of Object.entries(section.blocks)) {
    if (idMap.has(rawId)) continue;
    const nextId = /^\d{13}$/.test(rawId) ? rawId : createNumericId();
    remapped[nextId] = block; idMap.set(rawId, nextId);
  }

  section.blocks = remapped;
  section.block_order = Array.from(idMap.values());
  return section;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
