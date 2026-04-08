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

type ThemeStructure = {
  sections?: Record<string, any>;
  content_for_index?: unknown;
  [key: string]: unknown;
};

type TransformPayload = {
  operations?: any[];
  cssOverrides?: string;
};

// ── Entry ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json();
    const step: string = body.step || "globals"; // "globals" | "section"

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

// ── Step 1: Globals (header, footer, colors, fonts, hero updates, CSS) ──

async function handleGlobalsStep(apiKey: string, body: any) {
  const {
    sourceFiles = {},
    extractedDesign = {},
    themeStructure = {},
    availableSectionTypes = [],
  } = body;

  const sectionTypesList = availableSectionTypes.join(", ");

  const systemPrompt = `You are an expert web-to-Kajabi theme transformer.

You receive source React/Tailwind files, extracted design tokens, and the Kajabi theme structure.
In THIS step you handle ONLY: global settings (colors, fonts), header updates, footer updates, hero section updates, and CSS overrides.
Do NOT add new sections in this step. Do NOT output addSection operations.

OPERATION TYPES (allowed in this step):
- updateGlobalSetting: { type, key, value, label }
- updateSectionSetting: { type, sectionId, key, value, label }
- updateBlockSetting: { type, sectionId, blockId, key, value, label }
- replaceText: { type, sectionId, blockId, key:"text", value:"<html>", label }
- hideSection: { type, sectionId }
- showSection: { type, sectionId }
- addCssOverride: { type, css, label }

ID FORMAT: 13-digit numeric-only strings.
DATA FORMAT:
- padding_desktop/padding_mobile must be objects, not strings.
- Do not emit updateNavigation operations.

CSS RULES:
- Put all global CSS in cssOverrides (fonts @import, color overrides, typography, spacing, buttons, cards).
- Match the source design closely.
- Use !important when needed.

CONTENT RULES:
- Use actual source text, no placeholders.
- No external image URLs.

Focus on making header, footer, hero, and global styling match the source site.`;

  const userPrompt = `## Source design system
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
    footer: extractedDesign?.footer,
    buttonStyle: extractedDesign?.buttonStyle,
  }, null, 2)}

## Kajabi theme structure
${JSON.stringify(themeStructure, null, 2)}

Return transformation operations for global settings, header, footer, hero, and CSS overrides.
Do NOT include any addSection operations.`;

  const result = await requestTransform({
    apiKey,
    model: "google/gemini-3-flash-preview",
    systemPrompt,
    userPrompt,
    maxTokens: 8000,
  });

  console.log(`ai-transform [globals] finish_reason=${result.finishReason ?? "unknown"}`);

  const parsed = normalizeTransformPayload(result.parsed, availableSectionTypes);

  // Strip any addSection ops that snuck through
  parsed.operations = parsed.operations.filter((op: any) => op.type !== "addSection");

  if (parsed.operations.length === 0 && !parsed.cssOverrides) {
    return jsonResponse({ error: "AI returned no valid global operations. Please retry." }, 500);
  }

  return jsonResponse({
    operations: parsed.operations,
    cssOverrides: parsed.cssOverrides,
  });
}

// ── Step 2: Single section generation ──────────────────────────────────

