const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── Types ──────────────────────────────────────────────────────────────

type SourceFiles = {
  indexCss?: string;
  tailwindConfig?: string;
  components?: Record<string, string>;
  pages?: Record<string, string>;
};

type TransformPayload = {
  operations?: any[];
  cssOverrides?: string;
};

/*
 * KAJABI SCHEMA REFERENCE (streamlined-home base theme)
 *
 * Available section types: section, page_content, carousel, newsletter_hero,
 *   header, footer, sales_page_body, page_embedded_checkout, exit_pop, two_step,
 *   products, store_builder, blog_listings, blog_post_body, etc.
 *
 * For homepage content, ONLY use "section" type. Others are special-purpose.
 *
 * "section" type settings:
 *   bg_type: "none"|"color"|"image"|"video"
 *   background_color: CSS color (e.g. "RGBA(22, 30, 42, 0.86)")
 *   bg_image, bg_video, bg_position, full_width, full_height, vertical, horizontal
 *   padding_desktop/padding_mobile: {top,left,right,bottom}
 *   equal_height: "true"|"false"
 *
 * Valid block types for "section":
 *   text, feature, card, cta, image, accordion, form, video, video_embed,
 *   audio, blog, code, countdown, course_outline, event, external_widget,
 *   link_list, multi_video, offer, pricing, social_icons, social_share
 *
 * Block "text" settings:
 *   text: rich HTML (<h1>, <h2>, <h4>, <p>, <span style="...">)
 *   width: "4"|"6"|"8"|"12" (grid columns, 12 = full width)
 *   text_align: "left"|"center"|"right"
 *   use_btn: "true"|"false"
 *   btn_text, btn_action, new_tab
 *   background_color, padding_desktop, padding_mobile, margin_desktop, margin_mobile
 *   drop_cap: "true"|"false"
 *
 * Block "feature" settings:
 *   text: rich HTML (<h4>Title</h4><p>Description</p>)
 *   image, image_alt, image_width, hide_image
 *   width: "4"|"6" (for multi-column layouts)
 *   text_align, use_btn, btn_text, btn_action
 *   background_color, padding_desktop, padding_mobile
 *
 * Block "cta" settings:
 *   btn_text, btn_action, new_tab
 *   width, text_align
 *   btn_text_color, btn_background_color, btn_border_radius
 *
 * Block "card" settings:
 *   Similar to feature, with image + text + optional button
 *
 * Block "image" settings:
 *   image, image_alt, width, img_action
 *
 * IMPORTANT: Section does NOT have heading/subheading settings!
 * All content including headings goes inside blocks as rich HTML.
 */

