import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { name, referenceUrl, referenceImages, description } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are an expert web-to-Kajabi theme converter. Your #1 goal is PIXEL-PERFECT visual matching of the reference screenshot/design.

## ANALYSIS PHASE (do this mentally before generating)
Study the reference image in extreme detail:
1. **Colors**: Extract EXACT hex values for background, text, headings, accents, buttons, borders. Use specific hex codes, not generic ones.
2. **Typography**: Identify the exact font families (or closest Google Font matches). Note sizes, weights, line-heights, letter-spacing.
3. **Layout**: Count sections top-to-bottom. Note widths, padding, margins, alignment (centered vs left vs right).
4. **Visual details**: Border radius, shadows, gradients, overlays, opacity, image treatments.
5. **Content**: Read ALL visible text — headlines, subheadlines, body copy, button labels, nav items. Reproduce them exactly.
6. **Spacing**: Note the exact spacing rhythm — is it tight (20-30px), medium (40-60px), or generous (80-120px)?

## OUTPUT FORMAT
Return valid JSON:
{
  "operations": [...],
  "extractedDesign": {
    "colors": ["#hex1", "#hex2", ...],  // ALL colors found, primary first
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
  Keys: typography_heading_font_family_encore, typography_body_font_family_encore, colors_primary, colors_accent, colors_body_text, colors_heading, colors_background
- addSection: { type, sectionId, section: { type: "section", settings: { background_color, padding_top, padding_bottom, text_color, max_width }, blocks: { "block-id": { type, settings } }, block_order: ["block-id"] }, label }
- addBlock: { type, sectionId, blockId, block: { type, settings }, label }
- addCssOverride: { type, css, label }
- hideSection: { type, sectionId }
- updateNavigation: { type, menuId: "main-menu", links: [{name, url}] }

## BLOCK TYPES & SETTINGS
- text: { text: "<h1>...</h1>" or "<p>...</p>" } — use full HTML with inline styles for precise control
- feature: { text: "<h3>Title</h3><p>description</p>", width: "4"|"6"|"12" }
- cta: { btn_text: "Button Label", btn_action: "#", btn_style: "primary"|"secondary" }
- image: { img_src: "https://placehold.co/800x400/hex1/hex2?text=...", width: "12"|"6" }

## CRITICAL RULES FOR VISUAL ACCURACY
1. Use the EXACT TEXT from the screenshot — do not paraphrase or substitute
2. Use EXACT hex colors from the image — do not use generic colors like #333 or #f5f5f5 unless they actually match
3. The addCssOverride operation is your most powerful tool — use it extensively for:
   - Importing Google Fonts that match the reference
   - Setting exact font sizes, weights, line-heights
   - Custom spacing and padding
   - Button styles (border-radius, padding, hover states)
   - Section-specific background colors/gradients
   - Text colors per section
   - Box shadows, borders, overlays
4. Generate 25-40 operations for a faithful reproduction
5. For each visible section in the screenshot, create a corresponding addSection
6. Match the VERTICAL ORDER of content exactly as shown
7. For dark backgrounds, always set text_color in section settings AND in CSS overrides

## CSS OVERRIDE TEMPLATE
Your addCssOverride should include:
- @import for matching Google Fonts
- Root-level color variables
- Section-specific overrides (backgrounds, padding, text colors)
- Typography hierarchy (h1-h4 sizes, weights, letter-spacing)
- Button styling (colors, border-radius, padding, transitions)
- Container max-widths and padding
- Any gradients, shadows, or special effects seen in the reference`;

    let userContent: any;
    const textPart = `Project name: ${name}
${referenceUrl ? `Reference URL: ${referenceUrl}` : ''}
${description ? `Design description: ${description}` : ''}
${!referenceUrl && !description && (!referenceImages || referenceImages.length === 0) ? 'Create a modern, professional business website template.' : ''}

IMPORTANT: Study the reference image(s) extremely carefully. Extract exact colors, fonts, spacing, and content. The goal is to match the original as closely as possible within Kajabi's theme system.

Generate the complete transformation plan as JSON.`;

    if (referenceImages && referenceImages.length > 0) {
      userContent = [
        { type: "text", text: textPart },
        ...referenceImages.slice(0, 4).map((img: string) => ({
          type: "image_url",
          image_url: { url: img },
        })),
      ];
    } else {
      userContent = textPart;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again shortly" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted — add funds in Settings > Workspace > Usage" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const finishReason = data.choices?.[0]?.finish_reason || "";
    let content = data.choices?.[0]?.message?.content || "";

    // Strip markdown fences (various formats)
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
      const truncated = finishReason === "length" || finishReason === "MAX_TOKENS";
      return new Response(JSON.stringify({ 
        error: truncated ? "AI response was truncated — try a simpler description" : "AI did not return valid operations", 
        raw: content.slice(0, 500) 
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      operations: result.operations,
      extractedDesign: result.extractedDesign || null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-generate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
