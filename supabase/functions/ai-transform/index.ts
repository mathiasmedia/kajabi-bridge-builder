const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { sourceFiles, extractedDesign, themeStructure } = await req.json();

    // Build a comprehensive prompt with all source data
    const systemPrompt = `You are an expert web-to-Kajabi theme transformer. You receive:
1. Source project files (React/Tailwind CSS)
2. Extracted design tokens (colors, fonts, sections)
3. Kajabi theme structure (sections, blocks, settings)

Your job: produce a JSON object with two keys:
- "operations": array of Kajabi transformation operations
- "cssOverrides": a single CSS string that makes the Kajabi theme visually match the source

CRITICAL RULES:
- The CSS must enforce the EXACT visual style: backgrounds, colors, fonts, spacing, typography sizes
- Use !important on all CSS rules (Kajabi's default styles are aggressive)
- Import Google Fonts via @import at the top of cssOverrides
- Map ALL content: headings, paragraphs, stats, testimonials, CTAs
- Use the exact section IDs and block IDs from the theme structure
- For text blocks, use HTML (h1, h2, h3, h4, p, em, strong, br)
- Colors must be hex format
- Include responsive styles for mobile

Operation types you can emit:
- { type: "updateGlobalSetting", key: string, value: any, label: string }
- { type: "updateSectionSetting", sectionId: string, key: string, value: any, label: string }  
- { type: "updateBlockSetting", sectionId: string, blockId: string, key: string, value: any, label: string }
- { type: "replaceText", sectionId: string, blockId: string, key: string, value: string, label: string }
- { type: "hideSection", sectionId: string }
- { type: "updateNavigation", menuId: string, links: Array<{name: string, url: string}> }

Respond ONLY with valid JSON, no markdown fences.`;

    const userPrompt = `## Source Project Files

### index.css (design tokens)
\`\`\`css
${sourceFiles.indexCss || "N/A"}
\`\`\`

### tailwind.config.ts
\`\`\`typescript
${sourceFiles.tailwindConfig || "N/A"}
\`\`\`

### Components
${Object.entries(sourceFiles.components || {})
  .map(([path, content]) => `#### ${path}\n\`\`\`tsx\n${(content as string).slice(0, 3000)}\n\`\`\``)
  .join("\n\n")}

### Pages
${Object.entries(sourceFiles.pages || {})
  .map(([path, content]) => `#### ${path}\n\`\`\`tsx\n${(content as string).slice(0, 3000)}\n\`\`\``)
  .join("\n\n")}

## Extracted Design Summary
- Heading font: ${extractedDesign.headingFont}
- Body font: ${extractedDesign.bodyFont}
- Colors: ${JSON.stringify(extractedDesign.colors)}
- Hero: ${JSON.stringify(extractedDesign.hero)}
- Sections: ${JSON.stringify(extractedDesign.sections)}
- Header: ${JSON.stringify(extractedDesign.header)}
- Footer: ${JSON.stringify(extractedDesign.footer)}
- Button style: ${JSON.stringify(extractedDesign.buttonStyle)}

## Kajabi Theme Structure (settings_data.json > current)
The theme has these sections with their blocks:
\`\`\`json
${JSON.stringify(themeStructure, null, 2)}
\`\`\`

Generate the transformation operations and CSS overrides to make this Kajabi theme look as close as possible to the source Lovable project. Pay special attention to:
1. Dark background colors matching exactly
2. Teal/green accent colors
3. Typography (font families, sizes, weights, letter-spacing)
4. Section content (hero text, stats, courses, testimonials, CTA)
5. Navigation links
6. Footer styling
7. Button styling (rounded, teal background, dark text)
8. Spacing and layout proportions`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Credits exhausted. Add funds in Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway returned ${response.status}: ${errText}`);
    }

    const aiResult = await response.json();
    let content = aiResult.choices?.[0]?.message?.content || "";

    // Strip markdown fences if present
    content = content.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content.slice(0, 500));
      return new Response(
        JSON.stringify({ error: "AI returned invalid JSON", raw: content.slice(0, 1000) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-transform error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
