import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, referenceUrl, context } = await req.json();

    if (!imageBase64) return respond({ error: "imageBase64 is required" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a precision design analyst. Analyze the provided webpage screenshot and extract a comprehensive, structured design specification.

Be EXTREMELY precise — use exact hex colors, not approximations. Identify every distinct section from top to bottom.

Return a JSON object using tool calling.`;

    const userContent = [
      {
        type: "text",
        text: `Analyze this webpage screenshot and extract every design detail.${context ? `\nContext: ${context}` : ""}${referenceUrl ? `\nSource URL: ${referenceUrl}` : ""}`,
      },
      {
        type: "image_url",
        image_url: { url: imageBase64 },
      },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
        tools: [
          {
            type: "function",
            function: {
              name: "extract_design",
              description: "Return the full design specification extracted from the screenshot.",
              parameters: {
                type: "object",
                properties: {
                  colors: {
                    type: "object",
                    properties: {
                      background: { type: "string", description: "Main page background hex color" },
                      surface: { type: "string", description: "Card/surface background hex" },
                      primary: { type: "string", description: "Primary brand color hex" },
                      accent: { type: "string", description: "Accent/highlight color hex" },
                      text: { type: "string", description: "Main text color hex" },
                      textSecondary: { type: "string", description: "Secondary/muted text color hex" },
                      buttonBg: { type: "string", description: "Primary button background hex" },
                      buttonText: { type: "string", description: "Primary button text color hex" },
                      border: { type: "string", description: "Border color hex" },
                      navBg: { type: "string", description: "Navigation background hex" },
                      footerBg: { type: "string", description: "Footer background hex" },
                    },
                    required: ["background", "primary", "text", "buttonBg", "buttonText"],
                  },
                  typography: {
                    type: "object",
                    properties: {
                      headingFont: { type: "string", description: "Closest Google Font match for headings" },
                      bodyFont: { type: "string", description: "Closest Google Font match for body text" },
                      h1Size: { type: "string", description: "H1 size in px" },
                      h2Size: { type: "string", description: "H2 size in px" },
                      h3Size: { type: "string", description: "H3 size in px" },
                      bodySize: { type: "string", description: "Body text size in px" },
                      headingWeight: { type: "string", description: "Heading font weight" },
                      bodyWeight: { type: "string", description: "Body font weight" },
                      letterSpacing: { type: "string", description: "Letter spacing for headings in em" },
                      lineHeight: { type: "string", description: "Body line height" },
                    },
                    required: ["headingFont", "bodyFont"],
                  },
                  spacing: {
                    type: "object",
                    properties: {
                      sectionPaddingY: { type: "string", description: "Typical vertical section padding in px" },
                      containerMaxWidth: { type: "string", description: "Max content width in px" },
                      elementGap: { type: "string", description: "Typical gap between elements in px" },
                    },
                  },
                  effects: {
                    type: "object",
                    properties: {
                      buttonBorderRadius: { type: "string", description: "Button border-radius in px" },
                      cardBorderRadius: { type: "string", description: "Card border-radius in px" },
                      shadows: { type: "string", description: "CSS box-shadow used or 'none'" },
                      gradients: {
                        type: "array",
                        items: { type: "string" },
                        description: "CSS gradient strings if any",
                      },
                    },
                  },
                  sections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Section name (e.g. Hero, Features, CTA)" },
                        bgColor: { type: "string", description: "Section background color hex" },
                        textColor: { type: "string", description: "Section text color hex" },
                        layout: { type: "string", description: "Layout description (e.g. centered text, 3-column grid, image+text split)" },
                        contentSummary: { type: "string", description: "Brief summary of the section content" },
                      },
                      required: ["name", "bgColor"],
                    },
                    description: "List of sections from top to bottom",
                  },
                  textContent: {
                    type: "object",
                    properties: {
                      headline: { type: "string", description: "Main headline text (exact)" },
                      subheadline: { type: "string", description: "Subheadline text (exact)" },
                      navItems: {
                        type: "array",
                        items: { type: "string" },
                        description: "Navigation menu item names",
                      },
                      buttonLabels: {
                        type: "array",
                        items: { type: "string" },
                        description: "All button label texts",
                      },
                      sectionHeadings: {
                        type: "array",
                        items: { type: "string" },
                        description: "All section headings in order",
                      },
                    },
                  },
                  overallStyle: {
                    type: "string",
                    description: "Brief style description (e.g. 'Modern minimalist with dark theme', 'Warm and elegant with serif typography')",
                  },
                },
                required: ["colors", "typography", "sections", "textContent", "overallStyle"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_design" } },
      }),
    });

    if (!res.ok) {
      const status = res.status;
      const errText = await res.text();
      console.error("Vision API error:", status, errText.slice(0, 300));
      const msg =
        status === 429 ? "Rate limited — try again shortly"
        : status === 402 ? "Credits exhausted"
        : `Vision API error: ${status}`;
      return respond({ error: msg });
    }

    const data = await res.json();

    // Extract from tool call response
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      let design;
      try {
        design = JSON.parse(toolCall.function.arguments);
      } catch {
        return respond({ error: "Failed to parse vision extraction result" });
      }
      console.log(`Vision extracted: ${design.sections?.length || 0} sections, style: ${design.overallStyle}`);
      return respond({ design });
    }

    // Fallback: try to parse from content
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const design = JSON.parse(jsonMatch[0]);
        console.log(`Vision extracted (fallback): ${design.sections?.length || 0} sections`);
        return respond({ design });
      } catch {}
    }

    return respond({ error: "Vision model did not return structured design data" });
  } catch (e) {
    console.error("ai-vision-extract error:", e);
    return respond({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});
