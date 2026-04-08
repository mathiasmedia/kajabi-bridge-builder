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
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const operations = planJson?.operations || [];

    const systemPrompt = `You are a Kajabi theme export editor. You receive an existing transformation plan (a list of operations) and a tweak instruction. Your job is to return a MODIFIED version of the operations array with the requested changes applied.

If an image is attached, analyze it carefully — the user may want you to match colors, layout, typography, or other design elements from the image and apply them to the Kajabi theme.

RULES:
- Return the COMPLETE operations array, not just the changed ones
- You can modify existing operations (change values, settings, CSS)
- You can add new operations
- You can remove operations (by omitting them)
- Keep all unchanged operations exactly as-is
- For CSS tweaks, find the addCssOverride operation and modify its css string
- For color changes, find the relevant updateGlobalSetting/updateSectionSetting/updateBlockSetting and change the value
- For block settings like own_row, width, padding — find the addBlock or updateBlockSetting op and modify it
- For text changes, find the replaceText operation and modify the value

OPERATION TYPES:
- updateGlobalSetting: { type, key, value, label }
- updateSectionSetting: { type, sectionId, key, value, label }
- updateBlockSetting: { type, sectionId, blockId, key, value, label }
- replaceText: { type, sectionId, blockId, key:"text", value:"<html>", label }
- hideSection / showSection: { type, sectionId }
- addCssOverride: { type, css, label }
- updateNavigation: { type, menuId, links:[{name,url}] }
- addSection: { type, sectionId, section:{type,settings,blocks,block_order}, label }
- addBlock: { type, sectionId, blockId, block:{type,settings}, label }

Return ONLY valid JSON: { "operations": [...], "changelog": "brief description of what changed" }`;

    // Build user message content — text or multimodal with image
    let userContent: any;
    const textPart = `## Current Plan (${operations.length} operations)
${JSON.stringify(operations, null, 2).slice(0, 20000)}

## Extracted Design Summary
Colors: ${JSON.stringify(extractedDesign?.colors?.slice(0, 6), null, 2)}
Fonts: heading="${extractedDesign?.headingFont}", body="${extractedDesign?.bodyFont}"

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again shortly" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      result = null;
    }

    if (!result?.operations || !Array.isArray(result.operations)) {
      return new Response(JSON.stringify({ error: "AI did not return valid operations", raw: content.slice(0, 500) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
