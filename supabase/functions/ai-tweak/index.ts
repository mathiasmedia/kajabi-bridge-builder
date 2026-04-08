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
    const { planJson, extractedDesign, tweakInstruction, imageBase64 } = await req.json();

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
        // Only send section name and id, not the full block content
        return {
          _index: i,
          type: op.type,
          label: op.label,
          sectionId: op.sectionId,
          sectionName: op.section?.name,
          blockCount: op.section?.block_order?.length || 0,
          settings: op.section?.settings,
        };
      }
      return { _index: i, ...op };
    });

    const systemPrompt = `You are a Kajabi theme editor. You receive an existing transformation plan and a tweak instruction. Return ONLY the changes needed as patches.

${imageBase64 ? `## IMAGE ANALYSIS
An image is attached. Analyze colors, fonts, layout, and text precisely. Apply changes to match.` : ''}

## KAJABI HTML STRUCTURE
All sections render via section.liquid with this HTML:
- Section wrapper: \`#section-{sectionId} > section.section > .sizer > .section__overlay + .container > .row\`
- Background color is on \`.section__overlay\` (absolute positioned)
- Padding is on \`.sizer\`
- Blocks: \`#block-{blockId}.block-type--{type}.col-{width} > .block\`
- Text blocks render HTML directly inside \`.block\`
- Feature blocks: \`.feature > .feature__image + .feature__text\`
- Feature icon blocks: \`.feature > .feature-icon + .feature__text\`
- Buttons: \`.btn.btn--{size}.btn--{style}\`
- NEVER use made-up classes like .hero__heading, .text-column__heading
- Target real classes: .section, .sizer, .container, .block, .btn, .feature

## PATCH FORMAT
Return a JSON object with these optional arrays:

{
  "modify": [
    { "index": 0, "changes": { "value": "new value" } }
  ],
  "add": [
    { "type": "updateSectionSetting", "sectionId": "header", "key": "text_color", "value": "#fff", "label": "Header text white" }
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
- Keep patches minimal — only change what the tweak instruction asks for
- Do NOT return unchanged operations
- CSS selectors MUST use real Kajabi classes (see HTML structure above)

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

    const textPart = `## Current Plan Summary (${operations.length} operations)
${opSummary}

## Operation Details
${JSON.stringify(compactOps).slice(0, 10000)}

## Design Context
Colors: ${JSON.stringify(extractedDesign?.colors?.slice(0, 6))}
Fonts: heading="${extractedDesign?.headingFont}", body="${extractedDesign?.bodyFont}"

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

    // Use OpenAI GPT-4o for image tweaks if available, otherwise Gemini
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const useOpenAI = imageBase64 && OPENAI_API_KEY;
    
    const apiUrl = useOpenAI 
      ? "https://api.openai.com/v1/chat/completions"
      : "https://ai.gateway.lovable.dev/v1/chat/completions";
    const apiKey = useOpenAI ? OPENAI_API_KEY : LOVABLE_API_KEY;
    const model = useOpenAI ? "gpt-4o" : (imageBase64 ? "google/gemini-2.5-flash" : "google/gemini-2.5-flash");

    console.log(`Tweak using ${model}${useOpenAI ? ' (OpenAI)' : ' (Lovable AI)'}`);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
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
