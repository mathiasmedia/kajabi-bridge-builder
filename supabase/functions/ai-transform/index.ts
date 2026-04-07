const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

type SourceFiles = {
  indexCss?: string;
  tailwindConfig?: string;
  components?: Record<string, string>;
  pages?: Record<string, string>;
};

type ExtractedSection = {
  type?: string;
  heading?: string;
  body?: string;
  ctaText?: string;
  items?: Array<{ heading?: string; body?: string }>;
};

type ThemeStructure = {
  sections?: Record<string, any>;
  content_for_index?: unknown;
  [key: string]: unknown;
};

type TransformPayload = {
  operations?: any[];
  cssOverrides?: string;
};

type PlanAnalysis = {
  needsRepair: boolean;
  renderableSectionIds: string[];
  missingContentSectionIds: string[];
  addSectionCount: number;
  expectedSectionCount: number;
  hiddenExistingContentCount: number;
  reason: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const {
      sourceFiles = {},
      extractedDesign = {},
      themeStructure = {},
      availableSectionTypes = [],
    } = await req.json();

    const expectedSections = getExpectedSections(extractedDesign?.sections ?? []);
    const sectionTypesList = (availableSectionTypes || []).join(", ");

    const baseUserPrompt = buildUserPrompt(
      sourceFiles,
      extractedDesign,
      themeStructure,
      sectionTypesList,
      expectedSections,
    );

    const initialResult = await requestTransform({
      apiKey: LOVABLE_API_KEY,
      model: "google/gemini-2.5-pro",
      systemPrompt: buildSystemPrompt(sectionTypesList, expectedSections),
      userPrompt: baseUserPrompt,
      maxTokens: 12000,
    });

    console.log("ai-transform initial finish reason", initialResult.finishReason ?? "unknown");

    let parsed = normalizeTransformPayload(initialResult.parsed, availableSectionTypes);
    let analysis = analyzePlan(parsed.operations ?? [], themeStructure, expectedSections);

    if (shouldRepairPlan(initialResult.finishReason, analysis)) {
      console.warn("ai-transform repairing incomplete plan", JSON.stringify(analysis));

      const repairResult = await requestTransform({
        apiKey: LOVABLE_API_KEY,
        model: "openai/gpt-5-mini",
        systemPrompt: buildRepairSystemPrompt(sectionTypesList, expectedSections, analysis),
        userPrompt: buildRepairUserPrompt(baseUserPrompt, parsed, analysis, expectedSections),
        maxTokens: 14000,
      });

      console.log("ai-transform repair finish reason", repairResult.finishReason ?? "unknown");

      parsed = normalizeTransformPayload(repairResult.parsed, availableSectionTypes);
      analysis = analyzePlan(parsed.operations ?? [], themeStructure, expectedSections);

      if (shouldRepairPlan(repairResult.finishReason, analysis)) {
        console.error("ai-transform unable to produce complete plan", JSON.stringify(analysis));
        return jsonResponse(
          {
            error: "AI returned an incomplete transformation plan. Please retry.",
            details: analysis,
          },
          500,
        );
      }
    }

    return jsonResponse(parsed);
  } catch (e) {
    console.error("ai-transform error:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requestTransform({
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  maxTokens,
}: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
}) {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: maxTokens,
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
                cssOverrides: {
                  type: "string",
                  description: "CSS string with @import and all overrides",
                },
              },
              required: ["operations", "cssOverrides"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "apply_transformations" } },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("AI gateway error:", response.status, errText);
    if (response.status === 429) {
      throw new Error("Rate limited, please try again shortly.");
    }
    if (response.status === 402) {
      throw new Error("Credits exhausted. Add funds in Settings > Workspace > Usage.");
    }
    throw new Error(`AI gateway returned ${response.status}: ${errText}`);
  }

  const aiResult = await response.json();
  const parsed = parseAiResponse(aiResult);

  return {
    parsed,
    finishReason: aiResult.choices?.[0]?.finish_reason ?? null,
  };
}

