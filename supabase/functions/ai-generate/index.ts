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

    const systemPrompt = `You are a Kajabi theme builder AI. Given a reference design (URL, images, and/or description), generate a complete TransformationPlan that recreates the design as a Kajabi theme.

You must return valid JSON with this structure:
{
  "operations": [...],
  "extractedDesign": { "colors": [...], "headingFont": "...", "bodyFont": "..." }
}

OPERATION TYPES you can use:
- updateGlobalSetting: { type, key, value, label } — for global theme settings like colors, fonts
- addSection: { type, sectionId, section: { type: "section", settings: {...}, blocks: {...}, block_order: [...] }, label } — add a page section
- addBlock: { type, sectionId, blockId, block: { type, settings: {...} }, label }
- addCssOverride: { type, css, label } — custom CSS
- updateNavigation: { type, menuId: "main-menu", links: [{name, url}] }
- hideSection: { type, sectionId } — hide default sections you don't need

SECTION SETTINGS commonly used:
- background_color: hex color for section background
- padding_top, padding_bottom: spacing (e.g. "40px")
- max_width: container width

BLOCK TYPES: text, feature, cta, image, accordion, form, video
BLOCK SETTINGS: text (HTML string), btn_text, btn_action, width ("12" = full, "6" = half, "4" = third), img_src, background_color

Create a COMPLETE homepage with:
1. Header/navigation section
2. Hero section with headline, subheadline, and CTA button
3. Features/services section with 3-4 blocks
4. About/story section
5. Testimonials or social proof
6. CTA/contact section
7. Footer

Match the reference design's colors, typography feel, and overall aesthetic. Use realistic, professional copy that fits the brand.

IMPORTANT: Generate at least 20 operations for a complete page. Include a comprehensive addCssOverride with custom fonts, colors, and spacing to match the reference.`;

    // Build user message with multimodal content if images provided
    let userContent: any;
    const textPart = `Project name: ${name}
${referenceUrl ? `Reference URL: ${referenceUrl}` : ''}
${description ? `Design description: ${description}` : ''}
${!referenceUrl && !description ? 'Create a modern, professional business website template.' : ''}

Generate the complete transformation plan as JSON.`;

    if (referenceImages && referenceImages.length > 0) {
      userContent = [
        { type: "text", text: textPart },
        ...referenceImages.slice(0, 3).map((img: string) => ({
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
        model: "google/gemini-2.5-flash",
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

    // Strip markdown fences
    content = content.replace(/^```json\s*/im, "").replace(/^```\s*/im, "").replace(/```\s*$/im, "").trim();
    content = content.replace(/^'''json\s*/im, "").replace(/^'''\s*/im, "").replace(/'''\s*$/im, "").trim();

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
