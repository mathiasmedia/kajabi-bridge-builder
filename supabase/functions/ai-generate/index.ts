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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { name, referenceUrl, referenceImages, description } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are an expert web-to-Kajabi theme converter. Your #1 goal is PIXEL-PERFECT visual matching of the reference screenshot/design.

## ANALYSIS PHASE (do this mentally before generating)
Study the reference image in extreme detail:
1. **Colors**: Extract EXACT hex values for background, text, headings, accents, buttons, borders.
2. **Typography**: Identify the exact font families (or closest Google Font matches). Note sizes, weights, line-heights.
3. **Layout**: Count sections top-to-bottom. Note widths, padding, alignment.
4. **Content**: Read ALL visible text verbatim.
5. **Spacing**: Note the spacing rhythm.

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
- addSection: { type, sectionId, section: { type: "section", settings: {...}, blocks: {...}, block_order: [...] }, label }
- addCssOverride: { type, css, label }
- hideSection: { type, sectionId }
- updateNavigation: { type, menuId: "main-menu", links: [{name, url}] }

## BLOCK TYPES
- text: { text: "<h1>...</h1>" }
- feature: { text: "<h3>Title</h3><p>desc</p>", width: "4"|"6"|"12" }
- cta: { btn_text: "Label", btn_action: "#", btn_style: "primary"|"secondary" }
- image: { img_src: "https://placehold.co/800x400/hex1/hex2?text=...", width: "12"|"6" }

## CRITICAL RULES
1. Use EXACT TEXT from the screenshot
2. Use EXACT hex colors from the image
3. Use addCssOverride extensively for fonts, colors, spacing, buttons
4. Generate 20-35 operations for a faithful reproduction
5. Match the VERTICAL ORDER of content exactly
6. For dark backgrounds, set text_color in section settings AND CSS

Return ONLY valid JSON. No markdown fences.`;

    // Use faster model for text-only, pro for images
    const hasImages = referenceImages && referenceImages.length > 0;
    const model = hasImages ? "google/gemini-2.5-flash" : "google/gemini-2.5-flash";

    let userContent: any;
    const textPart = `Project name: ${name}
${referenceUrl ? `Reference URL: ${referenceUrl}` : ''}
${description ? `Design description: ${description}` : ''}
${!referenceUrl && !description && !hasImages ? 'Create a modern, professional business website template.' : ''}

Generate the complete transformation plan as JSON.`;

    if (hasImages) {
      userContent = [
        { type: "text", text: textPart },
        ...referenceImages.slice(0, 2).map((img: string) => ({
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
        max_tokens: 8192,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const errText = await response.text();
      console.error("AI gateway error:", status, errText);
      const msg = status === 429 ? "Rate limited — try again shortly"
        : status === 402 ? "Credits exhausted"
        : `AI gateway error: ${status}`;
      return respond({ error: msg });
    }

    // Safely read response body
    const rawText = await response.text();
    if (!rawText || rawText.trim().length === 0) {
      console.error("AI gateway returned empty body");
      return respond({ error: "AI returned an empty response — please try again" });
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.error("Failed to parse AI gateway response:", rawText.slice(0, 500));
      return respond({ error: "AI gateway returned invalid response — please try again" });
    }

    const finishReason = data.choices?.[0]?.finish_reason || "";
    let content = data.choices?.[0]?.message?.content || "";

    if (!content) {
      return respond({ error: "AI returned no content — please try again" });
    }

    // Strip markdown fences
    content = content.replace(/^```(?:json)?\s*/im, "").replace(/```\s*$/im, "").trim();

    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      result = JSON.parse(jsonMatch[0]);
    } catch {
      // Try to repair truncated JSON
      try {
        let cleaned = content.replace(/^[^{]*/, ""); // strip before first {
        // Balance braces
        const openBraces = (cleaned.match(/{/g) || []).length;
        const closeBraces = (cleaned.match(/}/g) || []).length;
        if (openBraces > closeBraces) {
          // Remove trailing comma and close
          cleaned = cleaned.replace(/,\s*$/, "") + "}".repeat(openBraces - closeBraces);
        }
        // Remove trailing commas before } or ]
        cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
        result = JSON.parse(cleaned);
      } catch {
        result = null;
      }
    }

    if (!result?.operations || !Array.isArray(result.operations)) {
      const truncated = finishReason === "length" || finishReason === "MAX_TOKENS";
      return respond({
        error: truncated
          ? "AI response was truncated — try a simpler description"
          : "AI did not return valid operations",
        raw: content.slice(0, 500),
      });
    }

    return respond({
      operations: result.operations,
      extractedDesign: result.extractedDesign || null,
    });
  } catch (e) {
    console.error("ai-generate error:", e);
    return respond({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});