function parseAiResponse(aiResult: any): TransformPayload {
  const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

  if (toolCall?.function?.arguments) {
    try {
      return JSON.parse(toolCall.function.arguments);
    } catch {
      console.error("Failed to parse tool call args:", toolCall.function.arguments.slice(0, 500));
      throw new Error("AI returned invalid tool call JSON");
    }
  }

  let content = aiResult.choices?.[0]?.message?.content || "";
  content = content.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();

  try {
    return JSON.parse(content);
  } catch {
    console.error("Failed to parse AI response:", content.slice(0, 500));
    throw new Error("AI returned invalid JSON");
  }
}

function normalizeTransformPayload(parsed: TransformPayload, availableSectionTypes: string[]): Required<TransformPayload> {
  const validTypes = new Set(availableSectionTypes || []);
  const operations = Array.isArray(parsed?.operations) ? parsed.operations : [];
  const cssOverrides = typeof parsed?.cssOverrides === "string" ? parsed.cssOverrides : "";

  const normalizedOperations = operations.filter((op: any) => {
    if (!op || typeof op.type !== "string") return false;

    if (op.type === "updateNavigation") {
      console.warn("Stripped updateNavigation op (link_lists incompatible)");
      return false;
    }

    if (op.type === "updateGlobalSetting" && typeof op.key === "string") {
      if (op.key.startsWith("content_for_")) {
        op.value = normalizeIdArray(op.value);
      }

      if (op.key === "block_order") {
        op.value = normalizeIdArray(op.value);
      }
    }

    if (op.type === "addSection") {
      if (!/^\d{13}$/.test(String(op.sectionId || ""))) {
        op.sectionId = createNumericId();
      }

      op.section = remapSectionBlockIds(op.section);

      if (!hasCompleteSection(op.section)) {
        console.warn("Stripped incomplete addSection op");
        return false;
      }

      if (validTypes.size > 0 && !validTypes.has(op.section.type)) {
        console.warn(`Stripped addSection with invalid type: ${op.section.type}`);
        return false;
      }

      op.section.block_order = Array.isArray(op.section.block_order)
        ? op.section.block_order.map((id: unknown) => String(id))
        : Object.keys(op.section.blocks || {});

      op.section.blocks = isPlainObject(op.section.blocks) ? op.section.blocks : {};

      for (const blockId of Object.keys(op.section.blocks)) {
        const block = op.section.blocks[blockId];
        if (!isPlainObject(block) || typeof block.type !== "string" || !isPlainObject(block.settings)) {
          delete op.section.blocks[blockId];
        }
      }

      op.section.block_order = op.section.block_order.filter((id: string) => id in op.section.blocks);

      if (op.section.block_order.length === 0 || Object.keys(op.section.blocks).length === 0) {
        console.warn("Stripped addSection with empty block definitions");
        return false;
      }
    }

    if (op.type === "addBlock") {
      if (!/^\d{13}$/.test(String(op.blockId || ""))) {
        op.blockId = createNumericId();
      }

      if (!isPlainObject(op.block) || typeof op.block.type !== "string" || !isPlainObject(op.block.settings)) {
        console.warn("Stripped incomplete addBlock op");
        return false;
      }
    }

    return true;
  });

  return { operations: normalizedOperations, cssOverrides };
}

