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

    const systemPrompt = buildSystemPrompt(sectionTypesList);

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
    const isPlainObject = (value: unknown) => typeof value === "object" && value !== null && !Array.isArray(value);
    const hasCompleteSection = (section: any) => (
      isPlainObject(section) &&
      typeof section.type === "string" &&
      section.type.trim().length > 0 &&
      isPlainObject(section.settings) &&
      Array.isArray(section.block_order) &&
      isPlainObject(section.blocks)
    );

    if (parsed.operations && Array.isArray(parsed.operations)) {
      parsed.operations = parsed.operations.filter((op: any) => {
        if (!op || typeof op.type !== "string") {
          return false;
        }

        // Strip updateNavigation (link_lists not supported)
        if (op.type === "updateNavigation") {
          console.warn("Stripped updateNavigation op (link_lists incompatible)");
          return false;
        }

        // Normalize content_for_* arrays
        if (op.type === "updateGlobalSetting" && typeof op.key === "string" && op.key.startsWith("content_for_") && typeof op.value === "string") {
          try {
            const parsedValue = JSON.parse(op.value.replace(/'/g, '"'));
            if (Array.isArray(parsedValue)) {
              op.value = parsedValue.filter((id) => typeof id === "string" && id.trim() !== "");
            }
          } catch {
            console.warn(`Unable to parse ${op.key} value, leaving as-is`);
          }
        }

        // Strip incomplete addSection payloads
        if (op.type === "addSection") {
          if (!hasCompleteSection(op.section)) {
            console.warn("Stripped incomplete addSection op");
            return false;
          }
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

        if (op.type === "addBlock") {
          if (!isPlainObject(op.block) || typeof op.block.type !== "string" || !isPlainObject(op.block.settings)) {
            console.warn("Stripped incomplete addBlock op");
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

function buildSystemPrompt(sectionTypesList: string): string {
  return `You are an expert web-to-Kajabi theme transformer.

You receive source React/Tailwind files, extracted design tokens, the Kajabi theme structure, and available section types.
You output transformation operations and CSS overrides via the apply_transformations tool call.

OPERATION TYPES:
- updateGlobalSetting: { type, key, value, label }
- updateSectionSetting: { type, sectionId, key, value, label }
- updateBlockSetting: { type, sectionId, blockId, key, value, label }
- replaceText: { type, sectionId, blockId, key:"text", value:"<html>", label }
- hideSection: { type, sectionId }
- addSection: { type, sectionId, section:{type,name,settings,block_order,blocks}, label }
- addBlock: { type, sectionId, blockId, block:{type,settings}, label }
- addCssOverride: { type, css, label }

COMPLETE addSection EXAMPLE (you MUST follow this structure):
{
  "type": "addSection",
  "sectionId": "1718825317433",
  "label": "Stats Section",
  "section": {
    "type": "text-columns",
    "name": "Stats",
    "settings": {
      "background_color": "#0b1214",
      "text_color": "#8a9ba8",
      "heading_color": "#e0e8e4",
      "padding_desktop": {"top":"80","bottom":"80"},
      "padding_mobile": {"top":"48","bottom":"48"}
    },
    "block_order": ["1718825317501","1718825317502","1718825317503"],
    "blocks": {
      "1718825317501": {
        "type": "text_column",
        "settings": {"heading":"2,400+","text":"<p>Graduates Certified worldwide</p>","text_align":"center"}
      },
      "1718825317502": {
        "type": "text_column",
        "settings": {"heading":"27","text":"<p>Years Teaching</p>","text_align":"center"}
      },
      "1718825317503": {
        "type": "text_column",
        "settings": {"heading":"12","text":"<p>Reef Locations</p>","text_align":"center"}
      }
    }
  }
}

CRITICAL RULE: The "section" field must NEVER be empty {}. It MUST contain type, name, settings (object), block_order (array of block ID strings), and blocks (object mapping block IDs to {type, settings}). If you cannot build a complete section, do NOT emit the addSection operation.

ID FORMAT:
- Section IDs: 13-digit numeric-only strings (e.g. "1718825317433"). NO letters.
- Block IDs: 13-digit numeric-only strings. NO letters.
- Generate unique random IDs for each new section/block.

DATA FORMAT (Kajabi rejects violations):
- content_for_index: actual JSON array ["id1","id2"], NEVER a string
- padding_desktop/padding_mobile: objects {"top":"96","bottom":"96"}, NEVER strings
- Do NOT emit updateNavigation operations (Kajabi rejects link_lists)

SECTION TYPE CONSTRAINT:
addSection type MUST be one of: ${sectionTypesList}
Do NOT invent types. Map source content to the closest available type:
- Stats/metrics/features/courses -> "text-columns"
- CTA/banner -> "banner"
- About/info/testimonials -> "content"

BLOCK TYPE CONSTRAINT:
Only use block types that already exist in the theme structure for that section type (e.g. "text", "cta", "image", "text_column").

STRATEGY:
1. Update hero section with source hero content (heading, subheading, CTA text)
2. Update header (logo text, background color)
3. Hide default content sections you are replacing
4. Add NEW sections for EVERY content area in the source (stats, courses, testimonials, CTA, etc.) using addSection with COMPLETE section objects
5. Update content_for_index to include all section IDs in visual order
6. Update footer (logo, copyright, colors)
7. Generate comprehensive cssOverrides to pixel-match the source design

CSS OVERRIDES (cssOverrides string):
- Start with @import for Google Fonts
- Use !important on ALL rules
- Include: body bg/color, header styling, hero typography, per-section backgrounds, stat number colors, testimonial card styles, CTA card styles, button styles, footer, responsive @media
- Use custom CSS classes in your HTML text blocks (e.g. class="stat-number") and style them in cssOverrides

CONTENT RULES:
- Use ACTUAL text from the source components. NEVER placeholder text.
- For text blocks, use rich HTML: <h1>, <h2>, <p>, <strong>, <em>, <br/>
- Add CSS classes to HTML elements for precise styling via cssOverrides

GOAL: The exported Kajabi theme should visually match the source project as closely as possible.`;
}
