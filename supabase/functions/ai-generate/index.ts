import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const respond = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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
const KAJABI_MARKUP_REFERENCE = `
## KAJABI HTML STRUCTURE (how the theme actually renders)

All sections use a generic section.liquid template. The rendered HTML structure is:

\`\`\`html
<div id="section-{sectionId}" class="kajabi-section" data-section-type="section">
  <!-- section_styles.liquid generates: -->
  <style>
    #section-{sectionId} .section__overlay { background-color: {background_color}; }
    #section-{sectionId} .sizer { padding-top: {top}px; padding-bottom: {bottom}px; }
  </style>

  <section class="section background-{scheme}">
    <div class="sizer">
      <div class="section__overlay"></div>
      <div class="container">
        <div class="row align-items-{vertical} justify-content-{horizontal}">
          <!-- Each block renders here -->
        </div>
      </div>
    </div>
  </section>
</div>
\`\`\`

### BLOCK HTML (block.liquid wraps each block):
\`\`\`html
<div id="block-{blockId}" class="block-type--{type} text-{align} col-{width}">
  <div class="block box-shadow-{shadow} background-{scheme}">
    <!-- block content from block_{type}.liquid -->
  </div>
</div>
\`\`\`

### BLOCK TYPE: text (block_text.liquid)
\`\`\`html
<div class="text-element">{{ block.settings.text }}</div>
<!-- If use_btn is true, includes block_cta.liquid -->
\`\`\`

### BLOCK TYPE: feature (block_feature.liquid)
\`\`\`html
<div class="feature">
  <img class="feature__image" src="..." />
  <div class="feature__text">{{ block.settings.text }}</div>
  <!-- If use_btn, includes block_cta.liquid -->
</div>
\`\`\`

### BLOCK TYPE: feature_icon (block_feature_icon.liquid)
\`\`\`html
<div class="feature">
  <div class="feature-icon">{SVG icon}</div>
  <div class="feature__text">{{ block.settings.text }}</div>
</div>
\`\`\`

### BLOCK TYPE: image (block_image.liquid)
\`\`\`html
<div class="image">
  <img class="image__image" src="..." />
  <div class="image__overlay"><!-- overlay content --></div>
</div>
\`\`\`

### BLOCK TYPE: cta (block_cta.liquid — also included by text/feature when use_btn=true)
\`\`\`html
<a class="btn btn--{size} btn--{width} btn--{style}" href="{url}" 
   style="background-color: {bg}; color: {text}; border-radius: {radius};">
  {button text}
</a>
\`\`\`

## CSS TARGETING RULES
- Target sections by ID: \`#section-{sectionId} .sizer { ... }\`
- Target blocks by ID: \`#block-{blockId} .block { ... }\`
- Target block types within a section: \`#section-{sectionId} .block-type--text { ... }\`
- Target features: \`#section-{sectionId} .feature { ... }\`
- Target images: \`#section-{sectionId} .image { ... }\`
- Target buttons: \`.btn { ... }\` or \`#section-{sectionId} .btn { ... }\`
- The overlay (\`.section__overlay\`) renders the background_color. To override: \`#section-{sectionId} .section__overlay { background-color: ...; }\`
- Section padding is on \`.sizer\`: \`#section-{sectionId} .sizer { padding-top: ...; padding-bottom: ...; }\`

## IMPORTANT DETAILS
- Section \`background_color\` is applied via the \`.section__overlay\` element (absolute positioned overlay)
- Block \`background_color\` is applied as inline \`background-color\` on the \`.block\` div
- Block \`width\` is set via \`col-{n}\` class (1-12 grid) on the outer wrapper
- Block \`text_align\` is set via \`text-{left|center|right}\` class
- Button colors come from global settings but can be overridden per-block via \`btn_background_color\` and \`btn_text_color\`
- The header section uses \`header.liquid\` (not section.liquid) with class \`.header\`
- The footer uses \`footer.liquid\` / \`footer_pro.liquid\`
`;

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
- addSection: { type, sectionId, section: { type: "section", settings, blocks, block_order }, label }
- hideSection: { type, sectionId }
- updateNavigation: { type, menuId: "main-menu", links: [{name, url}] }

## SECTION SETTINGS
All sections use type: "section". Available settings:
- background_color: hex color for section background (applied via .section__overlay)
- padding_desktop: { top: number, bottom: number, left: number, right: number }
- padding_mobile: { top: number, bottom: number, left: number, right: number }
- vertical: "top" | "center" | "bottom" | "stretch" (row vertical alignment)
- horizontal: "left" | "center" | "right" (row horizontal alignment)
- full_width: true/false
- full_height: true/false
- bg_type: "color" | "image" | "video"
- bg_image: URL for background image

## BLOCK TYPES & SETTINGS
All blocks go in section.blocks as { "block-id": { type, settings } } with section.block_order listing IDs.

### text block:
{ type: "text", settings: { text: "<h1>Heading</h1><p>Paragraph text</p>", width: "12", text_align: "center", use_btn: true/false, btn_text: "Click", btn_action: "#", btn_style: "solid", btn_background_color: "#hex", btn_text_color: "#hex" } }

### feature block:
{ type: "feature", settings: { text: "<h3>Title</h3><p>Description</p>", width: "4", text_align: "center", image: "", image_width: "80", hide_image: true, use_btn: false } }

### feature_icon block:
{ type: "feature_icon", settings: { text: "<h3>Title</h3><p>Description</p>", width: "4", text_align: "center", feature_icon_code: "<svg>...</svg>", feature_icon_color: "#hex", feature_icon_size: "50", use_btn: false } }

### image block:
{ type: "image", settings: { image: "https://placehold.co/800x400/hex1/hex2?text=...", width: "6", image_width: "", image_border_radius: "4" } }

### cta block:
{ type: "cta", settings: { btn_text: "Button Label", btn_action: "#", btn_style: "solid", btn_size: "medium", btn_width: "auto", btn_background_color: "#hex", btn_text_color: "#hex", btn_border_radius: "4px" } }

## RULES
- Use EXACT TEXT from reference if visible
- Use accurate hex colors from the design
- Match vertical order of content precisely
- Generate 15-25 operations for a full page
- Section type is ALWAYS "section" (never "hero", "text_column", etc.)
- Do NOT include addCssOverride — handled separately
- For dark backgrounds, set background_color in section settings
- Use block width (col-1 to col-12) for layout columns
- For multi-column layouts, use multiple blocks with width "4" or "6"
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

    // Add the final CSS override
    if (cssOverride) {
      operations.push({
        type: "addCssOverride",
        css: cssOverride,
        label: "AI-generated CSS overrides" + (visionData ? " (vision-enhanced)" : ""),
      });
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
