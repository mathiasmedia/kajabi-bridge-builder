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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { name, referenceUrl, referenceImages, description } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    const hasImages = referenceImages && referenceImages.length > 0;

    const baseContext = `Project name: ${name}
${referenceUrl ? `Reference URL: ${referenceUrl}` : ''}
${description ? `Design description: ${description}` : ''}
${!referenceUrl && !description && !hasImages ? 'Create a modern, professional business website template.' : ''}`;

    let imageContent: any[] = [];
    if (hasImages) {
      imageContent = referenceImages.slice(0, 2).map((img: string) => ({
        type: "image_url",
        image_url: { url: img },
      }));
    }

    // ── PASS 1 (fast): Structure & content ──────────────────────
    const structurePrompt = `You are an expert Kajabi theme builder. Generate the page STRUCTURE — sections, blocks, content, and navigation.

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
- addSection: { type, sectionId, section: { type: "section", settings: { background_color, padding_top, padding_bottom, text_color }, blocks: { "block-id": { type, settings } }, block_order: ["block-id"] }, label }
- hideSection: { type, sectionId }
- updateNavigation: { type, menuId: "main-menu", links: [{name, url}] }

## BLOCK TYPES
- text: { text: "<h1>...</h1>" or "<p>...</p>" }
- feature: { text: "<h3>Title</h3><p>desc</p>", width: "4"|"6"|"12" }
- cta: { btn_text: "Label", btn_action: "#", btn_style: "primary"|"secondary" }
- image: { img_src: "https://placehold.co/800x400/hex1/hex2?text=...", width: "12"|"6" }

## RULES
- Use EXACT TEXT from reference if visible
- Use accurate hex colors
- Match vertical order of content
- Generate 15-25 operations for structure
- Do NOT include addCssOverride — that will be handled separately
- For dark backgrounds set text_color in section settings

Return ONLY valid JSON. No markdown.`;

    // ── PASS 2 (quality): CSS & visual polish ───────────────────
    const cssPrompt = `You are a CSS expert for Kajabi themes. Generate a SINGLE comprehensive CSS override for pixel-perfect visual matching.

Return valid JSON:
{
  "css": "... complete CSS string ...",
  "fonts": { "heading": "Font Name", "body": "Font Name" }
}

## CSS MUST INCLUDE
- @import for matching Google Fonts
- :root CSS variables for the color palette
- Typography hierarchy (h1-h4 sizes, weights, letter-spacing, line-height)
- Button styling (colors, border-radius, padding, hover transitions)
- Section-specific backgrounds and text colors
- Container max-widths and responsive padding
- Any gradients, shadows, or special effects
- Spacing/padding patterns

## RULES
- Use specific hex colors, not generic ones
- Include hover/transition states
- Make typography distinctive
- Include responsive adjustments

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
      callLovableAI(LOVABLE_API_KEY, "google/gemini-2.5-flash-lite", structurePrompt, structureUser, 8192),
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
    let operations = structure.operations.filter((op: any) => op.type !== "addCssOverride");
    let extractedDesign = structure.extractedDesign || {};

    // If vision data is available, use it to enhance the CSS and design info
    if (visionData) {
      // Enhance extractedDesign with precise vision data
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
          // Prepend vision-derived variables to the CSS
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
      // No vision — still use CSS fonts
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