function analyzePlan(
  operations: any[],
  themeStructure: ThemeStructure,
  expectedSections: ExtractedSection[],
): PlanAnalysis {
  const existingSections = isPlainObject(themeStructure.sections) ? structuredClone(themeStructure.sections) : {};
  const originalContentIds = normalizeIdArray(themeStructure.content_for_index);
  let contentIds = [...originalContentIds];
  let hiddenExistingContentCount = 0;

  for (const op of operations) {
    if (!op || typeof op.type !== "string") continue;

    if (op.type === "hideSection" && originalContentIds.includes(op.sectionId)) {
      hiddenExistingContentCount += 1;
      if (existingSections[op.sectionId]) {
        existingSections[op.sectionId].hidden = "true";
      }
    }

    if (op.type === "showSection" && existingSections[op.sectionId]) {
      existingSections[op.sectionId].hidden = "false";
    }

    if (op.type === "addSection" && hasCompleteSection(op.section)) {
      existingSections[op.sectionId] = {
        ...op.section,
        hidden: "false",
      };
      if (!contentIds.includes(op.sectionId)) {
        contentIds.push(op.sectionId);
      }
    }

    if (op.type === "updateGlobalSetting" && op.key === "content_for_index") {
      contentIds = normalizeIdArray(op.value);
    }
  }

  const missingContentSectionIds = contentIds.filter((id) => !existingSections[id]);
  const renderableSectionIds = contentIds.filter((id) => {
    const section = existingSections[id];
    return section && String(section.hidden ?? "false") !== "true";
  });

  const addSectionCount = operations.filter((op) => op?.type === "addSection").length;
  const heroOnly = expectedSections.length > 0 && renderableSectionIds.length <= 1;
  const noNewSections = expectedSections.length > 0 && addSectionCount === 0 && hiddenExistingContentCount > 0;
  const brokenReferences = missingContentSectionIds.length > 0;

  return {
    needsRepair: heroOnly || noNewSections || brokenReferences,
    renderableSectionIds,
    missingContentSectionIds,
    addSectionCount,
    expectedSectionCount: expectedSections.length,
    hiddenExistingContentCount,
    reason: brokenReferences
      ? "content_for_index references sections that were never defined"
      : heroOnly
        ? "plan only renders the hero section"
        : noNewSections
          ? "plan hides content sections without adding replacements"
          : "ok",
  };
}

function shouldRepairPlan(finishReason: string | null, analysis: PlanAnalysis) {
  return finishReason === "length" || finishReason === "max_tokens" || analysis.needsRepair;
}

function buildUserPrompt(
  sourceFiles: SourceFiles,
  extractedDesign: any,
  themeStructure: ThemeStructure,
  sectionTypesList: string,
  expectedSections: ExtractedSection[],
) {
  return `## Source design system
### index.css
\`\`\`css
${trimText(sourceFiles.indexCss, 1800)}
\`\`\`

### tailwind.config.ts
\`\`\`ts
${trimText(sourceFiles.tailwindConfig, 800)}
\`\`\`

## Source page/component snippets
${buildRelevantSourceContext(sourceFiles)}

## Extracted design summary
${JSON.stringify({
  headingFont: extractedDesign?.headingFont,
  bodyFont: extractedDesign?.bodyFont,
  colors: extractedDesign?.colors,
  header: extractedDesign?.header,
  hero: extractedDesign?.hero,
  sections: extractedDesign?.sections,
  footer: extractedDesign?.footer,
  assets: extractedDesign?.assets,
}, null, 2)}

## Required non-hero content sections
${JSON.stringify(expectedSections, null, 2)}

## Kajabi theme structure
${JSON.stringify(themeStructure, null, 2)}

## Available section types
${sectionTypesList}

Return transformation operations and cssOverrides that make the Kajabi theme match the source closely.
Every non-hero section in the extracted design must be rendered in the final page.
Do not reference a new section ID in content_for_index unless you also define it with addSection.`;
}

function buildRepairUserPrompt(
  baseUserPrompt: string,
  partialPlan: Required<TransformPayload>,
  analysis: PlanAnalysis,
  expectedSections: ExtractedSection[],
) {
  return `${baseUserPrompt}

## Previous attempt failed
- Reason: ${analysis.reason}
- Renderable section IDs: ${JSON.stringify(analysis.renderableSectionIds)}
- Missing section IDs: ${JSON.stringify(analysis.missingContentSectionIds)}
- addSection count: ${analysis.addSectionCount}
- Expected additional sections: ${analysis.expectedSectionCount}

## Sections that still must exist after the hero
${JSON.stringify(expectedSections, null, 2)}

## Previous partial operations
${JSON.stringify(partialPlan.operations.slice(0, 40), null, 2)}

Return a FULL replacement plan, not a patch.
Your new response must include all required addSection operations before content_for_index references those IDs.`;
}

function buildSystemPrompt(sectionTypesList: string, expectedSections: ExtractedSection[]) {
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

CRITICAL OUTPUT RULES:
- Return ONE complete plan only.
- Never return a partial plan.
- Never output content_for_index IDs unless those sections already exist in the theme or are defined in addSection operations in the same response.
- The final page must render hero + ${expectedSections.length} additional sections from the source design.
- If the source contains stats, programs, testimonials, and CTA, all of them must appear in the final plan.

COMPLETE addSection EXAMPLE:
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
    "block_order": ["1718825317501","1718825317502"],
    "blocks": {
      "1718825317501": {
        "type": "text_column",
        "settings": {"heading":"2,400+","text":"<p>Graduates Certified</p>","text_align":"center"}
      },
      "1718825317502": {
        "type": "text_column",
        "settings": {"heading":"27","text":"<p>Years Teaching</p>","text_align":"center"}
      }
    }
  }
}