// ── Entry ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json();
    const step: string = body.step || "globals";

    if (step === "globals") {
      return await handleGlobalsStep(LOVABLE_API_KEY, body);
    } else if (step === "section") {
      return await handleSectionStep(LOVABLE_API_KEY, body);
    } else {
      return jsonResponse({ error: `Unknown step: ${step}` }, 400);
    }
  } catch (e) {
    console.error("ai-transform error:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});

// ── Step 1: Globals ──

async function handleGlobalsStep(apiKey: string, body: any) {
  const {
    sourceFiles = {},
    extractedDesign = {},
    themeStructure = {},
    availableSectionTypes = [],
    heroSectionId,
    heroBlockMap,
  } = body;

  const systemPrompt = `You are an expert web-to-Kajabi theme transformer.

In THIS step you handle: global settings, header block updates, footer block updates, hero section block updates, navigation menus, and CSS overrides.
Do NOT add new sections in this step. Do NOT output addSection operations.

KAJABI SCHEMA RULES:
- Sections do NOT have heading/subheading/text settings. All content goes in BLOCKS.
- Section settings: bg_type, background_color, bg_image, full_width, padding_desktop, padding_mobile, vertical, horizontal
- Block types: text, feature, card, cta, image (use these exact names)
- Text block settings: text (rich HTML), width, text_align, use_btn, btn_text, btn_action, background_color
- CTA block settings: btn_text, btn_action, btn_text_color, btn_background_color
- Header block types: logo, menu, dropdown, user, cta
- Footer block types: logo, link_list, copyright, social_icons
- Menu/link_list blocks have settings.menu referencing a link_list ID

BACKGROUND COLOR RULES:
- Do NOT set a global "background_color" key. Instead, set bg_type and background_color on EACH SECTION individually.
- For the hero section, use updateSectionSetting with key "bg_type" = "color" and key "background_color" = the desired dark/light color.
- For header/footer sections, also use updateSectionSetting for background_color.
- Kajabi auto-applies "background-light" or "background-dark" CSS classes based on the section's background_color, which adjusts text color automatically.
- So do NOT set text colors via CSS for sections — just set the right background_color per section.

OPERATION TYPES (allowed in this step):
- updateGlobalSetting: { type, key, value, label } — for fonts, NOT for background_color
- updateSectionSetting: { type, sectionId, key, value, label }
- updateBlockSetting: { type, sectionId, blockId, key, value, label }
- replaceText: { type, sectionId, blockId, key:"text", value:"<html>", label }
- hideSection / showSection: { type, sectionId }
- addCssOverride: { type, css, label }
- updateNavigation: { type, menuId, links:[{name,url}], label }

NAVIGATION RULES:
- The header references menus: "main-menu" and "about-menu"
- The footer references menu: "main-menu"
- Generate updateNavigation ops for these menus using source nav items
- Format: { type: "updateNavigation", menuId: "main-menu", links: [{name: "Home", url: "/"}], label: "..." }

CSS RULES:
- Put all CSS in cssOverrides (fonts @import, typography, buttons, spacing)
- Do NOT set page-wide background colors in CSS. Each section controls its own background.
- Match the source design. Use !important when needed.

ID FORMAT: 13-digit numeric-only strings.
Use actual source text, no placeholders. No external image URLs.`;

  const userPrompt = `## Source design
### index.css
\`\`\`css
${trimText(sourceFiles.indexCss, 1800)}
\`\`\`
### tailwind.config.ts
\`\`\`ts
${trimText(sourceFiles.tailwindConfig, 800)}
\`\`\`

## Source components
${buildRelevantSourceContext(sourceFiles)}

## Extracted design
${JSON.stringify({
    headingFont: extractedDesign?.headingFont,
    bodyFont: extractedDesign?.bodyFont,
    colors: extractedDesign?.colors,
    header: extractedDesign?.header,
    hero: extractedDesign?.hero,
    footer: extractedDesign?.footer,
    buttonStyle: extractedDesign?.buttonStyle,
  }, null, 2)}

## Current Kajabi theme structure
${JSON.stringify(themeStructure, null, 2)}

Generate operations for: header, footer, hero blocks, navigation menus, and CSS overrides.
IMPORTANT: Generate updateNavigation for "main-menu" and "about-menu" using the source nav items.`;

  const result = await requestTransform({
    apiKey,
    model: "google/gemini-3-flash-preview",
    systemPrompt,
    userPrompt,
    maxTokens: 12000,
  });

  console.log(`ai-transform [globals] finish_reason=${result.finishReason ?? "unknown"}`);

  const parsed = normalizeTransformPayload(result.parsed, availableSectionTypes);
  // Remove addSection ops (not allowed in globals) and global background_color (use per-section instead)
  parsed.operations = parsed.operations.filter((op: any) => {
    if (op.type === 'addSection') return false;
    if (op.type === 'updateGlobalSetting' && op.key === 'background_color') return false;
    return true;
  });

  if (parsed.operations.length === 0 && !parsed.cssOverrides) {
    return jsonResponse({ error: "AI returned no valid global operations. Please retry." }, 500);
  }

  return jsonResponse({
    operations: parsed.operations,
    cssOverrides: parsed.cssOverrides,
  });
}

// ── Step 2: Single section generation ──

async function handleSectionStep(apiKey: string, body: any) {
  const {
    sourceFiles = {},
    extractedDesign = {},
    themeStructure = {},
    availableSectionTypes = [],
    sectionToGenerate,
    existingSectionHeadings = [],
  } = body;

  if (!sectionToGenerate) {
    return jsonResponse({ error: "sectionToGenerate is required for section step" }, 400);
  }

  const sectionContext = findSectionSourceContext(sourceFiles, sectionToGenerate);
  const intent = classifySectionIntent(sectionToGenerate);
  const blockPattern = getBlockPatternForIntent(intent);

  const dedupWarning = existingSectionHeadings.length > 0
    ? `\n\nDEDUPLICATION: These headings already exist. Do NOT repeat them:\n${existingSectionHeadings.map((h: string) => `- "${h}"`).join("\n")}\nIf already covered, return {"operations":[],"cssOverrides":""}.`
    : "";

  const systemPrompt = `You are an expert web-to-Kajabi theme transformer.

Create exactly ONE addSection operation that faithfully recreates a source section.

CRITICAL KAJABI SCHEMA RULES:
- Section type MUST be "section" (the only type that supports rich content blocks)
- Section settings: bg_type ("none"|"color"|"image"), background_color, padding_desktop, padding_mobile, full_width, vertical, horizontal, equal_height
- IMPORTANT: Always set bg_type="color" and background_color on EVERY section. Use the source design's background color for that section.
  Kajabi auto-applies "background-light" or "background-dark" classes based on the background_color, which adjusts text color automatically.
  For dark designs, use a dark background_color (e.g. "#0b1214"). For light designs, use a light color (e.g. "#ffffff").
- Section does NOT have heading, subheading, or text settings! ALL content goes in BLOCKS.
- Section does NOT have heading, subheading, or text settings! ALL content goes in BLOCKS.

VALID BLOCK TYPES: text, feature, card, cta, image
- "text" block: settings.text = rich HTML (<h1>/<h2>/<h4>/<p>), settings.width ("4"|"6"|"8"|"12"), text_align, use_btn, btn_text, btn_action, background_color
- "feature" block: settings.text = rich HTML (<h4>Title</h4><p>Desc</p>), settings.image, settings.width ("4"|"6"), text_align, use_btn, btn_text, btn_action, hide_image
- "cta" block: settings.btn_text, settings.btn_action, settings.width, btn_text_color, btn_background_color
- "image" block: settings.image, settings.image_alt, settings.width
- "card" block: similar to feature

${blockPattern}

COMPLETE EXAMPLE — Stats section with 3 stat columns:
{
  "type": "addSection",
  "sectionId": "1718825317433",
  "label": "Stats Section",
  "section": {
    "type": "section",
    "name": "Stats",
    "settings": {
      "bg_type": "color",
      "background_color": "#0b1214",
      "padding_desktop": {"top":"80","bottom":"80"},
      "padding_mobile": {"top":"48","bottom":"48"},
      "horizontal": "center",
      "equal_height": "true"
    },
    "block_order": ["1718825317501","1718825317502","1718825317503"],
    "blocks": {
      "1718825317501": {
        "type": "feature",
        "settings": {"text":"<h4>2,400+</h4><p>Graduates certified worldwide</p>","width":"4","text_align":"center","hide_image":"true"}
      },
      "1718825317502": {
        "type": "feature",
        "settings": {"text":"<h4>27</h4><p>Years of teaching excellence</p>","width":"4","text_align":"center","hide_image":"true"}
      },
      "1718825317503": {
        "type": "feature",
        "settings": {"text":"<h4>12</h4><p>Reef locations globally</p>","width":"4","text_align":"center","hide_image":"true"}
      }
    }
  }
}

CONTENT RULES:
- ALL text content goes in block settings.text as rich HTML
- Use <h1>/<h2> for main headings, <h4> for sub-headings, <p> for body
- Use width to create multi-column layouts (width "4" = 3 columns, "6" = 2 columns)
- Include ALL items from source (4 features = 4 feature/card blocks)
- NEVER compress multiple source items into one block
- If items count is N, output at least N item blocks plus any heading/introduction block
- For course/program sections, use one card or feature block per course with title, supporting details, description, and price when present
- For testimonial sections, use one text or card block per testimonial with the quote and the person's name/role when present
- Include buttons via use_btn="true" + btn_text + btn_action
- Use actual source text, no placeholders
- No external image URLs

ID FORMAT: 13-digit numeric-only strings.
FOOTER RULE: If this is a footer section, return {"operations":[],"cssOverrides":""}.${dedupWarning}`;

  const userPrompt = `## Source section to recreate
${JSON.stringify(sectionToGenerate, null, 2)}

## Source section content
- Intent: ${intent}
- Heading: ${sectionToGenerate.heading || "none"}
- Body: ${sectionToGenerate.body || "none"}
- CTA: ${sectionToGenerate.ctaText || "none"} → ${sectionToGenerate.ctaUrl || "none"}
- Items count: ${sectionToGenerate.items?.length || 0}
${sectionToGenerate.items ? "- Items:\n" + JSON.stringify(sectionToGenerate.items, null, 2) : ""}

## Relevant source code
${sectionContext}

## Design tokens
${JSON.stringify({
    headingFont: extractedDesign?.headingFont,
    bodyFont: extractedDesign?.bodyFont,
    colors: extractedDesign?.colors?.slice(0, 6),
    buttonStyle: extractedDesign?.buttonStyle,
  }, null, 2)}

Create ONE addSection with type "section" and rich content blocks.
Remember: section settings do NOT have heading/subheading/text fields. Put ALL content in blocks.
Block text must be rich HTML. Use width for column layouts.`;

  const models = ["google/gemini-2.5-flash", "google/gemini-3-flash-preview"];
  let lastError = "";

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        // Use plain JSON output (no tool calling) to avoid additionalProperties blocks bug
        const result = await requestJsonTransform({
          apiKey,
          model,
          systemPrompt,
          userPrompt,
          maxTokens: 12000,
        });

        const fr = result.finishReason ?? "unknown";
        console.log(`ai-transform [section:${sectionToGenerate.type}] [${model}] attempt=${attempt} finish_reason=${fr}`);

        if (fr === "length" || fr === "max_tokens") {
          console.warn(`ai-transform [section] TRUNCATED on attempt ${attempt}`);
          lastError = "Response truncated";
          continue;
        }

        const parsed = normalizeTransformPayload(result.parsed, availableSectionTypes);
        const addSectionOp = parsed.operations.find((op: any) => op.type === "addSection");

        if (addSectionOp) {
          const finalBlockCount = Object.keys(addSectionOp.section?.blocks || {}).length;
          console.log(`ai-transform [section] NORMALIZED addSection: blocks=${finalBlockCount}`);
          if (addSectionOp.section) {
            addSectionOp.section.type = "section";
          }
          if (finalBlockCount > 0) {
            return jsonResponse({ operations: [addSectionOp] });
          }
          console.warn(`ai-transform [section] AI returned 0 blocks on attempt ${attempt}, retrying...`);
          lastError = "AI returned section with 0 blocks";
          continue;
        }

        if (intent === 'footer') {
          return jsonResponse({ operations: [] });
        }

        lastError = "No valid addSection operation produced";
        console.warn(`ai-transform [section] [${model}] ${lastError}`, JSON.stringify(result.parsed).slice(0, 500));
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(`ai-transform [section] [${model}] attempt=${attempt} failed: ${lastError}`);
        if (attempt < 2) continue;
      }
    }
  }

  return jsonResponse({ error: `Failed to generate section "${sectionToGenerate.heading || sectionToGenerate.type}": ${lastError}` }, 500);
}