async function handleSectionStep(apiKey: string, body: any) {
  const {
    sourceFiles = {},
    extractedDesign = {},
    themeStructure = {},
    availableSectionTypes = [],
    sectionToGenerate, // The extracted section to create
    existingOperations = [], // Operations from globals step + previous sections
  } = body;

  if (!sectionToGenerate) {
    return jsonResponse({ error: "sectionToGenerate is required for section step" }, 400);
  }

  const sectionTypesList = availableSectionTypes.join(", ");

  // Find source component content relevant to this section
  const sectionContext = findSectionSourceContext(sourceFiles, sectionToGenerate);

  const systemPrompt = `You are an expert web-to-Kajabi theme transformer.

In THIS step you create exactly ONE new Kajabi section that matches a specific source section.
You MUST output exactly ONE addSection operation.

OPERATION TYPES (allowed in this step):
- addSection: { type, sectionId, section:{type,name,settings,block_order,blocks}, label }

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

SECTION TYPE CONSTRAINT:
addSection type MUST be one of: ${sectionTypesList}
Map source content to the closest available type.

ID FORMAT: Section IDs and Block IDs must be 13-digit numeric-only strings.
DATA FORMAT: padding_desktop/padding_mobile must be objects, not strings.

CONTENT RULES:
- Use actual source text from the section, no placeholders.
- No external image URLs.
- Use rich HTML for text blocks.
- Include ALL items/blocks from the source section.

The section must have complete blocks with real content.`;

  const userPrompt = `## Source section to recreate
${JSON.stringify(sectionToGenerate, null, 2)}

## Relevant source component code
${sectionContext}

## Design tokens (for color/font matching)
${JSON.stringify({
    headingFont: extractedDesign?.headingFont,
    bodyFont: extractedDesign?.bodyFont,
    colors: extractedDesign?.colors?.slice(0, 6),
    buttonStyle: extractedDesign?.buttonStyle,
  }, null, 2)}

## Available section types
${sectionTypesList}

## Current theme sections (for reference)
${JSON.stringify(Object.keys(themeStructure.sections || {}), null, 2)}

Create exactly ONE addSection operation for this section. Include all content items as blocks.`;

  const models = ["google/gemini-3-flash-preview", "google/gemini-2.5-flash"];
  let lastError = "";

  for (const model of models) {
    try {
      const result = await requestTransform({
        apiKey,
        model,
        systemPrompt,
        userPrompt,
        maxTokens: 8000,
      });

      console.log(`ai-transform [section:${sectionToGenerate.type}] [${model}] finish_reason=${result.finishReason ?? "unknown"}`);

      const parsed = normalizeTransformPayload(
        result.parsed,
        availableSectionTypes,
        typeof sectionToGenerate?.type === "string" ? sectionToGenerate.type : "",
      );
      const normalizedAddSection = parsed.operations.find((op: any) => op.type === "addSection");
      const rawAddSection = Array.isArray(result.parsed?.operations)
        ? result.parsed.operations.find((op: any) => op?.type === "addSection")
        : null;
      const finalizedAddSection = finalizeGeneratedSectionOperation(
        normalizedAddSection ?? rawAddSection,
        sectionToGenerate,
        availableSectionTypes,
      );

      if (finalizedAddSection) {
        if (!normalizedAddSection && rawAddSection) {
          console.log(`ai-transform [section:${sectionToGenerate.type}] [${model}] repaired incomplete addSection using source fallback`);
        }
        return jsonResponse({ operations: [finalizedAddSection] });
      }

      lastError = "No valid addSection operation produced";
      console.warn(
        `ai-transform [section] [${model}] ${lastError}`,
        JSON.stringify(result.parsed).slice(0, 800),
      );
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`ai-transform [section] [${model}] failed: ${lastError}`);
    }
  }

  return jsonResponse({ error: `Failed to generate section: ${lastError}` }, 500);
}

// ── Shared utilities ───────────────────────────────────────────────────

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
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
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
    if (response.status === 429) throw new Error("Rate limited, please try again shortly.");
    if (response.status === 402) throw new Error("Credits exhausted. Add funds in Settings > Workspace > Usage.");
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
      return extractJson(toolCall.function.arguments);
    } catch {
      console.error("Failed to parse tool call args:", toolCall.function.arguments.slice(0, 500));
    }
  }

  let content = aiResult.choices?.[0]?.message?.content || "";
  if (!content && toolCall?.function?.arguments) content = toolCall.function.arguments;
  if (!content || content.trim().length === 0) {
    console.error("AI returned empty response:", JSON.stringify(aiResult).slice(0, 1000));
    throw new Error("AI returned an empty response. Please retry.");
  }

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
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/[\x00-\x1F\x7F]/g, (ch) => ch === "\n" || ch === "\r" || ch === "\t" ? ch : "");

  try { return JSON.parse(cleaned); } catch { /* continue */ }

  let braces = 0, brackets = 0;
  for (const char of cleaned) {
    if (char === "{") braces++;
    if (char === "}") braces--;
    if (char === "[") brackets++;
    if (char === "]") brackets--;
  }
  while (brackets > 0) { cleaned += "]"; brackets--; }
  while (braces > 0) { cleaned += "}"; braces--; }

  try { return JSON.parse(cleaned); } catch (e) {
    throw new Error(`AI returned invalid JSON: ${(e as Error).message}`);
  }
}