ID FORMAT:
- Section IDs: 13-digit numeric-only strings.
- Block IDs: 13-digit numeric-only strings.

DATA FORMAT:
- content_for_index must be a real JSON array.
- padding_desktop/padding_mobile must be objects, not strings.
- Do not emit updateNavigation operations.

SECTION TYPE CONSTRAINT:
addSection type MUST be one of: ${sectionTypesList}
Map source content to the closest available type.

CONTENT RULES:
- Use actual source text.
- No placeholder copy.
- No external image URLs.
- Use rich HTML for text blocks.

CSS RULES:
- Put global CSS in cssOverrides.
- Match typography, spacing, section backgrounds, CTA, testimonial cards, and buttons.
- Use !important on all overrides when needed.

GOAL: the exported Kajabi theme must visually and structurally match the source site, not just the hero.`;
}

function buildRepairSystemPrompt(sectionTypesList: string, expectedSections: ExtractedSection[], analysis: PlanAnalysis) {
  return `You are repairing an incomplete Kajabi transformation plan.

The previous plan failed because: ${analysis.reason}.
It rendered ${analysis.renderableSectionIds.length} content sections, but the source requires hero + ${expectedSections.length} additional sections.

You must return a COMPLETE replacement plan with operations and cssOverrides.

Repair rules:
- Define every new section with addSection before referencing its ID in content_for_index.
- Do not hide existing content sections unless replacements are present.
- Ensure content_for_index renders multiple sections, not hero-only.
- Use only allowed section types: ${sectionTypesList}.
- Do not use external image URLs.
- Keep IDs 13-digit numeric strings.
- Return only the tool call payload.`;
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

function getExpectedSections(sections: ExtractedSection[]) {
  return (Array.isArray(sections) ? sections : []).filter((section) => {
    const heading = (section.heading || "").toLowerCase();
    return section.type !== "hero" && !heading.includes("footer");
  });
}

function trimText(value: unknown, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) return "N/A";
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}\n...`;
}

function stripImports(value: string) {
  return value.replace(/^import[^\n]*\n/gm, "").trim();
}

function normalizeIdArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value.replace(/'/g, '"'));
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item).trim()).filter(Boolean)
      : [];
  } catch {
    return Array.from(value.matchAll(/[A-Za-z0-9_-]+/g), (match) => match[0]).filter(Boolean);
  }
}

function createNumericId() {
  return String(Math.floor(1000000000000 + Math.random() * 9000000000000));
}

function remapSectionBlockIds(section: any) {
  if (!isPlainObject(section) || !isPlainObject(section.blocks)) return section;

  const remappedBlocks: Record<string, any> = {};
  const order = Array.isArray(section.block_order) ? section.block_order : Object.keys(section.blocks);
  const idMap = new Map<string, string>();

  for (const rawId of order.map((id: unknown) => String(id))) {
    const nextId = /^\d{13}$/.test(rawId) ? rawId : createNumericId();
    if (rawId in section.blocks) {
      remappedBlocks[nextId] = section.blocks[rawId];
      idMap.set(rawId, nextId);
    }
  }

  for (const [rawId, block] of Object.entries(section.blocks)) {
    if (idMap.has(rawId)) continue;
    const nextId = /^\d{13}$/.test(rawId) ? rawId : createNumericId();
    remappedBlocks[nextId] = block;
    idMap.set(rawId, nextId);
  }

  section.blocks = remappedBlocks;
  section.block_order = Array.from(idMap.values());
  return section;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasCompleteSection(section: any) {
  return Boolean(
    isPlainObject(section) &&
      typeof section.type === "string" &&
      section.type.trim().length > 0 &&
      isPlainObject(section.settings) &&
      Array.isArray(section.block_order) &&
      isPlainObject(section.blocks),
  );
}