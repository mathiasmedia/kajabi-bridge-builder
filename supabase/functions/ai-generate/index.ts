import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sectionDescription, brandAnalysis, sectionIndex, totalSections, existingOperations, referenceImages } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const isGlobalSetup = sectionIndex === 0;

    const systemPrompt = `You are a Kajabi theme section builder. You generate operations for ONE section of a page at a time.

${isGlobalSetup ? `## FIRST SECTION — INCLUDE GLOBAL SETUP
Since this is the first section, ALSO include:
1. Global font settings (updateGlobalSetting for heading + body fonts)
2. A comprehensive addCssOverride with @import for Google Fonts, color variables, typography hierarchy, button styles, and any global visual effects
3. Then the actual section operations

Use these global setting keys:
- typography_heading_font_family_encore
- typography_body_font_family_encore
- colors_primary, colors_accent, colors_body_text, colors_heading, colors_background
` : `## SUBSEQUENT SECTION
Only generate operations for this specific section. Do NOT include global settings or CSS overrides (those were set in section 1).
If this section needs section-specific CSS, add it as a SEPARATE addCssOverride with a unique label.`}

## BRAND CONTEXT
${JSON.stringify(brandAnalysis || {})}

## OPERATION TYPES
- updateGlobalSetting: { type, key, value, label }
- addSection: { type, sectionId, section: { type: "section", settings: { background_color, padding_top, padding_bottom, text_color, max_width }, blocks: { "block-id": { type, settings } }, block_order: ["block-id"] }, label }
- addBlock: { type, sectionId, blockId, block: { type, settings }, label }
- addCssOverride: { type, css, label }
- hideSection: { type, sectionId }

## BLOCK TYPES & SETTINGS
- text: { text: "<h1>...</h1>" or "<p>...</p>" } — use full HTML with inline styles
- feature: { text: "<h3>Title</h3><p>desc</p>", width: "4"|"6"|"12" }
- cta: { btn_text: "Label", btn_action: "#", btn_style: "primary"|"secondary" }
- image: { img_src: "https://placehold.co/800x400/hex1/hex2?text=...", width: "12"|"6" }

## RULES
- Use EXACT text from the section description — do not paraphrase
- Use EXACT hex colors specified in the visual details
- Generate a unique sectionId like "gen-section-{index}"
- For dark backgrounds, always set text_color in section settings
- Use placehold.co for any images with matching brand colors

Return JSON: { "operations": [...] }`;

    const userContent = `## Section ${sectionIndex + 1} of ${totalSections}
${JSON.stringify(sectionDescription, null, 2)}

${existingOperations ? `## Already generated operations count: ${existingOperations.length}` : ''}

Generate the operations for this section as JSON.`;

    let messages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    // Include reference image for first section to help with visual accuracy
    if (referenceImages?.length > 0 && isGlobalSetup) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: userContent },
          ...referenceImages.slice(0, 2).map((img: string) => ({
            type: "image_url",
            image_url: { url: img },
          })),
        ],
      });
    } else {
      messages.push({ role: "user", content: userContent });
    }

    // Use pro for first section (sets the tone), flash for subsequent
    const model = isGlobalSetup ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited — try again shortly" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";

    content = content.replace(/^```(?:json)?\s*/im, "").replace(/```\s*$/im, "").trim();
    content = content.replace(/^'''(?:json)?\s*/im, "").replace(/'''\s*$/im, "").trim();

    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      result = null;
    }

    if (!result?.operations || !Array.isArray(result.operations)) {
      const finishReason = data.choices?.[0]?.finish_reason || "";
      const truncated = finishReason === "length" || finishReason === "MAX_TOKENS";
      return new Response(JSON.stringify({
        error: truncated ? "AI response truncated" : "AI did not return valid operations",
        raw: content.slice(0, 500),
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ operations: result.operations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-generate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