// ── Block pattern templates ──

function getBlockPatternForIntent(intent: SectionIntent): string {
  const patterns: Record<SectionIntent, string> = {
    'hero': `PATTERN for hero:
- 1 text block (width "8"-"12"): <h1>Main Heading</h1><p style="font-size:20px">Subheading paragraph</p>
- 1 cta block: btn_text, btn_action
- Section: bg_type="color" or "image", background_color for dark bg`,

    'stats': `PATTERN for stats:
- Multiple feature blocks (width "4" each, hide_image="true")
- Each: <h4>Number/Stat</h4><p>Description</p>
- Section: equal_height="true"`,

    'feature-grid': `PATTERN for features/programs:
- 1 text block (width "12"): <h2>Section Title</h2><p>Intro text</p>
- Multiple feature blocks (width "4" or "6" each): <h4>Feature Title</h4><p>Description</p>
- Include ALL features from source, with use_btn if source has CTAs`,

    'testimonial-band': `PATTERN for testimonials:
- 1 text block (width "12"): <h2>Section Title</h2>
- Multiple text or card blocks (width "4" or "6"): "<p style="font-style:italic">Quote</p><p><strong>Name</strong></p>"`,

    'cta-band': `PATTERN for CTA:
- 1 text block (width "8", text_align "center"): <h2>CTA Heading</h2><p>Supporting text</p>
- 1 cta block: btn_text, btn_action`,

    'content-media-split': `PATTERN for content/media:
- 1 text block (width "5"-"6"): heading + body + optional button
- 1 image block (width "5"-"6"): image, image_alt`,

    'footer': `Return empty operations.`,

    'heading-separator': `PATTERN for heading separator:
- 1 text block (width "8"-"12"): <h2>Heading</h2>`,

    'content': `PATTERN for content:
- 1 text block (width "8"-"12"): <h2>Heading</h2><p>Body text</p>
- Optional cta block with btn_text + btn_action`,
  };

  return patterns[intent] || patterns['content'];
}

