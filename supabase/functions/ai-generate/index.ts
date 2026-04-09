import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  SECTION_SETTINGS_REFERENCE,
  BLOCK_TYPES_REFERENCE,
  SHARED_BLOCK_SETTINGS,
  KAJABI_HTML_STRUCTURE,
  KAJABI_ID_RULES,
  LAYOUT_RULES,
  OPERATION_TYPES,
  GLOBAL_SETTINGS_REFERENCE,
} from "../_shared/kajabi-reference.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const respond = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Generate a 13-digit numeric ID like Kajabi uses */
function kajabiId(): string {
  return String(Date.now()) + String(Math.floor(Math.random() * 100)).padStart(2, '0');
}

/** Check if an ID is already in valid Kajabi numeric format */
function isKajabiId(id: string): boolean {
  return /^\d{13,}$/.test(id);
}

/** Normalize all IDs in an addSection operation to 13-digit numeric format.
 *  Returns a map of oldId → newId for CSS fixup. */
function normalizeKajabiIds(op: any): Record<string, string> {
  const idMap: Record<string, string> = {};
  if (op.type !== "addSection") return idMap;

  const oldSectionId = op.sectionId;
  if (!isKajabiId(oldSectionId)) {
    const newId = kajabiId();
    idMap[oldSectionId] = newId;
    op.sectionId = newId;
  }
  const sectionId = op.sectionId;

  if (op.section?.blocks) {
    const oldBlocks = op.section.blocks;
    const oldOrder = op.section.block_order || Object.keys(oldBlocks);
    const newBlocks: Record<string, any> = {};
    const newOrder: string[] = [];

    oldOrder.forEach((oldId: string, idx: number) => {
      const newId = `${sectionId}_${idx}`;
      if (oldId !== newId) idMap[oldId] = newId;
      newBlocks[newId] = oldBlocks[oldId];
      newOrder.push(newId);
    });

    op.section.blocks = newBlocks;
    op.section.block_order = newOrder;
  }
  return idMap;
}

function normalizeSectionColumns(op: any) {
  if (op.type !== "addSection" || !op.section?.settings) return;
  op.section.settings.full_width = false;

  const blocks = op.section.blocks || {};
  const blockOrder = op.section.block_order || Object.keys(blocks);
  const orderedBlocks = blockOrder
    .map((id: string) => ({ id, block: blocks[id] }))
    .filter(({ block }: any) => block?.settings);

  const hasColumnBlocks = orderedBlocks.some(({ block }: any) => block.settings?.block_column);
  const nonFullWidth = orderedBlocks.filter(({ block }: any) => {
    const w = block.settings?.width;
    return w && w !== "12";
  });
  const hasSideBySideLayout = nonFullWidth.length >= 2;

  if (!hasColumnBlocks && !hasSideBySideLayout) return;

  op.section.settings.multiple_columns_on_desktop = "two";
  if (!op.section.settings.column_one_width) op.section.settings.column_one_width = "4";
  if (!op.section.settings.column_two_width) op.section.settings.column_two_width = "4";

  if (hasColumnBlocks) return;

  const imageBlocks = orderedBlocks.filter(({ block }: any) => block.type === "image");
  const contentBlocks = orderedBlocks.filter(({ block }: any) => block.type !== "image");

  if (imageBlocks.length === 1 && contentBlocks.length >= 1) {
    for (const { block } of contentBlocks) {
      block.settings.block_column = "first";
      block.settings.width = "12";
      if (block.type === "text" || block.type === "cta") {
        if (!block.settings.text_align) block.settings.text_align = "left";
        if (!block.settings.mobile_text_align) block.settings.mobile_text_align = "left";
      }
    }
    imageBlocks[0].block.settings.block_column = "second";
    imageBlocks[0].block.settings.width = "12";
    return;
  }

  const splitIndex = Math.ceil(nonFullWidth.length / 2);
  nonFullWidth.forEach(({ block }: any, index: number) => {
    block.settings.block_column = index < splitIndex ? "first" : "second";
    block.settings.width = "12";
    if ((block.type === "text" || block.type === "cta") && block.settings.block_column === "first") {
      if (!block.settings.text_align) block.settings.text_align = "left";
      if (!block.settings.mobile_text_align) block.settings.mobile_text_align = "left";
    }
  });
}

