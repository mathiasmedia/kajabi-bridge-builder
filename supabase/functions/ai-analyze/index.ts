import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { referenceImages, referenceUrl, description } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a web design analyst. Given a screenshot of a webpage, analyze its visual structure and return a section-by-section breakdown.

For each section, describe:
1. A short name (e.g. "Hero", "Features Grid", "Testimonials")
2. The section type (hero, features, about, testimonials, cta, pricing, faq, gallery, stats, contact, footer-cta)
3. A detailed visual description including: background color (exact hex), text colors, layout (centered/left/split), number of columns/items, typography style, any special visual effects
4. ALL visible text content — headlines, subheadlines, body copy, button labels — reproduced VERBATIM
5. Key design details: border-radius, shadows, gradients, spacing feel (tight/medium/generous)

Return JSON:
{
  "brandAnalysis": {
    "primaryColor": "#hex",
    "secondaryColor": "#hex", 
    "accentColor": "#hex",
    "backgroundColor": "#hex",
    "textColor": "#hex",
    "headingFont": "closest Google Font match",
    "bodyFont": "closest Google Font match",
    "style": "minimal|bold|elegant|playful|corporate"
  },
  "sections": [
    {
      "id": "section-1",
      "name": "Hero",
      "type": "hero",
      "description": "Full-width dark blue (#1d3557) background, centered white text, gold (#e9c46a) accent CTA button...",
      "content": {
        "headline": "Exact headline text",
        "subheadline": "Exact subheadline",
        "bodyText": "Any body copy",
        "buttonText": "CTA label",
        "secondaryButtonText": "optional",
        "listItems": ["item 1", "item 2"],
        "stats": [{"value": "50+", "label": "Brands"}]
      },
      "visualDetails": {
        "backgroundColor": "#hex",
        "textColor": "#hex",
        "accentColor": "#hex",
        "layout": "centered|left-right|right-left",
        "columns": 1,
        "hasImage": false,
        "imageDescription": ""
      }
    }
  ]
}

IMPORTANT: 
- List sections in TOP-TO-BOTTOM order as they appear in the screenshot
- Extract EXACT text, don't paraphrase
- Be very specific about colors — use exact hex values you see
- Typically a page has 4-8 sections`;

    let userContent: any;
    const textPart = `${referenceUrl ? `Reference URL: ${referenceUrl}` : ''}
${description ? `Description: ${description}` : ''}

Analyze this design and return the section breakdown as JSON.`;

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

    if (!result?.sections || !Array.isArray(result.sections)) {
      return new Response(JSON.stringify({ error: "AI did not return valid section analysis", raw: content.slice(0, 500) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-analyze error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
