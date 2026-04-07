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
- Do NOT emit "updateNavigation" operations — Kajabi rejects "link_lists" as a global key.

DATA FORMAT RULES (CRITICAL — violations cause Kajabi to reject the theme):
- content_for_index and all content_for_* values MUST be actual JSON arrays of section ID strings, e.g. ["1575400116835", "1575400143733"]. NEVER a stringified array.
- padding_desktop and padding_mobile MUST be objects like {"top":"96","bottom":"96"}. NEVER stringified JSON.
- All setting values that are objects/arrays must be actual objects/arrays, never stringified JSON strings.
- Arrays must not contain empty strings — only valid section ID strings.
- Every addSection MUST include a complete section object with at minimum: type, name, settings (object), block_order (array), and blocks (object). Never emit empty stub sections.

STRATEGY:
1. First, update existing sections (hero, header, footer) with the right content and settings
2. CRITICALLY IMPORTANT: Add NEW sections for EVERY content area in the source project that doesn't already exist in the theme. The source project likely has stats/metrics sections, course listings, testimonials, CTA sections, about sections, feature grids, etc. You MUST add a section for EACH of these using addSection with existing section types.
3. For each new section, pick the closest existing section type (e.g. "banner" for CTA, "text-columns" for stats/features, "content" for about/info areas, "testimonials" for reviews). Fill in ALL content from the source via blocks and settings.
4. Update content_for_index via updateGlobalSetting to be an array containing ALL section IDs (existing + new) in the correct visual order
5. Use CSS overrides extensively to match the visual design (colors, fonts, spacing, backgrounds, section-specific styling using section IDs)
6. Generate unique numeric-only 13-digit section IDs for new sections
7. Aim for at least 4-6 total content sections on the page (not counting header/footer)

SECTION CUSTOMIZATION (CRITICAL — DO NOT LEAVE DEFAULTS):
Every section you add or update MUST have ALL of its settings and blocks fully populated with REAL content from the source project. NEVER leave default/placeholder text like "Amazing Feature", "Lorem ipsum", "Call to Action", etc.

For EVERY section:
- Set the heading/title to the ACTUAL text from the source project
- Set the body/description to the ACTUAL text from the source project
- Set background_color to match the source section's background (use hex)
- Set text_color/heading_color to match the source
- Set padding_desktop and padding_mobile as objects like {"top":"80","bottom":"80"}
- Set button text, URL, and style to match the source CTAs
- For image blocks, set image alt text and placeholder descriptions
- For multi-column sections (text-columns, features), populate EVERY block with distinct real content from the source — each column should have its own unique heading and description

For blocks within sections:
- Each block MUST have its "heading" or "title" set to real content
- Each block MUST have its "text" or "description" set to real content  
- Each block MUST have styling settings (colors, alignment) set appropriately
- Do NOT rely on CSS alone — the section settings and block settings must contain the actual content

The exported theme should look like a FINISHED, POLISHED page — not a template with placeholders.`;

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

    // Validate operations
    const validTypes = new Set(availableSectionTypes || []);
    if (parsed.operations && Array.isArray(parsed.operations)) {
      parsed.operations = parsed.operations.filter((op: any) => {
        // Strip updateNavigation (link_lists not supported)
        if (op.type === "updateNavigation") {
          console.warn("Stripped updateNavigation op (link_lists incompatible)");
          return false;
        }
        // Strip addSection with invalid types
        if (op.type === "addSection" && op.section?.type && validTypes.size > 0) {
          if (!validTypes.has(op.section.type)) {
            console.warn(`Stripped addSection with invalid type: ${op.section.type}`);
            return false;
          }
        }
        // Fix non-numeric section IDs for addSection
        if (op.type === "addSection" && op.sectionId && !/^\d+$/.test(op.sectionId)) {
          op.sectionId = String(Math.floor(1000000000000 + Math.random() * 9000000000000));
          console.warn(`Replaced non-numeric sectionId with: ${op.sectionId}`);
        }
        // Fix non-numeric block IDs for addBlock
        if (op.type === "addBlock" && op.blockId && !/^\d+$/.test(op.blockId)) {
          op.blockId = String(Math.floor(1000000000000 + Math.random() * 9000000000000));
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