/** Sanitize block and section settings to match what Kajabi templates expect.
 *  Fixes missing defaults that cause broken HTML output (empty background-color, 
 *  missing border_style, broken box-shadow classes, excessive padding, etc.) */
function sanitizeBlockDefaults(op: any) {
  if (op.type !== "addSection" || !op.section) return;

  const settings = op.section.settings || {};
  // Remove slider-related settings that AI shouldn't generate
  const sliderKeys = ['slider_preset', 'desktop_chunk', 'mobile_chunk', 'autoplay', 'loop', 'effect'];
  for (const k of sliderKeys) delete settings[k];
  // Force full_width false — prevents flex:unset inline styles on blocks
  settings.full_width = false;

  // Validate multiple_columns_on_desktop — valid values: "no", "two", "three"
  const validColValues = ["no", "two", "three"];
  if (settings.multiple_columns_on_desktop && !validColValues.includes(settings.multiple_columns_on_desktop)) {
    settings.multiple_columns_on_desktop = "two";
  }

  // Ensure padding values are proper objects with defaults if set
  if (settings.padding_desktop && typeof settings.padding_desktop === "object") {
    const pd = settings.padding_desktop;
    if (!pd.left && pd.left !== 0) pd.left = 20;
    if (!pd.right && pd.right !== 0) pd.right = 20;
  }
  if (settings.padding_mobile && typeof settings.padding_mobile === "object") {
    const pm = settings.padding_mobile;
    if (!pm.left && pm.left !== 0) pm.left = 0;
    if (!pm.right && pm.right !== 0) pm.right = 0;
  }

  const blocks = op.section.blocks || {};
  for (const blockId of Object.keys(blocks)) {
    const block = blocks[blockId];
    if (!block?.settings) continue;
    const bs = block.settings;

    // Fix border_style — must be "none" if not set, otherwise Liquid renders "border: 4px  black"
    if (!bs.border_style) bs.border_style = "none";

    // Remove empty background_color — Liquid renders "background-color: ;" if empty string
    if (bs.background_color === "" || bs.background_color === undefined) {
      delete bs.background_color;
    }

    // Fix box_shadow — must be "none" if not set, otherwise class becomes "box-shadow-"
    if (!bs.box_shadow) bs.box_shadow = "none";

    // Remove explicit zero padding overrides — they cause "padding: 20px" then "padding-*: 0px"
    // which is wrong. Better to not set them at all and let Kajabi use defaults.
    const paddingKeys = ["padding_top", "padding_right", "padding_bottom", "padding_left",
                         "desktop_padding_top", "desktop_padding_right", "desktop_padding_bottom", "desktop_padding_left"];
    for (const pk of paddingKeys) {
      if (bs[pk] === "0px" || bs[pk] === "0" || bs[pk] === 0) {
        delete bs[pk];
      }
    }

    // Remove block_padding if it's "20px" (that's the default, no need to set it)
    if (bs.block_padding === "20px" || bs.block_padding === "30px") {
      delete bs.block_padding;
    }

    // Remove flush setting if not intentionally set
    if (bs.flush === "" || bs.flush === undefined) {
      delete bs.flush;
    }
  }
}

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

async function callLovableAI(apiKey: string, model: string, system: string, user: any, maxTokens = 8192) {
  const res = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  return handleAIResponse(res, model);
}

async function callOpenAI(apiKey: string, model: string, system: string, user: any, maxTokens = 4096) {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  return handleAIResponse(res, model);
}

async function handleAIResponse(res: Response, model: string) {
  if (!res.ok) {
    const status = res.status;
    const errText = await res.text();
    console.error(`AI error (${model}):`, status, errText.slice(0, 300));
    throw new Error(
      status === 429 ? "Rate limited — try again shortly"
      : status === 402 ? "Credits exhausted"
      : `AI error (${model}): ${status}`
    );
  }

  const rawText = await res.text();
  if (!rawText?.trim()) throw new Error(`${model} returned empty response`);

  let data;
  try { data = JSON.parse(rawText); } catch {
    throw new Error(`${model} returned invalid JSON`);
  }

  const content = data.choices?.[0]?.message?.content || "";
  const finishReason = data.choices?.[0]?.finish_reason || "";
  return { content, finishReason };
}