// ── Plain JSON request (no tool calling — avoids additionalProperties blocks bug) ──

async function requestJsonTransform({
  apiKey, model, systemPrompt, userPrompt, maxTokens,
}: {
  apiKey: string; model: string; systemPrompt: string; userPrompt: string; maxTokens: number;
}) {
  const maxRetries = 3;
  const requestBody = JSON.stringify({
    model,
    max_completion_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt + "\n\nRespond with ONLY a JSON object. No markdown, no code fences, just raw JSON." },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  let lastError = "";
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      if (response.ok) {
        const aiResult = await response.json();
        const content = aiResult.choices?.[0]?.message?.content || "";
        if (!content?.trim()) throw new Error("AI returned empty response");
        const parsed = extractJson(content);
        return { parsed, finishReason: aiResult.choices?.[0]?.finish_reason ?? null };
      }

      const errText = await response.text();
      if (response.status === 429) throw new Error("Rate limited, please try again shortly.");
      if (response.status === 402) throw new Error("Credits exhausted.");
      if (response.status >= 500 && attempt < maxRetries) {
        lastError = `AI gateway returned ${response.status}`;
        await new Promise(r => setTimeout(r, attempt * 2000));
        continue;
      }
      throw new Error(`AI gateway returned ${response.status}: ${errText}`);
    } catch (e) {
      if (e instanceof Error && (e.message.includes("Rate limited") || e.message.includes("Credits exhausted"))) throw e;
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < maxRetries) { await new Promise(r => setTimeout(r, attempt * 2000)); continue; }
    }
  }
  throw new Error(`AI gateway failed after ${maxRetries} attempts: ${lastError}`);
}