function normalizeTransformPayload(
  parsed: TransformPayload,
  availableSectionTypes: string[],
  preferredSectionType = "",
): Required<TransformPayload> {
  const validTypes = new Set(availableSectionTypes || []);
  const operations = Array.isArray(parsed?.operations) ? parsed.operations : [];
  const cssOverrides = typeof parsed?.cssOverrides === "string" ? parsed.cssOverrides : "";

  const normalizedOperations = operations.filter((op: any) => {
    if (!op || typeof op.type !== "string") return false;

    if (op.type === "updateNavigation") return false;

    if (op.type === "updateGlobalSetting" && typeof op.key === "string") {
      if (op.key.startsWith("content_for_")) op.value = normalizeIdArray(op.value);
      if (op.key === "block_order") op.value = normalizeIdArray(op.value);
    }

    if (op.type === "addSection") {
      if (!/^\d{13}$/.test(String(op.sectionId || ""))) op.sectionId = createNumericId();

      if (isPlainObject(op.section)) {
        if (typeof op.section.type !== "string" || !op.section.type.trim()) {
          op.section.type = coerceSectionType(preferredSectionType, validTypes, preferredSectionType);
        }
        if (typeof op.section.name !== "string" || !op.section.name.trim()) {
          op.section.name = typeof op.label === "string" && op.label.trim()
            ? op.label.trim()
            : "Generated Section";
        }
        if (!isPlainObject(op.section.settings)) op.section.settings = {};
        normalizeSectionBlocks(op.section);
      }

      op.section = remapSectionBlockIds(op.section);

      if (!isPlainObject(op.section) || typeof op.section?.type !== "string" || !op.section.type.trim()) {
        console.warn("addSection rejected: missing section object or type", JSON.stringify(op.section).slice(0, 300));
        return false;
      }

      const originalType = op.section.type;
      op.section.type = coerceSectionType(op.section.type, validTypes, preferredSectionType);
      if (op.section.type !== originalType) {
        console.log(`addSection type coerced: \"${originalType}\" -> \"${op.section.type}\"`);
      }

      if (validTypes.size > 0 && !validTypes.has(op.section.type)) {
        console.warn(`addSection rejected: type "${op.section.type}" not in available types [${[...validTypes].join(", ")}]`);
        return false;
      }

      op.section.block_order = Array.isArray(op.section.block_order)
        ? op.section.block_order.map((id: unknown) => String(id))
        : Object.keys(op.section.blocks || {});
      op.section.blocks = isPlainObject(op.section.blocks) ? op.section.blocks : {};

      for (const blockId of Object.keys(op.section.blocks)) {
        op.section.blocks[blockId] = normalizeBlock(op.section.blocks[blockId]);
      }

      op.section.block_order = op.section.block_order.filter((id: string) => id in op.section.blocks);
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

function coerceSectionType(rawType: unknown, validTypes: Set<string>, preferredSectionType = "") {
  const normalized = String(rawType || "").trim();
  if (validTypes.size === 0) return normalized || "section";
  if (normalized && validTypes.has(normalized)) return normalized;

  const lower = normalized.toLowerCase();
  const preferred = String(preferredSectionType || "").trim().toLowerCase();
  const semanticFallbacks: Record<string, string[]> = {
    hero: ["newsletter_hero", "section", "page_content"],
    features: ["section", "page_content", "sales_page_body"],
    testimonials: ["section", "page_content", "sales_page_body"],
    cta: ["section", "page_content", "sales_page_body"],
    content: ["page_content", "section", "sales_page_body"],
    gallery: ["carousel", "section", "page_content"],
    pricing: ["products", "section", "sales_page_body"],
    faq: ["section", "page_content", "sales_page_body"],
    contact: ["section", "page_content", "sales_page_body"],
    custom: ["section", "page_content", "sales_page_body"],
  };

  const candidates = [
    normalized,
    lower,
    lower.replace(/\s+/g, "_"),
    lower.replace(/-/g, "_"),
    lower.replace(/_/g, "-"),
    ...(semanticFallbacks[preferred] || []),
    ...(semanticFallbacks[lower] || []),
    "section",
    "page_content",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (validTypes.has(candidate)) return candidate;
  }

  return Array.from(validTypes)[0] || normalized || "section";
}

function normalizeSectionBlocks(section: any) {
  if (!isPlainObject(section)) return;

  if (Array.isArray(section.blocks)) {
    section.blocks = Object.fromEntries(
      section.blocks.map((block: any, index: number) => [String(index), normalizeBlock(block)]),
    );
  }

  if (!isPlainObject(section.blocks)) section.blocks = {};

  for (const [blockId, block] of Object.entries(section.blocks)) {
    section.blocks[blockId] = normalizeBlock(block);
  }

  if (!Array.isArray(section.block_order)) {
    section.block_order = Object.keys(section.blocks);
  }
}

function normalizeBlock(block: any) {
  if (!isPlainObject(block)) {
    return {
      type: "text",
      settings: typeof block === "string" ? { text: block } : {},
    };
  }

  return {
    ...block,
    type: typeof block.type === "string" && block.type.trim() ? block.type : "text",
    settings: isPlainObject(block.settings) ? block.settings : createFallbackBlockSettings(block),
  };
}

function createFallbackBlockSettings(block: Record<string, any>) {
  const settings: Record<string, any> = {};
  if (typeof block.heading === "string") settings.heading = block.heading;
  if (typeof block.title === "string" && !settings.heading) settings.heading = block.title;
  if (typeof block.text === "string") settings.text = block.text;
  if (typeof block.body === "string" && !settings.text) settings.text = block.body;
  if (typeof block.description === "string" && !settings.text) settings.text = block.description;
  if (typeof block.image === "string") settings.image = block.image;
  if (typeof block.url === "string") settings.url = block.url;
  return settings;
}


function findSectionSourceContext(sourceFiles: SourceFiles, section: any): string {
  const sectionType = (section.type || "").toLowerCase();
  const sectionHeading = (section.heading || "").toLowerCase();
  const keywords = [sectionType, sectionHeading].filter(Boolean);

  const allFiles = {
    ...sourceFiles.components,
    ...sourceFiles.pages,
  };

  const snippets: string[] = [];
  for (const [path, content] of Object.entries(allFiles || {})) {
    const lower = path.toLowerCase() + " " + (content || "").toLowerCase();
    if (keywords.some(kw => kw && lower.includes(kw))) {
      snippets.push(`### ${path}\n\`\`\`tsx\n${trimText(stripImports(content), 1200)}\n\`\`\``);
    }
  }

  if (snippets.length === 0) {
    // Fallback: include first page
    const pages = Object.entries(sourceFiles.pages || {}).slice(0, 1);
    for (const [path, content] of pages) {
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

function finalizeGeneratedSectionOperation(
  rawOp: any,
  sourceSection: any,
  availableSectionTypes: string[],
) {
  const label = deriveSectionLabel(rawOp, sourceSection);
  const sectionId = /^\d{13}$/.test(String(rawOp?.sectionId || ""))
    ? String(rawOp.sectionId)
    : createNumericId();
  const rawSection = isPlainObject(rawOp?.section)
    ? JSON.parse(JSON.stringify(rawOp.section))
    : {};
  const existingSettings = isPlainObject(rawSection.settings) ? rawSection.settings : {};
  const existingBlocks = isPlainObject(rawSection.blocks) ? rawSection.blocks : {};
  const fallbackBlocks = Object.keys(existingBlocks).length > 0
    ? existingBlocks
    : buildFallbackSectionBlocks(sourceSection, label);

  const hydratedOperation = {
    type: "addSection",
    sectionId,
    label,
    section: {
      ...rawSection,
      type: typeof rawSection.type === "string" && rawSection.type.trim()
        ? rawSection.type
        : String(sourceSection?.type || label || "section"),
      name: typeof rawSection.name === "string" && rawSection.name.trim()
        ? rawSection.name.trim()
        : label,
      settings: {
        ...buildFallbackSectionSettings(sourceSection, label),
        ...existingSettings,
      },
      block_order: Array.isArray(rawSection.block_order) && rawSection.block_order.length > 0
        ? rawSection.block_order.map((id: unknown) => String(id))
        : Object.keys(fallbackBlocks),
      blocks: fallbackBlocks,
    },
  };

  const normalized = normalizeTransformPayload(
    { operations: [hydratedOperation], cssOverrides: "" },
    availableSectionTypes,
    typeof sourceSection?.type === "string" ? sourceSection.type : "",
  );

  return normalized.operations.find((op: any) => op.type === "addSection") || null;
}

function deriveSectionLabel(rawOp: any, sourceSection: any) {
  if (typeof rawOp?.label === "string" && rawOp.label.trim()) return rawOp.label.trim();
  if (typeof rawOp?.section?.name === "string" && rawOp.section.name.trim()) return rawOp.section.name.trim();
  if (typeof sourceSection?.heading === "string" && sourceSection.heading.trim()) return sourceSection.heading.trim();

  const sectionType = String(sourceSection?.type || rawOp?.section?.type || "section")
    .replace(/[_-]+/g, " ")
    .trim();

  return sectionType
    ? `${sectionType.replace(/\b\w/g, (char) => char.toUpperCase())} Section`
    : "Generated Section";
}

function buildFallbackSectionSettings(sourceSection: any, label: string) {
  const settings: Record<string, any> = {
    padding_desktop: { top: "80", bottom: "80" },
    padding_mobile: { top: "48", bottom: "48" },
  };

  if (typeof sourceSection?.heading === "string" && sourceSection.heading.trim()) {
    settings.heading = sourceSection.heading.trim();
  } else {
    settings.heading = label;
  }

  if (typeof sourceSection?.body === "string" && sourceSection.body.trim()) {
    settings.text = toRichText(sourceSection.body);
  }
  if (typeof sourceSection?.backgroundColor === "string" && sourceSection.backgroundColor.trim()) {
    settings.background_color = sourceSection.backgroundColor.trim();
  }
  if (typeof sourceSection?.ctaText === "string" && sourceSection.ctaText.trim()) {
    settings.button_label = sourceSection.ctaText.trim();
  }
  if (typeof sourceSection?.ctaUrl === "string" && sourceSection.ctaUrl.trim()) {
    settings.btn_action = sourceSection.ctaUrl.trim();
  }
  if (typeof sourceSection?.image === "string" && sourceSection.image.trim()) {
    settings.image = sourceSection.image.trim();
    settings.img_action = sourceSection.image.trim();
  }
  if (typeof sourceSection?.backgroundImage === "string" && sourceSection.backgroundImage.trim()) {
    settings.background_image = sourceSection.backgroundImage.trim();
  }

  return settings;
}

function buildFallbackSectionBlocks(sourceSection: any, label: string) {
  const items = Array.isArray(sourceSection?.items) ? sourceSection.items : [];
  if (items.length > 0) {
    return Object.fromEntries(
      items.map((item: any) => {
        const blockId = createNumericId();
        return [blockId, {
          type: "text",
          settings: createFallbackBlockSettingsFromContent(item, label),
        }];
      }),
    );
  }

  const blockId = createNumericId();
  return {
    [blockId]: {
      type: "text",
      settings: createFallbackBlockSettingsFromContent(sourceSection, label),
    },
  };
}

function createFallbackBlockSettingsFromContent(content: any, label: string) {
  const settings: Record<string, any> = {
    text_align: "center",
  };

  if (typeof content?.heading === "string" && content.heading.trim()) {
    settings.heading = content.heading.trim();
  } else {
    settings.heading = label;
  }

  const body = typeof content?.body === "string" && content.body.trim()
    ? content.body
    : typeof content?.text === "string" && content.text.trim()
      ? content.text
      : "";
  if (body) settings.text = toRichText(body);

  if (typeof content?.image === "string" && content.image.trim()) settings.image = content.image.trim();
  if (typeof content?.icon === "string" && content.icon.trim()) settings.icon = content.icon.trim();
  if (typeof content?.ctaText === "string" && content.ctaText.trim()) settings.button_label = content.ctaText.trim();
  if (typeof content?.ctaUrl === "string" && content.ctaUrl.trim()) settings.btn_action = content.ctaUrl.trim();

  return settings;
}

function toRichText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;

  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim()).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
