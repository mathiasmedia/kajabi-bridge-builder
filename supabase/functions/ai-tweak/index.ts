import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { planJson, extractedDesign, tweakInstruction, imageBase64 } = await req.json();

    if (!tweakInstruction) {
      return new Response(JSON.stringify({ error: "tweakInstruction is required" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const operations = planJson?.operations || [];

    const systemPrompt = `You are a Kajabi theme editor focused on PIXEL-PERFECT visual matching. You receive an existing transformation plan and a tweak instruction (often with a reference image). Return a MODIFIED version of the operations array.

${imageBase64 ? `## IMAGE ANALYSIS (CRITICAL)
An image is attached. Analyze it with extreme precision:
1. Extract EXACT hex colors for every distinct color visible (backgrounds, text, accents, buttons, borders)
2. Identify font families (match to closest Google Font) and note sizes/weights
3. Map the visual layout section-by-section from top to bottom
4. Read ALL visible text verbatim — reproduce it exactly
5. Note spacing patterns, border-radius, shadows, gradients
6. Compare the image against the current plan and make the plan match the image` : ''}

## RULES
- Return the COMPLETE operations array, not just changed ones
- You can modify, add, or remove operations
- Keep unchanged operations exactly as-is
- For CSS changes: find addCssOverride and modify/extend its css string
- For color changes: update the relevant setting operations AND the CSS override
- The addCssOverride is your most powerful tool — use it for precise visual control
- When matching an image, prioritize: exact colors > exact text > layout > spacing > typography

## OPERATION TYPES
- updateGlobalSetting: { type, key, value, label }
- updateSectionSetting: { type, sectionId, key, value, label }
- updateBlockSetting: { type, sectionId, blockId, key, value, label }
- replaceText: { type, sectionId, blockId, key:"text", value:"<html>", label }
- hideSection / showSection: { type, sectionId }
- addCssOverride: { type, css, label }
- updateNavigation: { type, menuId, links:[{name,url}] }
- addSection: { type, sectionId, section:{type,settings,blocks,block_order}, label }
- addBlock: { type, sectionId, blockId, block:{type,settings}, label }

## IMPORTANT
- Do NOT add sections that aren't requested or visible in the reference
- Do NOT duplicate existing sections
- When modifying, change existing operations rather than adding parallel ones
- Merge CSS changes into the existing addCssOverride rather than adding a second one

Return ONLY valid JSON: { "operations": [...], "changelog": "brief description of what changed" }`;

    let userContent: any;
    const planStr = JSON.stringify(operations).slice(0, 12000);
    const textPart = `## Current Plan (${operations.length} operations)
${planStr}

## Extracted Design Summary
Colors: ${JSON.stringify(extractedDesign?.colors?.slice(0, 8))}
Fonts: heading="${extractedDesign?.headingFont}", body="${extractedDesign?.bodyFont}"
Background: ${extractedDesign?.backgroundColor || 'unknown'}
Accent: ${extractedDesign?.accentColor || 'unknown'}

## Tweak Instruction
${tweakInstruction}

Apply the tweak and return the modified operations array as JSON.`;

    if (imageBase64) {
      userContent = [
        { type: "text", text: textPart },
        { type: "image_url", image_url: { url: imageBase64 } },
      ];
    } else {
      userContent = textPart;
    }

    // Use pro model when image is attached for better visual understanding
    const model = imageBase64 ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
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
      return new Response(JSON.stringify({ error: msg }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const finishReason = data.choices?.[0]?.finish_reason || "";
    let content = data.choices?.[0]?.message?.content || "";

    // Strip markdown fences
    content = content.replace(/^```(?:json)?\s*/im, "").replace(/```\s*$/im, "").trim();
    content = content.replace(/^'''(?:json)?\s*/im, "").replace(/'''\s*$/im, "").trim();

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
        error: truncated 
          ? "AI response was truncated — try a simpler tweak" 
          : "AI did not return valid operations", 
        raw: content.slice(0, 500) 
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      operations: result.operations,
      changelog: result.changelog || "Changes applied",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-tweak error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