function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requestTransform({
  apiKey, model, systemPrompt, userPrompt, maxTokens,
}: {
  apiKey: string; model: string; systemPrompt: string; userPrompt: string; maxTokens: number;
}) {
  const maxRetries = 3;
  const requestBody = JSON.stringify({
    model,
    max_completion_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    tools: [{
        type: "function",
        function: {
          name: "apply_transformations",
          description: "Apply Kajabi theme transformations",
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
                    links: { type: "array", items: { type: "object", properties: { name: { type: "string" }, url: { type: "string" } }, required: ["name", "url"] } },
                    section: {
                      type: "object",
                      description: "Full section definition with blocks",
                      properties: {
                        type: { type: "string", enum: ["section"] },
                        name: { type: "string" },
                        settings: {
                          type: "object",
                          properties: {
                            bg_type: { type: "string", enum: ["none", "color", "image"] },
                            background_color: { type: "string" },
                            padding_desktop: { type: "object" },
                            padding_mobile: { type: "object" },
                            horizontal: { type: "string" },
                            equal_height: { type: "string" },
                          },
                        },
                        block_order: { type: "array", items: { type: "string" }, description: "Array of 13-digit block IDs matching keys in blocks" },
                        blocks: {
                          type: "object",
                          description: "Map of 13-digit block ID to block object. MUST contain at least 1 block.",
                          additionalProperties: {
                            type: "object",
                            properties: {
                              type: { type: "string", enum: ["text", "feature", "card", "cta", "image"] },
                              settings: {
                                type: "object",
                                properties: {
                                  text: { type: "string", description: "Rich HTML content e.g. <h2>Title</h2><p>Body</p>" },
                                  width: { type: "string", enum: ["3", "4", "6", "8", "12"] },
                                  text_align: { type: "string", enum: ["left", "center", "right"] },
                                  use_btn: { type: "string", enum: ["true", "false"] },
                                  btn_text: { type: "string" },
                                  btn_action: { type: "string" },
                                  hide_image: { type: "string", enum: ["true", "false"] },
                                },
                              },
                            },
                            required: ["type", "settings"],
                          },
                        },
                      },
                      required: ["type", "name", "settings", "block_order", "blocks"],
                    },
                    block: { type: "object" },
                    css: { type: "string" },
                  },
                  required: ["type"],
                },
              },
              cssOverrides: {
                type: "string",
                description: "CSS string with @import and all overrides",
              },
            },
            required: ["operations", "cssOverrides"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "apply_transformations" } },
    });

  let lastError = "";
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      if (response.ok) {
        const aiResult = await response.json();
        const parsed = parseAiResponse(aiResult);
        const rawToolCallArgs = aiResult.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || null;
        return { parsed, finishReason: aiResult.choices?.[0]?.finish_reason ?? null, rawToolCallArgs };
      }

      const errText = await response.text();
      console.error(`AI gateway error (attempt ${attempt}/${maxRetries}):`, response.status, errText);

      if (response.status === 429) throw new Error("Rate limited, please try again shortly.");
      if (response.status === 402) throw new Error("Credits exhausted. Add funds in Settings > Workspace > Usage.");

      // Retry on 5xx errors
      if (response.status >= 500 && attempt < maxRetries) {
        lastError = `AI gateway returned ${response.status}: ${errText}`;
        const delay = attempt * 2000; // 2s, 4s backoff
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      throw new Error(`AI gateway returned ${response.status}: ${errText}`);
    } catch (e) {
      if (e instanceof Error && (e.message.includes("Rate limited") || e.message.includes("Credits exhausted"))) throw e;
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < maxRetries) {
        const delay = attempt * 2000;
        console.log(`Retrying after error in ${delay}ms: ${lastError}`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    }
  }
  throw new Error(`AI gateway failed after ${maxRetries} attempts: ${lastError}`);
}

