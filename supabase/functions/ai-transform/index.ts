const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { sourceFiles, extractedDesign, themeStructure, availableSectionTypes } = await req.json();

    const sectionTypesList = (availableSectionTypes || []).join(", ");

    const systemPrompt = `You are an expert web-to-Kajabi theme transformer. You receive:
1. Source project files (React/Tailwind CSS)
2. Extracted design tokens (colors, fonts, sections)
3. Kajabi theme structure (sections, blocks, settings)
4. Available Kajabi section types (liquid templates that exist in the theme)

Your job: produce transformation operations and CSS overrides.

CRITICAL RULES:
- The CSS must enforce the EXACT visual style: backgrounds, colors, fonts, spacing, typography sizes
- Use !important on all CSS rules (Kajabi's default styles are aggressive)
- Import Google Fonts via @import at the top of cssOverrides if needed
- Map ALL content: headings, paragraphs, stats, testimonials, CTAs
- Use the exact section IDs and block IDs from the theme structure
- For text blocks, use HTML (h1, h2, h3, h4, p, em, strong, br)
- Colors must be hex format
- Include responsive styles for mobile

SECTION TYPE CONSTRAINT (VERY IMPORTANT):
When using addSection, the section.type MUST be one of these existing template types: ${sectionTypesList}
Do NOT invent new section types — Kajabi will throw "Liquid error: internal" if the type doesn't match an existing .liquid template file.
When adding new sections, reuse existing types (e.g. "banner", "content", "text-columns") and customize them via settings and blocks.

BLOCK TYPE CONSTRAINT:
When using addBlock, look at the existing blocks in the theme structure to see what block types are available for each section type. Only use block types that already exist in those sections.

Operation types you can emit:
- { type: "updateGlobalSetting", key: string, value: any, label: string }
- { type: "updateSectionSetting", sectionId: string, key: string, value: any, label: string }  
- { type: "updateBlockSetting", sectionId: string, blockId: string, key: string, value: any, label: string }
- { type: "replaceText", sectionId: string, blockId: string, key: string, value: string, label: string }
- { type: "hideSection", sectionId: string }
- { type: "addSection", sectionId: string, section: { type: string, name: string, settings: object, block_order: string[], blocks: object }, label: string }
- { type: "addBlock", sectionId: string, blockId: string, block: { type: string, settings: object }, label: string }
- { type: "addCssOverride", css: string, label: string }

IMPORTANT ID FORMAT RULES:
- Section IDs for addSection MUST be numeric-only strings of 13 digits (like a timestamp), e.g. "1575400116835". Generate random 13-digit numbers. Do NOT use alphabetic characters in section IDs.
- Block IDs for addBlock should also be numeric-only 13-digit strings.
- Do NOT use "updateNavigation" — Kajabi does not accept "link_lists" as a global key. Instead, use CSS and section settings to style navigation.

STRATEGY:
1. First, update existing sections with the right content and settings
2. Add new sections using ONLY existing section types to replicate missing content areas
3. Update content_for_index via updateGlobalSetting to include all sections in the right order
4. Use CSS overrides extensively to match the visual design (colors, fonts, spacing, backgrounds)
5. Generate unique numeric-only 13-digit section IDs for new sections and use existing types`;

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

## Available Section Types (existing .liquid templates)
${sectionTypesList}

## Kajabi Theme Structure (settings_data.json > current)
\`\`\`json
${JSON.stringify(themeStructure, null, 2)}
\`\`\`

Generate the transformation operations and CSS overrides to make this Kajabi theme look as close as possible to the source project. Pay special attention to:
1. Background colors matching exactly
2. Accent colors
3. Typography (font families, sizes, weights, letter-spacing)
4. Section content (hero text, stats, courses, testimonials, CTA)
5. Navigation links
6. Footer styling
7. Button styling
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
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "apply_transformations",
                description: "Apply Kajabi theme transformations with operations and CSS overrides",
                parameters: {
                  type: "object",
                  properties: {
                    operations: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          type: { type: "string" },
                          sectionId: { type: "string" },
                          blockId: { type: "string" },
                          key: { type: "string" },
                          value: {},
                          label: { type: "string" },
                          menuId: { type: "string" },
                          links: { type: "array" },
                          section: { type: "object" },
                          block: { type: "object" },
                          css: { type: "string" },
                        },
                        required: ["type"],
                      },
                    },
                    cssOverrides: { type: "string", description: "CSS string with @import and all overrides" },
                  },
                  required: ["operations", "cssOverrides"],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "apply_transformations" } },
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
    
    let parsed;
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch {
        console.error("Failed to parse tool call args:", toolCall.function.arguments.slice(0, 500));
        return new Response(
          JSON.stringify({ error: "AI returned invalid tool call JSON" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      let content = aiResult.choices?.[0]?.message?.content || "";
      content = content.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
      try {
        parsed = JSON.parse(content);
      } catch {
        console.error("Failed to parse AI response:", content.slice(0, 500));
        return new Response(
          JSON.stringify({ error: "AI returned invalid JSON", raw: content.slice(0, 1000) }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate: strip addSection ops with invalid types
    const validTypes = new Set(availableSectionTypes || []);
    if (parsed.operations && Array.isArray(parsed.operations)) {
      parsed.operations = parsed.operations.filter((op: any) => {
        if (op.type === "addSection" && op.section?.type && validTypes.size > 0) {
          if (!validTypes.has(op.section.type)) {
            console.warn(`Stripped addSection with invalid type: ${op.section.type}`);
            return false;
          }
        }
        return true;
      });
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
