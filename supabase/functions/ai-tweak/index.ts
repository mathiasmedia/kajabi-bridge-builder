import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const respond = (body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { planJson, extractedDesign, tweakInstruction, imageBase64, baseSections, blockMap, visionDesign } = await req.json();

    if (!tweakInstruction) {
      return respond({ error: "tweakInstruction is required" });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const operations = planJson?.operations || [];

    // Build a compact summary of operations for AI context (index + type + label only)
    const opSummary = operations.map((op: any, i: number) => {
      const parts = [`[${i}] ${op.type}`];
      if (op.label) parts.push(op.label);
      if (op.sectionId) parts.push(`section:${op.sectionId}`);
      if (op.key) parts.push(`key:${op.key}`);
      // For CSS overrides, include a truncated version
      if (op.type === "addCssOverride" && op.css) {
        parts.push(`css:(${op.css.length} chars)`);
      }
      return parts.join(" | ");
    }).join("\n");

    // Only send full details of non-addSection operations (those are huge)
    const compactOps = operations.map((op: any, i: number) => {
      if (op.type === "addSection") {
        // Only send section name, id, and block names — not full block content
        const blockNames = op.section?.block_order || Object.keys(op.section?.blocks || {});
        return {
          _index: i,
          type: op.type,
          label: op.label,
          sectionId: op.sectionId,
          blockCount: blockNames.length,
          blockIds: blockNames,
          bgColor: op.section?.settings?.background_color,
        };
      }
      if (op.type === "addCssOverride") {
        return { _index: i, type: op.type, label: op.label, cssLen: op.css?.length || 0 };
      }
      const { _index: _ig, ...rest } = { _index: i, ...op };
      return { _index: i, ...rest };
    });

    // Build section map string for the prompt
    const sectionMapStr = baseSections && Object.keys(baseSections).length > 0
      ? Object.entries(baseSections).map(([id, name]) => `  - "${id}" → ${name}`).join("\n")
      : "  (no section map available — use generic selectors)";

    // Build block map string for replaceText operations
    let blockMapStr = "  (no block map available)";
    if (blockMap && Object.keys(blockMap).length > 0) {
      const lines: string[] = [];
      for (const [secId, blocks] of Object.entries(blockMap)) {
        const secName = baseSections?.[secId] || 'unknown';
        lines.push(`  Section "${secId}" (${secName}):`);
        (blocks as any[]).forEach((b: any) => {
          lines.push(`    blockId="${b.blockId}" type=${b.type} — "${b.textPreview}"`);
        });
      }
      blockMapStr = lines.join("\n");
    }

    const systemPrompt = `You are a Kajabi theme editor. You receive an existing transformation plan and a tweak instruction. Return ONLY the changes needed as patches.

${imageBase64 ? `## IMAGE ANALYSIS
An image is attached. Analyze it thoroughly:
1. Extract exact colors (backgrounds, text, buttons, accents)
2. Note typography styles (sizes, weights, colors per section)
3. Identify layout patterns
4. Match ALL visual elements — backgrounds, text colors, button styles, spacing
BE COMPREHENSIVE. Apply CSS overrides for every visual difference you detect. Do NOT be minimal — the goal is to make the template look like the image.` : ''}

## BASE THEME SECTIONS (index page)
These are the REAL section IDs in the base theme. Use these exact IDs in your CSS selectors and operations:
${sectionMapStr}

## BLOCK MAP (for replaceText operations)
Use these to target specific blocks when changing text content:
${blockMapStr}

## KAJABI HTML STRUCTURE
All sections render via section.liquid with this HTML:
- Section wrapper: \`#section-{sectionId} > section.section > .sizer > .section__overlay + .container > .row\`
- Background color is on \`.section__overlay\` (absolute positioned, covers section)
- Padding is on \`.sizer\`
- Blocks: \`#block-{blockId}.block-type--{type}.col-{width} > .block\`
- Text blocks render HTML directly inside \`.block\` (contains h1, h2, p tags)
- Feature blocks: \`.feature > .feature__image + .feature__text\`
- Feature icon blocks: \`.feature > .feature-icon + .feature__text\`
- Buttons: \`.btn.btn--{size}.btn--{style}\`
- NEVER use made-up classes like .hero__heading, .text-column__heading
- NEVER use made-up section IDs like "hero" — use the real numeric IDs listed above
- Target real classes: .section, .sizer, .container, .block, .btn, .feature
- To change text color per section: \`#section-{id} h1, #section-{id} h2, #section-{id} p { color: #xxx; }\`

## SECTION SETTINGS THAT WORK
These section settings are rendered via Liquid and actually affect the output:
- \`background_color\`: sets the .section__overlay background (e.g. "RGBA(22,30,42,0.86)" or "#10293E")
- \`bg_type\`: "none" | "color" | "image" | "video"
- \`padding_desktop\`: { top, bottom, left, right } in px
- \`padding_mobile\`: { top, bottom, left, right } in px
- \`full_width\`: boolean
- \`multiple_columns_on_desktop\`: "yes" | "no"
- \`column_one_width\`, \`column_two_width\`, \`column_three_width\`: desktop column widths
- \`multiple_column_gap\`: desktop column gap setting
- \`btn_background_color\`, \`btn_text_color\`, \`btn_border_radius\`, \`btn_style\`, \`btn_size\`

## BLOCK SETTINGS THAT WORK
- \`width\`: block width within Kajabi's row/grid
- \`block_column\`: "first" | "second" | "third"
- \`text_align\`, \`mobile_text_align\`

## PATCH FORMAT
Return a JSON object with these optional arrays:

{
  "modify": [
    { "index": 0, "changes": { "value": "new value" } }
  ],
  "add": [
    { "type": "addCssOverride", "css": "#section-1575400116835 h1 { color: #fff; }", "label": "Hero text white" }
  ],
  "remove": [3, 7],
  "replaceCss": "full new CSS string if CSS needs changing",
  "changelog": "brief description"
}

## PATCH RULES
- "modify": change specific fields of an existing operation by its index. Only include the fields that change.
- "add": add new operations (same format as operation types below)
- "remove": array of indices to remove
- "replaceCss": if the addCssOverride needs changes, provide the COMPLETE new CSS string. This replaces the existing one.
${imageBase64 ? '- When matching an image: be THOROUGH. Use addCssOverride for colors, fonts, spacing, button styles. Use replaceText for changing heading/body text content.' : '- Keep patches minimal — only change what the tweak instruction asks for'}
- Do NOT return unchanged operations
- CSS selectors MUST use real Kajabi classes and section IDs (see above)
- Prefer addCssOverride for visual styling — it's the most reliable way to change appearance
- If the tweak is about section layout or Kajabi builder settings, prefer modifying existing addSection operation settings/blocks rather than trying to fake it in CSS.

## LAYOUT / READABILITY RULES
- Default full_width to false. Only set full_width to true if the user explicitly requests a full-width section.
- If a heading introduces cards below it, keep them in the SAME section: heading block width "12", then card blocks width "4" each.
- For split content/image sections on desktop, use REAL Kajabi column settings:
  - section.settings.multiple_columns_on_desktop = "yes"
  - section.settings.column_one_width = "4"
  - section.settings.column_two_width = "4"
  - section.settings.full_width = false
  - left-side text and CTA blocks: width "12", block_column "first", text_align "left", mobile_text_align "left"
  - right-side image block: width "12", block_column "second"
- For light/white sections, use bg_type = "none" and remove section background_color instead of using barely-visible translucent backgrounds.
- NEVER use faint section backgrounds with near-zero alpha.
- On light sections, body text must be dark and readable. Never use very light or washed-out paragraph text.

## OPERATION TYPES (for "add")
- updateGlobalSetting: { type, key, value, label }
- updateSectionSetting: { type, sectionId, key, value, label }
- updateBlockSetting: { type, sectionId, blockId, key, value, label }
- replaceText: { type, sectionId, blockId, key:"text", value:"<html>", label }
- hideSection / showSection: { type, sectionId }
- addCssOverride: { type, css, label }
- updateNavigation: { type, menuId, links:[{name,url}] }
- addSection: { type, sectionId, section:{ type:"section", settings, blocks, block_order }, label }

Return ONLY valid JSON. No markdown fences.`;

    // Build vision design context if available
    const visionContext = visionDesign ? `
## VISION ANALYSIS (pre-extracted from screenshot)
Style: ${visionDesign.overallStyle || 'N/A'}
Colors: ${JSON.stringify(visionDesign.colors || {})}
Typography: ${JSON.stringify(visionDesign.typography || {})}
Sections: ${JSON.stringify(visionDesign.sections?.map((s: any) => ({ name: s.name, bg: s.bgColor })) || [])}
Text Content: ${JSON.stringify(visionDesign.textContent || {})}
Effects: ${JSON.stringify(visionDesign.effects || {})}
USE THESE EXACT VALUES for colors, fonts, and text. This is the ground truth from the screenshot.` : '';

    const textPart = `## Current Plan Summary (${operations.length} operations)
${opSummary}

## Operation Details
${JSON.stringify(compactOps).slice(0, 6000)}

## Design Context
Colors: ${JSON.stringify(extractedDesign?.colors?.slice(0, 6))}
Fonts: heading="${extractedDesign?.headingFont}", body="${extractedDesign?.bodyFont}"
${visionContext}

## Tweak Instruction
${tweakInstruction}`;

    let userContent: any;
    if (imageBase64) {
      userContent = [
        { type: "text", text: textPart },
        { type: "image_url", image_url: { url: imageBase64 } },
      ];
    } else {
      userContent = textPart;
    }

    // Always use Lovable AI gateway — supports images via Gemini
    const apiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
    const apiKey = LOVABLE_API_KEY;
    const model = imageBase64 ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash";

    console.log(`Tweak using ${model} (Lovable AI)`);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: imageBase64 ? 32768 : 16384,
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

    const data = await response.json();
    const finishReason = data.choices?.[0]?.finish_reason || "";
    let content = data.choices?.[0]?.message?.content || "";

    // Strip markdown fences
    content = content.replace(/^```(?:json)?\s*/im, "").replace(/```\s*$/im, "").trim();

    let patch;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      patch = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      patch = null;
    }

    if (!patch || (!patch.modify && !patch.add && !patch.remove && !patch.replaceCss)) {
      const truncated = finishReason === "length" || finishReason === "MAX_TOKENS";
      return respond({
        error: truncated
          ? "AI response was truncated — try a simpler tweak"
          : "AI did not return valid patches",
        raw: content.slice(0, 500),
      });
    }

    // Apply patches to operations
    let result = [...operations];

    // 1. Apply modifications
    if (patch.modify && Array.isArray(patch.modify)) {
      for (const mod of patch.modify) {
        const idx = mod.index;
        if (idx >= 0 && idx < result.length && mod.changes) {
          result[idx] = { ...result[idx], ...mod.changes };
        }
      }
    }

    // 2. Replace CSS if provided
    if (patch.replaceCss && typeof patch.replaceCss === "string") {
      const cssIdx = result.findIndex((op: any) => op.type === "addCssOverride");
      if (cssIdx >= 0) {
        result[cssIdx] = { ...result[cssIdx], css: patch.replaceCss };
      } else {
        result.push({ type: "addCssOverride", css: patch.replaceCss, label: "AI CSS override" });
      }
    }

    // 3. Remove operations (process in reverse to maintain indices)
    if (patch.remove && Array.isArray(patch.remove)) {
      const sortedRemoves = [...patch.remove].sort((a: number, b: number) => b - a);
      for (const idx of sortedRemoves) {
        if (idx >= 0 && idx < result.length) {
          result.splice(idx, 1);
        }
      }
    }

    // 4. Add new operations
    if (patch.add && Array.isArray(patch.add)) {
      result.push(...patch.add);
    }

    return respond({
      operations: result,
      changelog: patch.changelog || "Changes applied",
    });
  } catch (e) {
    console.error("ai-tweak error:", e);
    return respond({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});