function parseAiResponse(aiResult: any): TransformPayload {
  const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try { return extractJson(toolCall.function.arguments); } catch {
      console.error("Failed to parse tool call args:", toolCall.function.arguments.slice(0, 500));
    }
  }
  let content = aiResult.choices?.[0]?.message?.content || "";
  if (!content && toolCall?.function?.arguments) content = toolCall.function.arguments;
  if (!content?.trim()) throw new Error("AI returned an empty response. Please retry.");
  return extractJson(content);
}

function extractJson(raw: string): TransformPayload {
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* continue */ }

  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error("AI returned invalid JSON — no object found");
  }
  cleaned = cleaned.substring(jsonStart, jsonEnd + 1)
    .replace(/,\s*}/g, "}").replace(/,\s*]/g, "]")
    .replace(/[\x00-\x1F\x7F]/g, (ch) => "\n\r\t".includes(ch) ? ch : "");
  try { return JSON.parse(cleaned); } catch { /* continue */ }

  let braces = 0, brackets = 0;
  for (const char of cleaned) {
    if (char === "{") braces++; if (char === "}") braces--;
    if (char === "[") brackets++; if (char === "]") brackets--;
  }
  while (brackets > 0) { cleaned += "]"; brackets--; }
  while (braces > 0) { cleaned += "}"; braces--; }
  try { return JSON.parse(cleaned); } catch (e) {
    throw new Error(`AI returned invalid JSON: ${(e as Error).message}`);
  }
}

// ── Normalization ──

const VALID_BLOCK_TYPES = new Set([
  "text", "feature", "card", "cta", "image", "accordion", "form", "video",
  "video_embed", "audio", "blog", "code", "countdown", "course_outline",
  "event", "external_widget", "link_list", "multi_video", "offer", "pricing",
  "social_icons", "social_share",
]);

function normalizeTransformPayload(
  parsed: TransformPayload,
  availableSectionTypes: string[],
): Required<TransformPayload> {
  // Handle case where AI returns a single addSection directly (not wrapped in operations array)
  let operations: any[];
  if (Array.isArray(parsed?.operations)) {
    operations = parsed.operations;
  } else if ((parsed as any)?.type === 'addSection') {
    // AI returned a single operation directly
    operations = [parsed];
  } else {
    operations = [];
  }
  const cssOverrides = typeof parsed?.cssOverrides === "string" ? parsed.cssOverrides : "";

  const normalizedOperations = operations.filter((op: any) => {
    if (!op || typeof op.type !== "string") return false;

    if (op.type === "updateNavigation") {
      return !!op.menuId && Array.isArray(op.links);
    }

    if (op.type === "updateGlobalSetting" && typeof op.key === "string") {
      if (op.key.startsWith("content_for_")) op.value = normalizeIdArray(op.value);
    }

    if (op.type === "addSection") {
      if (!/^\d{13}$/.test(String(op.sectionId || ""))) op.sectionId = createNumericId();

      if (!isPlainObject(op.section)) op.section = {};

      // Force type to "section" for content sections
      op.section.type = "section";

      if (typeof op.section.name !== "string" || !op.section.name.trim()) {
        op.section.name = typeof op.label === "string" ? op.label.trim() : "Generated Section";
      }

      // Clean section settings — remove invalid keys
      if (!isPlainObject(op.section.settings)) op.section.settings = {};
      cleanSectionSettings(op.section.settings);

      // Normalize blocks
      if (Array.isArray(op.section.blocks)) {
        op.section.blocks = Object.fromEntries(
          op.section.blocks.map((b: any, i: number) => [createNumericId(), normalizeBlock(b)])
        );
      }
      if (!isPlainObject(op.section.blocks)) op.section.blocks = {};

      for (const [bid, block] of Object.entries(op.section.blocks)) {
        op.section.blocks[bid] = normalizeBlock(block);
      }

      // Remap block IDs to 13-digit numeric
      op.section = remapBlockIds(op.section);

      // Fix block_order
      op.section.block_order = Array.isArray(op.section.block_order)
        ? op.section.block_order.map((id: unknown) => String(id)).filter((id: string) => id in op.section.blocks)
        : Object.keys(op.section.blocks);
      if (op.section.block_order.length === 0 && Object.keys(op.section.blocks).length > 0) {
        op.section.block_order = Object.keys(op.section.blocks);
      }
    }

    if (op.type === "addBlock") {
      if (!/^\d{13}$/.test(String(op.blockId || ""))) op.blockId = createNumericId();
      if (!isPlainObject(op.block)) return false;
      op.block = normalizeBlock(op.block);
    }

    return true;
  });

  return { operations: normalizedOperations, cssOverrides };
}

