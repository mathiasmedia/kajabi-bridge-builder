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

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callAI(apiKey: string, model: string, system: string, user: any, maxTokens = 8192) {
  const res = await fetch(AI_URL, {
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

  if (!res.ok) {
    const status = res.status;
    const errText = await res.text();
    console.error(`AI error (${model}):`, status, errText);
    throw new Error(
      status === 429 ? "Rate limited — try again shortly"
      : status === 402 ? "Credits exhausted"
      : `AI gateway error: ${status}`
    );
  }

  const rawText = await res.text();
  if (!rawText?.trim()) throw new Error("AI returned empty response");

  let data;
  try { data = JSON.parse(rawText); } catch {
    throw new Error("AI returned invalid response");
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

  // Repair attempt
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

    const hasImages = referenceImages && referenceImages.length > 0;

    // Build user content with images if provided
    const baseContext = `Project name: ${name}
${referenceUrl ? `Reference URL: ${referenceUrl}` : ''}
${description ? `Design description: ${description}` : ''}
${!referenceUrl && !description && !hasImages ? 'Create a modern, professional business website template.' : ''}`;

    let imageContent: any = null;
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
    const cssPrompt = `You are a CSS expert for Kajabi themes. Given a design reference, generate a SINGLE comprehensive CSS override that achieves pixel-perfect visual matching.

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
- Spacing/padding patterns that match the reference

## RULES
- Use specific hex colors from the reference, not generic ones
- Include hover/transition states for interactive elements
- Make typography distinctive — match the reference's personality
- Include responsive adjustments where needed

Return ONLY valid JSON with "css" and "fonts" keys. No markdown.`;

    const structureUserContent = hasImages
      ? [{ type: "text", text: `${baseContext}\n\nGenerate the structure as JSON.` }, ...imageContent]
      : `${baseContext}\n\nGenerate the structure as JSON.`;

    const cssUserContent = hasImages
      ? [{ type: "text", text: `${baseContext}\n\nGenerate the CSS override as JSON.` }, ...imageContent]
      : `${baseContext}\n\nGenerate the CSS override as JSON.`;

    // Run BOTH passes in parallel
    console.log("Starting parallel generation: structure (flash-lite) + CSS (flash)");
    const [structureResult, cssResult] = await Promise.allSettled([
      callAI(LOVABLE_API_KEY, "google/gemini-2.5-flash-lite", structurePrompt, structureUserContent, 8192),
      callAI(LOVABLE_API_KEY, "google/gemini-2.5-flash", cssPrompt, cssUserContent, 4096),
    ]);

    // Parse structure (required)
    if (structureResult.status === "rejected") {
      return respond({ error: `Structure generation failed: ${structureResult.reason?.message || "Unknown"}` });
    }

    const structure = parseJSON(structureResult.value.content);
    if (!structure?.operations || !Array.isArray(structure.operations)) {
      const truncated = structureResult.value.finishReason === "length" || structureResult.value.finishReason === "MAX_TOKENS";
      return respond({
        error: truncated ? "Structure response truncated — try simpler description" : "Failed to parse structure",
        raw: structureResult.value.content.slice(0, 500),
      });
    }

    // Parse CSS (optional — gracefully degrade)
    let cssOverride = "";
    if (cssResult.status === "fulfilled") {
      const cssData = parseJSON(cssResult.value.content);
      if (cssData?.css) {
        cssOverride = cssData.css;
        // Update font info in extractedDesign if available
        if (cssData.fonts && structure.extractedDesign) {
          if (cssData.fonts.heading) structure.extractedDesign.headingFont = cssData.fonts.heading;
          if (cssData.fonts.body) structure.extractedDesign.bodyFont = cssData.fonts.body;
        }
      }
    } else {
      console.error("CSS pass failed (non-fatal):", cssResult.reason?.message);
    }

    // Merge: remove any existing addCssOverride from structure, add the quality one
    const operations = structure.operations.filter((op: any) => op.type !== "addCssOverride");
    if (cssOverride) {
      operations.push({
        type: "addCssOverride",
        css: cssOverride,
        label: "AI-generated CSS overrides (quality pass)",
      });
    }

    console.log(`Done: ${operations.length} operations (${structure.operations.length} structure + CSS)`);

    return respond({
      operations,
      extractedDesign: structure.extractedDesign || null,
    });
  } catch (e) {
    console.error("ai-generate error:", e);
    return respond({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});
