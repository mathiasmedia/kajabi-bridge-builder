import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { planJson, extractedDesign, sourceProjectName, customPrompt } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const isCustom = !!customPrompt;

    const systemPrompt = isCustom
      ? `You are a Kajabi theme export expert. A user is asking a specific question about their theme export. Answer concisely and specifically based on the transformation plan and extracted design data provided.

Format your response as JSON:
{
  "score": 0,
  "summary": "your detailed answer here",
  "issues": [],
  "patterns": [],
  "improvements": []
}`
      : `You are a Kajabi theme export quality reviewer. You analyze transformation plans that convert Lovable React sites into Kajabi theme configurations.

Your job is to:
1. **Critique** — identify issues, missing content, wrong colors, broken layouts, CSS conflicts
2. **Suggest improvements** — specific, actionable fixes for the transformation planner
3. **Rate** the export quality on a 1-10 scale
4. **Extract patterns** — note what worked well that should be reused in future exports

Focus on:
- Color consistency (do button colors match the brand?)
- Typography mapping (are fonts correct?)
- Section structure (are blocks using correct types and widths?)
- CSS override quality (are selectors specific enough? any global bleed?)
- Content fidelity (does the export match the source site's content?)
- Block settings (own_row, width, padding, etc.)

Format your response as JSON with these fields:
{
  "score": number (1-10),
  "summary": "1-2 sentence overall assessment",
  "issues": [{"severity": "critical|warning|minor", "description": "...", "fix": "..."}],
  "patterns": [{"name": "...", "description": "...", "example": "..."}],
  "improvements": ["specific suggestion 1", "specific suggestion 2"]
}`;

    const userPrompt = isCustom
      ? `**User Question:** ${customPrompt}

**Source Project:** ${sourceProjectName || 'Unknown'}

**Extracted Design:**
${JSON.stringify(extractedDesign, null, 2).slice(0, 4000)}

**Transformation Plan (${planJson?.operations?.length || 0} operations):**
${JSON.stringify(planJson, null, 2).slice(0, 12000)}

Answer the user's specific question based on this data.`
      : `Analyze this Kajabi theme export:

**Source Project:** ${sourceProjectName || 'Unknown'}

**Extracted Design:**
${JSON.stringify(extractedDesign, null, 2).slice(0, 4000)}

**Transformation Plan (${planJson?.operations?.length || 0} operations):**
${JSON.stringify(planJson, null, 2).slice(0, 12000)}

Provide your critique as JSON.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
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
        return new Response(JSON.stringify({ error: "Credits exhausted — add funds in Settings > Workspace > Usage" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", status, text);
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Try to parse JSON from the response
    let critique;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      critique = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: content, score: 0, issues: [], patterns: [], improvements: [] };
    } catch {
      critique = { summary: content, score: 0, issues: [], patterns: [], improvements: [] };
    }

    return new Response(JSON.stringify(critique), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("critique error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