function cleanSectionSettings(settings: Record<string, any>) {
  // Remove keys that don't belong on section settings
  const invalidSectionKeys = ['heading', 'subheading', 'text', 'heading_color', 'text_color', 'button_label'];
  for (const key of invalidSectionKeys) {
    delete settings[key];
  }
  // Ensure padding objects
  for (const key of ['padding_desktop', 'padding_mobile']) {
    if (settings[key] && typeof settings[key] === 'string') {
      try { settings[key] = JSON.parse(settings[key]); } catch { settings[key] = { top: "60", bottom: "60" }; }
    }
  }
}

function normalizeBlock(block: any): { type: string; settings: Record<string, any> } {
  if (!isPlainObject(block)) {
    return { type: "text", settings: typeof block === "string" ? { text: block, width: "12" } : { width: "12" } };
  }

  let blockType = typeof block.type === "string" ? block.type.trim() : "text";
  
  // Fix common wrong block types
  const typeRemap: Record<string, string> = {
    "text_column": "feature",
    "text-column": "feature",
    "textcolumn": "feature",
    "stat": "feature",
    "testimonial": "text",
    "quote": "text",
    "heading": "text",
    "paragraph": "text",
    "button": "cta",
  };
  if (typeRemap[blockType.toLowerCase()]) {
    blockType = typeRemap[blockType.toLowerCase()];
  }
  if (!VALID_BLOCK_TYPES.has(blockType)) {
    blockType = "text";
  }

  let settings = isPlainObject(block.settings) ? { ...block.settings } : {};

  // If block has heading/body at top level but no settings.text, build it
  if (!settings.text) {
    const heading = settings.heading || block.heading || block.title || "";
    const body = settings.body || settings.description || block.body || block.description || block.text || "";
    if (heading || body) {
      let html = "";
      if (heading) html += blockType === "feature" ? `<h4>${escapeHtml(heading)}</h4>` : `<h2>${escapeHtml(heading)}</h2>`;
      if (body) html += typeof body === "string" && body.trim().startsWith("<") ? body : `<p>${escapeHtml(body)}</p>`;
      settings.text = html;
    }
  }

  // Clean up non-standard settings keys
  delete settings.heading;
  delete settings.body;
  delete settings.description;
  delete settings.title;

  // Fix field name mismatches
  if (settings.btn_url && !settings.btn_action) { settings.btn_action = settings.btn_url; delete settings.btn_url; }
  if (settings.button_url && !settings.btn_action) { settings.btn_action = settings.button_url; delete settings.button_url; }
  if (settings.button_label && !settings.btn_text) { settings.btn_text = settings.button_label; delete settings.button_label; }
  if (settings.button_text && !settings.btn_text) { settings.btn_text = settings.button_text; delete settings.button_text; }
  if (settings.image_link && !settings.img_action) { settings.img_action = settings.image_link; delete settings.image_link; }

  // Ensure width has a default
  if (!settings.width) settings.width = "12";

  return { type: blockType, settings };
}

// ── Intent classification ──

type SectionIntent = 'hero' | 'stats' | 'feature-grid' | 'testimonial-band' | 'cta-band' | 'content-media-split' | 'footer' | 'heading-separator' | 'content';