function parseJSON(content: string): any {
  let cleaned = content
    .replace(/^```(?:json)?\s*/im, "").replace(/```\s*$/im, "").trim();

  try {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  try {
    cleaned = cleaned.replace(/^[^{]*/, "");
    const open = (cleaned.match(/{/g) || []).length;
    const close = (cleaned.match(/}/g) || []).length;
    if (open > close) cleaned = cleaned.replace(/,\s*$/, "") + "}".repeat(open - close);
    cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
    return JSON.parse(cleaned);
  } catch { return null; }
}

// ── KAJABI MARKUP REFERENCE ─────────────────────────────────────────────
// This teaches the AI exactly how Kajabi renders HTML so CSS overrides target real selectors.
const KAJABI_MARKUP_REFERENCE = KAJABI_HTML_STRUCTURE;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { name, referenceUrl, referenceImages, description, visionDesign } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    const hasImages = referenceImages && referenceImages.length > 0;

    // If vision design was pre-extracted, include it as rich context
    const visionContext = visionDesign ? `
## PRE-EXTRACTED DESIGN (from screenshot analysis — use these EXACT values)
Style: ${visionDesign.overallStyle || 'N/A'}
Colors: ${JSON.stringify(visionDesign.colors || {})}
Typography: ${JSON.stringify(visionDesign.typography || {})}
Spacing: ${JSON.stringify(visionDesign.spacing || {})}
Effects: ${JSON.stringify(visionDesign.effects || {})}
Sections (top to bottom): ${JSON.stringify(visionDesign.sections || [])}
Text Content: ${JSON.stringify(visionDesign.textContent || {})}
` : '';

    const baseContext = `Project name: ${name}
${referenceUrl ? `Reference URL: ${referenceUrl}` : ''}
${description ? `Design description: ${description}` : ''}
${visionContext}
${!referenceUrl && !description && !hasImages && !visionDesign ? 'Create a modern, professional business website template.' : ''}`;

    let imageContent: any[] = [];
    if (hasImages) {
      imageContent = referenceImages.slice(0, 2).map((img: string) => ({
        type: "image_url",
        image_url: { url: img },
      }));
    }

    // ── PASS 1 (fast): Structure & content ──────────────────────
    const structurePrompt = `You are an expert Kajabi theme builder. Generate the page STRUCTURE — sections, blocks, content, and navigation.

${KAJABI_MARKUP_REFERENCE}

## OUTPUT FORMAT
Return valid JSON:
{
  "operations": [...],
  "extractedDesign": {
    "colors": ["#hex1", "#hex2"],
    "headingFont": "Font Name",
    "bodyFont": "Font Name",
    "backgroundColor": "#hex",
    "textColor": "#hex",
    "accentColor": "#hex",
    "buttonColor": "#hex",
    "buttonTextColor": "#hex"
  }
}

## OPERATION TYPES
- updateGlobalSetting: { type, key, value, label }
  Keys: primary_font, secondary_font, heading_color, body_color, accent_color, color_primary, color_body,
        btn_background_color, btn_text_color, btn_border_radius, btn_style, btn_size,
        dark_accent_color_primary, dark_accent_color_secondary, light_accent_color_primary, light_accent_color_secondary
- addSection: { type, sectionId, section: { type: "section", settings: {...}, blocks: {...}, block_order: [...] }, label }
  **CRITICAL**: The "blocks" object MUST contain the actual block definitions keyed by block ID.
  Each block: { type: "text"|"cta"|"image"|"feature"|"feature_icon"|"card"|"accordion"|etc, settings: {...} }
  Example addSection:
  {
    "type": "addSection",
    "sectionId": "1678886400000",
    "label": "Hero Section",
    "section": {
      "type": "section",
      "settings": { "background_color": "#1A2C47", "padding_desktop": { "top": 100, "right": 40, "bottom": 100, "left": 40 } },
      "block_order": ["1678886400000_0", "1678886400000_1"],
      "blocks": {
        "1678886400000_0": { "type": "text", "settings": { "width": "8", "text": "<h1>Welcome</h1><p>Your brand story starts here.</p>", "text_align": "center" } },
        "1678886400000_1": { "type": "cta", "settings": { "width": "4", "btn_text": "Get Started", "btn_action": "#", "btn_style": "solid" } }
      }
    }
  }
  DO NOT leave blocks as {} — every ID in block_order MUST have a corresponding entry in blocks.
- hideSection: { type, sectionId }

## KAJABI ID FORMAT — CRITICAL
- Section IDs MUST be 13-digit numeric strings (timestamp format), e.g. "1596053476562". NEVER use word-based IDs like "hero_section".
- Block IDs MUST follow the pattern "{sectionId}_{index}", e.g. "1596053476562_0", "1596053476562_1".
- Generate unique numeric IDs for each section using Date.now()-like values.

## CRITICAL RULES — READ CAREFULLY

### DO NOT generate header or footer sections. Skip them entirely.

### Section width — CRITICAL
- **NEVER set full_width: true.** Always use full_width: false. The only exception is a section whose sole purpose is a full-bleed background image with no text. If unsure, use false.

### Background Colors — BE VERY CAREFUL
- Do NOT set background_color on sections UNLESS you are intentionally creating a dark/colored section (e.g. a hero with dark overlay, a dark CTA section).
- Setting background_color causes Kajabi to automatically change text color:
  - Dark background_color → text becomes white/light → invisible if section is actually white
  - Light background_color → text becomes dark → may clash
- If you want a normal white/light section, set bg_type to "none" and OMIT background_color entirely.
- NEVER use low-opacity or barely-visible section background colors like faint RGBA washes. Either use a clearly visible solid/opaque background, or no section background at all.
- Only use background_color for sections that should genuinely have a colored/dark background.

### Text Contrast
- Body text on light sections must be dark and readable.
- NEVER use very light, washed-out, low-contrast, or near-white paragraph text on a light background.
- If a section background is light or absent, body text should be a strong dark neutral.

### Section Structure — Group related content together
- A heading that introduces content below it (e.g. "Is Your Brand Holding You Back?" above 3 feature cards) must be in the SAME section as the cards — NOT a separate section.
- Don't create single-block sections for headings that belong with adjacent content.
- For heading + 3 cards layouts, use one section with:
  - heading/introduction block width "12"
  - 3 card/feature blocks width "4" each below it

### Multi-Column / Side-by-Side Layouts
- **CRITICAL: If ANY block in a section uses block_column ("first"/"second"/"third"), you MUST set multiple_columns_on_desktop = "two" (or "three" for 3 columns) on the section.** Without this, Kajabi ignores block_column and stacks everything vertically.
- Kajabi supports desktop columns using REAL section settings:
  - multiple_columns_on_desktop: "no" | "two" | "three"
  - column_one_width, column_two_width, column_three_width
  - multiple_column_gap
- Kajabi also supports REAL block placement using block settings:
  - block_column: "first" | "second" | "third"
- For a split content/image section like "Your Brand, Elevated":
  - section.settings.multiple_columns_on_desktop = "two" (REQUIRED!)
  - section.settings.column_one_width = "4"
  - section.settings.column_two_width = "4"
  - section.settings.full_width = false
  - text/intro block width = "12", block_column = "first", text_align = "left", mobile_text_align = "left"
  - CTA block width = "12", block_column = "first", text_align = "left", mobile_text_align = "left"
  - image block width = "12", block_column = "second"
- For card rows under a centered heading, do NOT use desktop multi-column section settings unless needed; keep the heading block width "12" and the cards width "4" each in the same section.

### Block Width
- Width is "1" to "12" (Bootstrap grid) — controls how many of 12 columns the block occupies
- Blocks in the same section share the same .row — their widths determine layout
- For 3 equal cards in a section: each block width "4"
- For full-width text: width "12"
- For 2-column layout: use "6" + "6", or "5" + "7", etc.

${SECTION_SETTINGS_REFERENCE}

${BLOCK_TYPES_REFERENCE}

${SHARED_BLOCK_SETTINGS}

## ADDITIONAL RULES
- Use EXACT TEXT from reference if visible
- Use accurate hex colors from the design
- Match vertical order of content precisely
- Generate 8-20 operations for a full page (fewer sections, more content per section)
- Section type is ALWAYS "section" (never "hero", "text_column", etc.)
- Do NOT include addCssOverride — handled separately
- Feature blocks are for icon+text cards. Text blocks are for headings/paragraphs.
- Include padding_desktop and padding_mobile in section settings

Return ONLY valid JSON. No markdown.`;

    // ── PASS 2 (quality): CSS & visual polish ───────────────────
    const cssPrompt = `You are a CSS expert for Kajabi themes. Generate a SINGLE comprehensive CSS override for pixel-perfect visual matching.

${KAJABI_MARKUP_REFERENCE}

Return valid JSON:
{
  "css": "... complete CSS string ...",
  "fonts": { "heading": "Font Name", "body": "Font Name" }
}

## CSS MUST INCLUDE
- @import for matching Google Fonts
- :root CSS variables for the color palette
- Typography hierarchy (h1-h4 sizes, weights, letter-spacing, line-height)
- Button styling targeting \`.btn\` class (colors, border-radius, padding, hover transitions)
- Section-specific backgrounds via \`#section-{sectionId} .section__overlay\`
- Feature styling via \`.feature\`, \`.feature__image\`, \`.feature__text\`
- Container and responsive padding via \`.container\`, \`.sizer\`
- Any gradients, shadows, or special effects

## CSS SELECTOR RULES
- NEVER use made-up classes like .hero__heading, .text-column__heading, .feature-block
- ALWAYS use the real Kajabi classes: .section, .sizer, .container, .row, .block, .btn
- Target specific sections: #section-{sectionId} .sizer { ... }
- Target block types: .block-type--text, .block-type--feature, .block-type--image
- Target features: .feature, .feature__text, .feature__image
- Typography in blocks: .block h1, .block h2, .block h3, .block p
- Buttons: .btn, .btn--solid, .btn--outline, .btn--small, .btn--medium, .btn--large

## RULES
- Use specific hex colors from the design
- Include hover/transition states for buttons and links
- Make typography distinctive and matching the reference
- Include responsive @media adjustments
- Match spacing/padding patterns from the design

Return ONLY valid JSON. No markdown.`;

    // ── PASS 3 (vision — OpenAI): Precise design extraction ────
    const visionPrompt = `You are a design analyst. Analyze the provided screenshot with extreme precision and extract a detailed design specification.

Return valid JSON:
{
  "colors": {
    "background": "#hex",
    "surface": "#hex",
    "primary": "#hex",
    "accent": "#hex",
    "text": "#hex",
    "textSecondary": "#hex",
    "buttonBg": "#hex",
    "buttonText": "#hex",
    "border": "#hex"
  },
  "typography": {
    "headingFont": "closest Google Font match",
    "bodyFont": "closest Google Font match",
    "h1Size": "px value",
    "h2Size": "px value",
    "bodySize": "px value",
    "headingWeight": "number",
    "bodyWeight": "number",
    "letterSpacing": "em value",
    "lineHeight": "number"
  },
  "spacing": {
    "sectionPadding": "px value",
    "containerMaxWidth": "px value",
    "elementGap": "px value"
  },
  "effects": {
    "borderRadius": "px value",
    "shadows": "CSS shadow or 'none'",
    "gradients": ["CSS gradient strings if any"]
  },
  "sections": ["list of section names from top to bottom"],
  "textContent": {
    "headline": "exact headline text",
    "subheadline": "exact subheadline text",
    "navItems": ["nav item names"],
    "buttonLabels": ["button text"]
  }
}

Be EXTREMELY precise with colors — use exact hex values, not approximations.
Return ONLY valid JSON. No markdown.`;

    // Build user content for each pass
    const structureUser = hasImages
      ? [{ type: "text", text: `${baseContext}\n\nGenerate the structure as JSON.` }, ...imageContent]
      : `${baseContext}\n\nGenerate the structure as JSON.`;

    const cssUser = hasImages
      ? [{ type: "text", text: `${baseContext}\n\nGenerate the CSS override as JSON.` }, ...imageContent]
      : `${baseContext}\n\nGenerate the CSS override as JSON.`;

    // Launch all passes in parallel
    const passes: Promise<{ content: string; finishReason: string }>[] = [
      callLovableAI(LOVABLE_API_KEY, "google/gemini-2.5-flash", structurePrompt, structureUser, 16384),
      callLovableAI(LOVABLE_API_KEY, "google/gemini-2.5-flash", cssPrompt, cssUser, 4096),
    ];

    // Pass 3: OpenAI vision — only when we have images AND an API key
    const useOpenAIVision = hasImages && OPENAI_API_KEY;
    if (useOpenAIVision) {
      const visionUser = [
        { type: "text", text: `${baseContext}\n\nAnalyze the screenshot and extract the design specification as JSON.` },
        ...imageContent,
      ];
      passes.push(callOpenAI(OPENAI_API_KEY, "gpt-4o", visionPrompt, visionUser, 4096));
      console.log("3-pass parallel: structure (flash-lite) + CSS (flash) + vision (GPT-4o)");
    } else {
      console.log("2-pass parallel: structure (flash-lite) + CSS (flash)" + (hasImages && !OPENAI_API_KEY ? " [no OpenAI key, skipping vision]" : ""));
    }

    const results = await Promise.allSettled(passes);

    // ── Parse PASS 1: Structure (required) ──────────────────────
    if (results[0].status === "rejected") {
      return respond({ error: `Structure generation failed: ${results[0].reason?.message || "Unknown"}` });
    }

    const structure = parseJSON(results[0].value.content);
    if (!structure?.operations || !Array.isArray(structure.operations)) {
      const truncated = results[0].value.finishReason === "length" || results[0].value.finishReason === "MAX_TOKENS";
      return respond({
        error: truncated ? "Structure response truncated — try simpler description" : "Failed to parse structure",
        raw: results[0].value.content.slice(0, 500),
      });
    }

    // ── Parse PASS 2: CSS (optional, graceful degradation) ──────
    let cssOverride = "";
    let cssFonts: { heading?: string; body?: string } = {};
    if (results[1].status === "fulfilled") {
      const cssData = parseJSON(results[1].value.content);
      if (cssData?.css) {
        cssOverride = cssData.css;
        cssFonts = cssData.fonts || {};
      }
    } else {
      console.error("CSS pass failed (non-fatal):", results[1].reason?.message);
    }

    // ── Parse PASS 3: Vision analysis (optional) ────────────────
    let visionData: any = null;
    if (useOpenAIVision && results[2]?.status === "fulfilled") {
      visionData = parseJSON(results[2].value.content);
      if (visionData) {
        console.log("Vision analysis succeeded — applying corrections");
      }
    } else if (useOpenAIVision && results[2]?.status === "rejected") {
      console.error("Vision pass failed (non-fatal):", results[2].reason?.message);
    }

    // ── Merge results ───────────────────────────────────────────
    // First, hide all default pro-template sections so only new ones show
    const DEFAULT_SECTION_IDS = [
      "1575400116835", "1575400209498", "1575400330498",
      "1575400347498", "1575400358498", "1575400367498",
    ];
    const hideOps = DEFAULT_SECTION_IDS.map(id => ({
      type: "hideSection",
      sectionId: id,
      label: `Hide default section ${id}`,
    }));

    let operations = [
      ...hideOps,
      ...structure.operations.filter((op: any) => op.type !== "addCssOverride"),
    ];
    let extractedDesign = structure.extractedDesign || {};

    // If vision data is available, use it to enhance the CSS and design info
    if (visionData) {
      if (visionData.colors) {
        extractedDesign = {
          ...extractedDesign,
          backgroundColor: visionData.colors.background || extractedDesign.backgroundColor,
          textColor: visionData.colors.text || extractedDesign.textColor,
          accentColor: visionData.colors.primary || extractedDesign.accentColor,
          buttonColor: visionData.colors.buttonBg || extractedDesign.buttonColor,
          buttonTextColor: visionData.colors.buttonText || extractedDesign.buttonTextColor,
          colors: Object.values(visionData.colors).filter(Boolean),
        };
      }
      if (visionData.typography) {
        extractedDesign.headingFont = visionData.typography.headingFont || cssFonts.heading || extractedDesign.headingFont;
        extractedDesign.bodyFont = visionData.typography.bodyFont || cssFonts.body || extractedDesign.bodyFont;
      }

      // Inject vision-derived corrections into CSS
      if (cssOverride && visionData.colors) {
        const c = visionData.colors;
        const visionVars = [
          c.background ? `--color-bg: ${c.background};` : '',
          c.surface ? `--color-surface: ${c.surface};` : '',
          c.primary ? `--color-primary: ${c.primary};` : '',
          c.accent ? `--color-accent: ${c.accent};` : '',
          c.text ? `--color-text: ${c.text};` : '',
          c.textSecondary ? `--color-text-secondary: ${c.textSecondary};` : '',
          c.buttonBg ? `--color-button-bg: ${c.buttonBg};` : '',
          c.buttonText ? `--color-button-text: ${c.buttonText};` : '',
        ].filter(Boolean).join('\n  ');

        if (visionVars) {
          cssOverride = `/* Vision-corrected colors */\n:root {\n  ${visionVars}\n}\n\n${cssOverride}`;
        }
      }

      // If vision extracted specific text content, try to correct section text
      if (visionData.textContent?.headline) {
        for (const op of operations) {
          if (op.type === "addSection" && op.label?.toLowerCase().includes("hero")) {
            const blocks = op.section?.blocks;
            if (blocks) {
              for (const blockId of Object.keys(blocks)) {
                const block = blocks[blockId];
                if (block.type === "text" && block.settings?.text?.includes("<h1")) {
                  block.settings.text = block.settings.text.replace(
                    /<h1[^>]*>.*?<\/h1>/i,
                    `<h1>${visionData.textContent.headline}</h1>`
                  );
                }
              }
            }
          }
        }
      }
    } else {
      if (cssFonts.heading) extractedDesign.headingFont = cssFonts.heading;
      if (cssFonts.body) extractedDesign.bodyFont = cssFonts.body;
    }

    // Post-process: validate blocks are populated, sanitize, normalize IDs and columns
    const allIdMaps: Record<string, string> = {};
    for (const op of operations) {
      // CRITICAL: Warn and skip addSection with empty blocks
      if (op.type === "addSection" && op.section) {
        const blocks = op.section.blocks || {};
        const blockOrder = op.section.block_order || [];
        if (blockOrder.length > 0 && Object.keys(blocks).length === 0) {
          console.error(`[WARN] addSection "${op.label}" has block_order but EMPTY blocks object — section will be blank`);
        }
      }
      sanitizeBlockDefaults(op);
      const idMap = normalizeKajabiIds(op);
      Object.assign(allIdMaps, idMap);
      normalizeSectionColumns(op);
    }

    // Add the final CSS override (fix any word-based IDs in CSS)
    if (cssOverride) {
      let fixedCss = cssOverride;
      for (const [oldId, newId] of Object.entries(allIdMaps)) {
        fixedCss = fixedCss.replaceAll(oldId, newId);
      }
      operations.push({
        type: "addCssOverride",
        css: fixedCss,
        label: "AI-generated CSS overrides" + (visionData ? " (vision-enhanced)" : ""),
      });
    }
    // Also fix CSS in any existing addCssOverride ops
    if (Object.keys(allIdMaps).length > 0) {
      for (const op of operations) {
        if (op.type === "addCssOverride" && op.css) {
          for (const [oldId, newId] of Object.entries(allIdMaps)) {
            op.css = op.css.replaceAll(oldId, newId);
          }
        }
      }
    }

    const passCount = 1 + (cssOverride ? 1 : 0) + (visionData ? 1 : 0);
    console.log(`Done: ${operations.length} operations from ${passCount} passes`);

    return respond({
      operations,
      extractedDesign,
    });
  } catch (e) {
    console.error("ai-generate error:", e);
    return respond({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});