function classifySectionIntent(section: any): SectionIntent {
  const type = String(section?.type || '').toLowerCase();
  const heading = String(section?.heading || '').toLowerCase();
  const hasItems = Array.isArray(section?.items) && section.items.length > 0;
  const hasBody = typeof section?.body === 'string' && section.body.length > 20;
  const hasCta = typeof section?.ctaText === 'string' && section.ctaText.trim().length > 0;

  if (type === 'hero') return 'hero';
  if (type === 'testimonials' || heading.includes('testimonial') || heading.includes('what our') || heading.includes('reviews')) return 'testimonial-band';
  if (heading.includes('footer') || type === 'footer') return 'footer';
  if ((type === 'cta' || heading.includes('ready to') || heading.includes('get started') || heading.includes('sign up')) && !hasItems) return 'cta-band';
  if (type === 'features' || heading.includes('feature') || heading.includes('program') || heading.includes('course') || heading.includes('service')) return 'feature-grid';
  if (hasItems && !hasCta) return 'feature-grid';
  if (heading.includes('stat') || heading.includes('number') || heading.includes('impact') || heading.includes('result')) return 'stats';
  if (type === 'content' && !hasBody && !hasItems && !hasCta) return 'heading-separator';
  if (section?.image || heading.includes('about')) return 'content-media-split';
  if (hasCta && !hasItems) return 'cta-band';
  return 'content';
}

// (Fallback functions removed — AI must always produce real sections)

// ── Helpers ──

function findSectionSourceContext(sourceFiles: SourceFiles, section: any): string {
  const keywords = [section.type, section.heading].map(s => String(s || "").toLowerCase()).filter(Boolean);
  const allFiles = { ...sourceFiles.components, ...sourceFiles.pages };
  const snippets: string[] = [];

  for (const [path, content] of Object.entries(allFiles || {})) {
    const lower = path.toLowerCase() + " " + (content || "").toLowerCase();
    if (keywords.some(kw => kw && lower.includes(kw))) {
      snippets.push(`### ${path}\n\`\`\`tsx\n${trimText(stripImports(content), 1200)}\n\`\`\``);
    }
  }
  if (snippets.length === 0) {
    for (const [path, content] of Object.entries(sourceFiles.pages || {}).slice(0, 1)) {
      snippets.push(`### ${path}\n\`\`\`tsx\n${trimText(stripImports(content), 1200)}\n\`\`\``);
    }
  }
  return snippets.join("\n\n") || "No matching source code found.";
}

function buildRelevantSourceContext(sourceFiles: SourceFiles) {
  const snippets: string[] = [];
  const pages = Object.entries(sourceFiles.pages || {}).slice(0, 3);
  const components = Object.entries(sourceFiles.components || {})
    .sort(([a], [b]) => prioritizeFile(a) - prioritizeFile(b) || a.localeCompare(b))
    .slice(0, 8);
  for (const [path, content] of [...pages, ...components]) {
    snippets.push(`### ${path}\n\`\`\`tsx\n${trimText(stripImports(content), 1400)}\n\`\`\``);
  }
  return snippets.join("\n\n");
}

function prioritizeFile(path: string) {
  const lower = path.toLowerCase();
  if (lower.includes("hero")) return 0;
  if (lower.includes("stat")) return 1;
  if (lower.includes("course") || lower.includes("program")) return 2;
  if (lower.includes("testimonial")) return 3;
  if (lower.includes("cta")) return 4;
  if (lower.includes("footer")) return 5;
  return 10;
}

function trimText(value: unknown, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) return "N/A";
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}\n...`;
}

function stripImports(value: string) {
  return value.replace(/^import[^\n]*\n/gm, "").trim();
}

function normalizeIdArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value.replace(/'/g, '"'));
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return Array.from(value.matchAll(/[A-Za-z0-9_-]+/g), (m) => m[0]).filter(Boolean);
  }
}

function createNumericId() {
  return String(Math.floor(1000000000000 + Math.random() * 9000000000000));
}

function remapBlockIds(section: any) {
  if (!isPlainObject(section?.blocks)) return section;
  const remapped: Record<string, any> = {};
  const order = Array.isArray(section.block_order) ? section.block_order : Object.keys(section.blocks);
  const idMap = new Map<string, string>();

  for (const rawId of order.map((id: unknown) => String(id))) {
    const nextId = /^\d{13}$/.test(rawId) ? rawId : createNumericId();
    if (rawId in section.blocks) { remapped[nextId] = section.blocks[rawId]; idMap.set(rawId, nextId); }
  }
  for (const [rawId, block] of Object.entries(section.blocks)) {
    if (idMap.has(rawId)) continue;
    const nextId = /^\d{13}$/.test(rawId) ? rawId : createNumericId();
    remapped[nextId] = block; idMap.set(rawId, nextId);
  }

  section.blocks = remapped;
  section.block_order = Array.from(idMap.values());
  return section;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
