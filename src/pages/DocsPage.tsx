import AppHeader from '@/components/AppHeader';

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <main className="container max-w-4xl py-10 px-6">
        <article className="prose prose-invert prose-sm max-w-none
          prose-headings:font-display prose-headings:tracking-tight
          prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-lg
          prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
          prose-pre:bg-muted prose-pre:rounded-lg prose-pre:p-4 prose-pre:text-xs prose-pre:overflow-x-auto
          prose-table:text-xs prose-th:text-left prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2
          prose-th:border-b prose-td:border-b prose-th:border-border prose-td:border-border
        ">
          <h1>Kajabi Bridge Builder — Full Architecture Documentation</h1>
          <p className="text-muted-foreground text-base">
            This document describes every piece of the app from start to finish: data flow, file responsibilities, types, AI pipeline, and export logic.
          </p>

          <hr />

          {/* ─── OVERVIEW ─── */}
          <h2 id="overview">1. Overview</h2>
          <p>
            <strong>Purpose:</strong> Convert a Lovable (React/Tailwind) website into a Kajabi-compatible theme zip file. The app extracts design tokens (colors, fonts, sections) from a source project's code, sends them to an AI model that generates Kajabi theme operations, then applies those operations to a base Kajabi theme and exports a downloadable <code>.zip</code>.
          </p>
          <p><strong>Tech stack:</strong> React 18, Vite 5, TypeScript, Tailwind CSS, Zustand (state), Supabase Edge Functions (backend AI calls), JSZip (zip creation).</p>

          <h3>High-Level Flow</h3>
          <pre>{`
┌─────────────┐    ┌──────────────┐    ┌────────────────┐    ┌──────────────┐
│  / (New)     │───▶│  /extract    │───▶│  /mapping      │───▶│  Download    │
│  Select src  │    │  View tokens │    │  Review plan   │    │  .zip file   │
│  + theme     │    │  + Generate  │    │  + Preview     │    │              │
└─────────────┘    └──────────────┘    └────────────────┘    └──────────────┘
       │                   │                    │
       ▼                   ▼                    ▼
   createProject     extractDesign        buildPlanWithAI
   loadBaseTheme     (client-side)        (edge function)
   setSourceFiles                        applyPlanAndExport
`}</pre>

          <hr />

          {/* ─── ROUTES ─── */}
          <h2 id="routes">2. Routes & Pages</h2>
          <table>
            <thead><tr><th>Route</th><th>Component</th><th>Purpose</th></tr></thead>
            <tbody>
              <tr><td><code>/</code></td><td><code>Index → NewExportPage</code></td><td>Create a new export project: pick source Lovable project, base Kajabi theme, and page to export.</td></tr>
              <tr><td><code>/extract</code></td><td><code>ExtractPage</code></td><td>Shows extracted design tokens (colors, fonts, hero, sections, assets). Has "Generate Plan" button that calls AI.</td></tr>
              <tr><td><code>/mapping</code></td><td><code>MappingPage</code></td><td>Shows transformation plan (operations list), live preview, validation warnings. Has "Export Kajabi Zip" button.</td></tr>
              <tr><td><code>/docs</code></td><td><code>DocsPage</code></td><td>This documentation page.</td></tr>
            </tbody>
          </table>

          <hr />

          {/* ─── FILES ─── */}
          <h2 id="files">3. File Map & Responsibilities</h2>

          <h3>3a. Pages (<code>src/pages/</code>)</h3>
          <table>
            <thead><tr><th>File</th><th>What It Does</th></tr></thead>
            <tbody>
              <tr><td><code>Index.tsx</code></td><td>Sets <code>workspaceProjects</code> in the store (hardcoded list of Lovable project IDs/names), renders <code>NewExportPage</code>.</td></tr>
              <tr><td><code>NewExportPage.tsx</code></td><td>Form UI: source project selector, base theme selector, page picker, project name/notes. On submit: creates <code>ExportProject</code>, loads base theme zip, loads source files from bundle, runs <code>extractDesign()</code>, navigates to <code>/extract</code>.</td></tr>
              <tr><td><code>ExtractPage.tsx</code></td><td>Displays the extracted <code>ExtractedDesign</code>: color swatches, font names, button preview, header info, hero content, section list, asset list. "Generate Plan" button calls <code>buildPlanWithAI()</code> then navigates to <code>/mapping</code>.</td></tr>
              <tr><td><code>MappingPage.tsx</code></td><td>3-column layout: source summary (left), live <code>ThemePreview</code> (center), operations list with remove buttons (right). "Export Kajabi Zip" triggers <code>exportZip()</code> and browser-downloads the blob.</td></tr>
            </tbody>
          </table>

          <h3>3b. State Management (<code>src/store/</code>)</h3>
          <table>
            <thead><tr><th>File</th><th>What It Does</th></tr></thead>
            <tbody>
              <tr><td><code>useExportStore.ts</code></td><td>
                Zustand store. Single source of truth for:
                <ul>
                  <li><code>currentProject</code> — the active <code>ExportProject</code></li>
                  <li><code>workspaceProjects</code> — list of selectable Lovable projects</li>
                  <li><code>sourceFiles</code> — raw source code (CSS, Tailwind config, components, pages)</li>
                  <li><code>extractedDesign</code> — parsed design tokens</li>
                  <li><code>baseTheme</code> — parsed Kajabi theme data from zip</li>
                  <li><code>transformationPlan</code> — list of operations + validation warnings</li>
                  <li><code>isLoading</code>, <code>loadingMessage</code>, <code>error</code></li>
                </ul>
                Key actions:
                <ul>
                  <li><code>loadBaseTheme(url)</code> — fetches zip, parses via <code>loadKajabiThemeFromZip</code></li>
                  <li><code>extractDesign()</code> — calls <code>extractDesignFromSource</code></li>
                  <li><code>buildPlanWithAI()</code> — multi-step AI pipeline (detailed below)</li>
                  <li><code>exportZip()</code> — applies plan to theme and generates downloadable blob</li>
                </ul>
              </td></tr>
            </tbody>
          </table>

          <h3>3c. Libraries (<code>src/lib/</code>)</h3>
          <table>
            <thead><tr><th>File</th><th>What It Does</th></tr></thead>
            <tbody>
              <tr><td><code>source-extractor.ts</code></td><td>
                <strong>Client-side design extraction.</strong> Parses source project files to produce an <code>ExtractedDesign</code>:
                <ul>
                  <li><code>extractColors()</code> — parses HSL CSS variables from <code>index.css</code> and hex from Tailwind config</li>
                  <li><code>extractFonts()</code> — finds font families from Tailwind config and Google Fonts imports</li>
                  <li><code>extractButtonStyle()</code> — reads <code>--primary</code> and <code>--radius</code> CSS vars</li>
                  <li><code>extractHeader()</code> — finds nav links and logo text from header/footer components</li>
                  <li><code>extractHero()</code> — finds <code>&lt;h1&gt;</code>, <code>&lt;p&gt;</code>, <code>&lt;Button&gt;</code> in hero components</li>
                  <li><code>extractSections()</code> — scans the index page for component usage, infers section types (hero, features, testimonials, cta, content, etc.)</li>
                  <li><code>extractFooter()</code> — finds copyright text and link count</li>
                  <li><code>extractAssets()</code> — maps asset file paths to <code>ExtractedAsset</code> objects</li>
                  <li><code>hslToHex()</code> — utility to convert HSL strings to hex (needed for Kajabi)</li>
                </ul>
              </td></tr>
              <tr><td><code>kajabi-theme-loader.ts</code></td><td>
                <strong>Loads a Kajabi theme from a zip file.</strong>
                <ul>
                  <li><code>loadKajabiThemeFromZip()</code> — unzips, auto-detects root prefix (e.g. <code>theme-export/</code>), parses <code>settings_data.json</code>, separates text files from binary assets</li>
                  <li><code>getThemeSections()</code> — returns <code>settingsData.current.sections</code></li>
                  <li><code>getContentForPage()</code> — returns the section ID array for a given page (e.g. <code>content_for_index</code>)</li>
                  <li><code>getThemeGlobalSettings()</code> — returns all non-section, non-content settings</li>
                </ul>
              </td></tr>
              <tr><td><code>transformation-planner.ts</code></td><td>
                <strong>Local (non-AI) transformation planner.</strong> Builds a <code>TransformationPlan</code> by mapping extracted design tokens to Kajabi operations. Hardcoded for the "Woven Waves" demo project. Generates:
                <ul>
                  <li>Global color/font operations</li>
                  <li>Header/footer section settings</li>
                  <li>Hero text replacement</li>
                  <li>Stats, courses, testimonials, CTA section content</li>
                  <li>Comprehensive CSS overrides (~200 lines)</li>
                </ul>
              </td></tr>
              <tr><td><code>kajabi-exporter.ts</code></td><td>
                <strong>Applies the transformation plan and exports a zip.</strong>
                <ul>
                  <li><code>applyPlanAndExport()</code> — deep-clones settings, applies each operation, sanitizes data, writes zip with STORE compression (Kajabi requirement)</li>
                  <li><code>sanitizeSettingsData()</code> — fixes common AI output issues: stringified arrays, empty stubs, stringified JSON in settings</li>
                  <li><code>applyOperation()</code> — switch-case handler for every operation type (updateGlobalSetting, updateSectionSetting, updateBlockSetting, replaceText, hideSection, showSection, addCssOverride, addSection, addBlock, etc.)</li>
                  <li><code>generateChangeSummary()</code> — produces human-readable strings for each operation (used in the Mapping page UI)</li>
                </ul>
              </td></tr>
              <tr><td><code>project-bundles.ts</code></td><td>
                <strong>Pre-extracted source project data.</strong> Contains hardcoded source code for demo projects (currently "Woven Waves Landing"). Each bundle includes: <code>indexCss</code>, <code>tailwindConfig</code>, <code>appTsx</code>, <code>indexPage</code>, component files (HeroSection, StatsSection, CoursesSection, etc.), asset paths, and page files.
              </td></tr>
            </tbody>
          </table>

          <h3>3d. Components (<code>src/components/</code>)</h3>
          <table>
            <thead><tr><th>File</th><th>What It Does</th></tr></thead>
            <tbody>
              <tr><td><code>AppHeader.tsx</code></td><td>Top navigation bar with step indicators (New → Extract → Map & Export). Highlights current step.</td></tr>
              <tr><td><code>ThemePreview.tsx</code></td><td>
                Live visual preview of the AI-generated theme. Renders:
                <ul>
                  <li>Header with logo text and nav items from <code>ExtractedDesign</code></li>
                  <li>Hero section with heading, subheading, CTA button</li>
                  <li>All <code>addSection</code> operations as rendered sections with blocks</li>
                  <li>Footer with copyright text</li>
                </ul>
                Uses <code>dangerouslySetInnerHTML</code> for HTML block content. Detects layout type (columnar, split-media, CTA) from section type.
              </td></tr>
            </tbody>
          </table>

          <hr />

          {/* ─── TYPES ─── */}
          <h2 id="types">4. Type System (<code>src/types/index.ts</code>)</h2>

          <h3><code>ExportProject</code></h3>
          <pre>{`{
  id: string;                    // UUID
  name: string;                  // User-chosen name
  sourceProjectId: string;       // Lovable project UUID
  sourceProjectName: string;
  baseTheme: string;             // e.g. 'streamlined-home'
  page: string;                  // 'index' | 'about' | 'contact'
  notes?: string;
  createdAt: string;             // ISO date
  status: 'new' | 'extracting' | 'extracted' | 'mapping' | 'mapped' | 'exporting' | 'exported' | 'error';
}`}</pre>

          <h3><code>ExtractedDesign</code></h3>
          <pre>{`{
  colors: ExtractedColor[];       // { name, value (HSL/hex), usage }
  headingFont: string;            // e.g. "Playfair Display"
  bodyFont: string;               // e.g. "DM Sans"
  buttonStyle: { backgroundColor, textColor, borderRadius, style };
  header: { backgroundColor, textColor, navItems[], logoText?, sticky };
  hero?: { heading, subheading?, ctaText?, ctaUrl?, backgroundColor?, textColor? };
  sections: ExtractedSection[];   // { id, type, heading?, body?, items?[] }
  footer: { backgroundColor, textColor, columns, copyright? };
  assets: ExtractedAsset[];       // { sourcePath, fileName, type }
}`}</pre>

          <h3><code>TransformationPlan</code></h3>
          <pre>{`{
  sourceProjectId: string;
  sourceProjectName: string;
  sourcePage: string;
  baseThemeId: string;
  extractedDesign: ExtractedDesign;
  operations: TransformationOperation[];
  validationWarnings: ValidationWarning[];
}`}</pre>

          <h3><code>TransformationOperation</code> (union type — 13 variants)</h3>
          <pre>{`| { type: 'updateGlobalSetting'; key; value; label }
| { type: 'updateSectionSetting'; sectionId; key; value; label }
| { type: 'updateBlockSetting'; sectionId; blockId; key; value; label }
| { type: 'replaceText'; sectionId; blockId; key; value; label }
| { type: 'hideSection'; sectionId }
| { type: 'showSection'; sectionId }
| { type: 'addCssOverride'; css; label }
| { type: 'updateNavigation'; menuId; links[] }
| { type: 'addSection'; sectionId; section: { type, name, settings, block_order, blocks }; label }
| { type: 'addBlock'; sectionId; blockId; block: { type, settings }; label }
| { type: 'replaceLogo'; asset; fileName }
| { type: 'replaceImage'; target; asset; fileName }
| { type: 'addAsset'; fileName; data }
| { type: 'moveSection'; sectionId; afterSectionId? }`}</pre>

          <h3><code>KajabiThemeData</code></h3>
          <pre>{`{
  settingsData: { current: Record<string, any> };  // settings_data.json parsed
  files: Record<string, string>;                    // path → text content
  assets: Record<string, ArrayBuffer>;              // path → binary
  rootPrefix: string;                               // e.g. "streamlined-home/"
}`}</pre>

          <hr />

          {/* ─── AI PIPELINE ─── */}
          <h2 id="ai-pipeline">5. AI Pipeline (Edge Function)</h2>
          <p>File: <code>supabase/functions/ai-transform/index.ts</code> (~715 lines)</p>

          <h3>5a. Entry Point</h3>
          <p>A Deno <code>serve()</code> handler. Reads <code>LOVABLE_API_KEY</code> from env. Routes on <code>body.step</code>:</p>
          <ul>
            <li><code>"globals"</code> → <code>handleGlobalsStep()</code></li>
            <li><code>"section"</code> → <code>handleSectionStep()</code></li>
          </ul>

          <h3>5b. Step 1: Globals</h3>
          <p><strong>Input:</strong> <code>sourceFiles</code>, <code>extractedDesign</code>, <code>themeStructure</code>, <code>availableSectionTypes</code></p>
          <p><strong>Model:</strong> <code>google/gemini-3-flash-preview</code></p>
          <p><strong>System prompt instructs AI to:</strong></p>
          <ul>
            <li>Handle ONLY global settings, header, footer, hero, CSS overrides</li>
            <li>NOT add new sections</li>
            <li>Use 13-digit numeric IDs</li>
            <li>Output via tool call (<code>apply_transformations</code>)</li>
          </ul>
          <p><strong>Output:</strong> <code>{`{ operations: [...], cssOverrides: "..." }`}</code></p>
          <p>Post-processing: strips any <code>addSection</code> ops that leaked through, normalizes payload.</p>

          <h3>5c. Step 2: Section Generation (one call per section)</h3>
          <p><strong>Input:</strong> Same shared body + <code>sectionToGenerate</code> (one <code>ExtractedSection</code>)</p>
          <p><strong>Models:</strong> Tries <code>google/gemini-3-flash-preview</code> first, falls back to <code>google/gemini-2.5-flash</code></p>
          <p><strong>System prompt instructs AI to:</strong></p>
          <ul>
            <li>Create exactly ONE <code>addSection</code> operation</li>
            <li>Section type MUST be from <code>availableSectionTypes</code></li>
            <li>Include complete blocks with real content</li>
          </ul>
          <p><strong>Output:</strong> <code>{`{ operations: [{ type: "addSection", ... }] }`}</code></p>

          <h3>5d. AI Gateway Integration</h3>
          <pre>{`POST https://ai.gateway.lovable.dev/v1/chat/completions
Authorization: Bearer $LOVABLE_API_KEY
Content-Type: application/json

{
  model: "google/gemini-3-flash-preview",
  max_completion_tokens: 8000,
  messages: [{ role: "system", ... }, { role: "user", ... }],
  tools: [{ type: "function", function: { name: "apply_transformations", parameters: {...} } }],
  tool_choice: { type: "function", function: { name: "apply_transformations" } }
}`}</pre>
          <p>Uses <strong>forced tool calling</strong> to ensure structured JSON output. The tool schema defines <code>operations</code> (array) and <code>cssOverrides</code> (string).</p>

          <h3>5e. Response Parsing</h3>
          <ol>
            <li>Try to parse <code>tool_calls[0].function.arguments</code> as JSON</li>
            <li>Fallback: parse <code>message.content</code></li>
            <li><code>extractJson()</code>: strips markdown fences, finds JSON boundaries, fixes trailing commas, repairs unbalanced braces</li>
          </ol>

          <h3>5f. Validation & Normalization</h3>
          <p><code>normalizeTransformPayload()</code> does extensive post-processing:</p>
          <ul>
            <li><strong>Section type coercion:</strong> Maps AI-invented types (e.g. "text-columns", "features") to actual base theme types using <code>coerceSectionType()</code> with semantic fallbacks:
              <pre>{`hero → newsletter_hero | section
features → section | page_content
testimonials → section | page_content
cta → section | page_content
gallery → carousel | section
pricing → products | section`}</pre>
            </li>
            <li><strong>Block normalization:</strong> Auto-fixes missing <code>settings</code>, <code>blocks</code>, <code>block_order</code>. Converts array blocks to object format. Creates fallback settings from top-level block properties.</li>
            <li><strong>ID enforcement:</strong> All section/block IDs must be 13-digit numeric strings; non-conforming IDs are regenerated.</li>
            <li><strong>Filtering:</strong> Removes <code>updateNavigation</code> ops, invalid blocks, empty sections.</li>
          </ul>

          <h3>5g. Available Section Types (from base theme zip)</h3>
          <pre>{`announcements, blog_listings, blog_post_body, blog_search_results,
carousel, exit_pop, footer, header, login, member_directory,
newsletter_hero, newsletter_listings, newsletter_post_body,
newsletter_recent_posts, page_content, page_embedded_checkout,
products, sales_page_body, sales_page_sidebar, section,
store_builder, thank_you, two_step`}</pre>
          <p>The most commonly used for content sections: <code>section</code>, <code>page_content</code>, <code>newsletter_hero</code>.</p>

          <hr />

          {/* ─── CLIENT ORCHESTRATION ─── */}
          <h2 id="orchestration">6. Client-Side AI Orchestration</h2>
          <p>In <code>useExportStore.buildPlanWithAI()</code>:</p>
          <ol>
            <li><strong>Build compact theme structure</strong> from loaded base theme (sections, blocks, settings)</li>
            <li><strong>Compute <code>availableSectionTypes</code></strong> from <code>sections/*.liquid</code> files in the base theme zip</li>
            <li><strong>Step 1:</strong> Call edge function with <code>step: "globals"</code> → get global operations + CSS overrides</li>
            <li><strong>Steps 2+:</strong> For each non-hero <code>ExtractedSection</code>, call edge function with <code>step: "section"</code> → get one <code>addSection</code> operation. Failures are <strong>skipped</strong> (not fatal).</li>
            <li><strong>Post-processing:</strong>
              <ul>
                <li>Hide all original base theme content sections</li>
                <li>Replace <code>content_for_index</code> with only AI-generated section IDs</li>
              </ul>
            </li>
            <li><strong>Result:</strong> A <code>TransformationPlan</code> stored in Zustand state</li>
          </ol>

          <hr />

          {/* ─── EXPORT ─── */}
          <h2 id="export">7. Export Pipeline</h2>
          <p>In <code>kajabi-exporter.ts → applyPlanAndExport()</code>:</p>
          <ol>
            <li><strong>Deep clone</strong> the base theme's <code>settingsData</code></li>
            <li><strong>Apply each operation</strong> via <code>applyOperation()</code>:
              <ul>
                <li><code>updateGlobalSetting</code> → sets <code>current[key]</code></li>
                <li><code>updateSectionSetting</code> → sets <code>sections[id].settings[key]</code></li>
                <li><code>updateBlockSetting</code> / <code>replaceText</code> → sets <code>sections[id].blocks[bid].settings[key]</code></li>
                <li><code>hideSection</code> → sets <code>hidden: "true"</code></li>
                <li><code>addCssOverride</code> → appends to <code>overrides.css</code></li>
                <li><code>addSection</code> → adds to <code>current.sections</code> AND appends ID to <code>content_for_index</code></li>
              </ul>
            </li>
            <li><strong>Sanitize</strong>: fix stringified arrays, remove <code>link_lists</code>, fix stringified JSON in block settings, remove empty stub sections</li>
            <li><strong>Build zip</strong> with JSZip using <code>STORE</code> compression (Kajabi requirement — no deflation)</li>
            <li><strong>Output:</strong> <code>Blob</code> downloaded as <code>project-name-kajabi-theme.zip</code></li>
          </ol>

          <h3>Zip Structure</h3>
          <pre>{`streamlined-home/
├── config/
│   └── settings_data.json    ← Modified by operations
├── sections/
│   ├── section.liquid        ← Generic section template
│   ├── header.liquid
│   ├── footer.liquid
│   ├── newsletter_hero.liquid
│   ├── page_content.liquid
│   └── ... (23 total)
├── templates/
│   └── index.liquid
├── layouts/
│   └── theme.liquid
├── snippets/
│   └── *.liquid
├── assets/
│   ├── overrides.css         ← CSS overrides appended here
│   └── *.js / *.css
└── locales/
    └── en.json`}</pre>

          <hr />

          {/* ─── DATA FLOW ─── */}
          <h2 id="data-flow">8. Complete Data Flow</h2>
          <pre>{`
1. User selects source project + base theme on / page
   ↓
2. loadBaseTheme() fetches /base-themes/streamlined-home.zip
   → JSZip parses → KajabiThemeData stored in Zustand
   ↓
3. setSourceFiles() loads pre-bundled source code from project-bundles.ts
   → extractDesign() runs client-side extraction
   → ExtractedDesign stored in Zustand
   ↓
4. User views extracted design on /extract page
   ↓
5. User clicks "Generate Plan"
   → buildPlanWithAI() orchestrates multi-step AI pipeline:
   
   5a. Build themeStructure from base theme sections
   5b. Compute availableSectionTypes from sections/*.liquid files
   
   5c. POST to ai-transform edge function (step: "globals")
       → AI returns: updateGlobalSetting ops, CSS overrides
   
   5d. For each non-hero extracted section:
       POST to ai-transform edge function (step: "section")
       → AI returns: one addSection operation
       → Section type coerced to valid base theme type
       → Blocks normalized (IDs, settings, fallbacks)
   
   5e. Client-side post-processing:
       → Hide all original content sections
       → Replace content_for_index with new section IDs
   
   → TransformationPlan stored in Zustand
   ↓
6. User reviews plan on /mapping page
   → ThemePreview renders visual preview
   → Operations list shows all changes
   → User can remove individual operations
   ↓
7. User clicks "Export Kajabi Zip"
   → applyPlanAndExport() applies all operations to cloned theme
   → Sanitizes settings data
   → Builds zip with STORE compression
   → Browser downloads .zip file
   ↓
8. User uploads .zip to Kajabi Admin → Theme appears with AI-generated content
`}</pre>

          <hr />

          {/* ─── KNOWN ISSUES ─── */}
          <h2 id="known-issues">9. Known Issues & Limitations</h2>
          <ul>
            <li><strong>Source projects are hardcoded:</strong> Only "Woven Waves Landing" has a pre-extracted bundle. Other projects show as "not yet indexed".</li>
            <li><strong>No image transfer:</strong> Images are not transferred from source to theme. The AI is instructed not to use external URLs.</li>
            <li><strong>Section type mismatch:</strong> AI often generates section types that don't exist in the base theme (e.g. "text-columns"). The <code>coerceSectionType()</code> function maps these to valid types, usually falling back to <code>section</code> or <code>page_content</code>.</li>
            <li><strong>Preview vs. actual Kajabi render:</strong> The <code>ThemePreview</code> component is a rough approximation. Actual rendering depends on the Liquid templates in the base theme.</li>
            <li><strong>Single base theme:</strong> Only "Streamlined Home" is available.</li>
            <li><strong>No authentication:</strong> The app is fully public with no user accounts.</li>
            <li><strong>No persistence:</strong> All state is in-memory (Zustand). Refreshing the page loses everything.</li>
            <li><strong>CSS overrides can be heavy:</strong> Both the local planner and AI generate extensive CSS. These are all appended to <code>assets/overrides.css</code>.</li>
          </ul>

          <hr />

          {/* ─── EDGE FUNCTION INTERNALS ─── */}
          <h2 id="edge-function">10. Edge Function Internals</h2>

          <h3>Key Functions</h3>
          <table>
            <thead><tr><th>Function</th><th>Purpose</th></tr></thead>
            <tbody>
              <tr><td><code>handleGlobalsStep()</code></td><td>Builds system+user prompts for global settings, calls AI, strips addSection ops</td></tr>
              <tr><td><code>handleSectionStep()</code></td><td>Builds prompts for one section, tries 2 models, returns first valid addSection</td></tr>
              <tr><td><code>requestTransform()</code></td><td>Makes the actual HTTP call to AI gateway with tool calling</td></tr>
              <tr><td><code>parseAiResponse()</code></td><td>Extracts JSON from tool call args or message content</td></tr>
              <tr><td><code>extractJson()</code></td><td>Robust JSON parser: strips markdown, fixes trailing commas, repairs braces</td></tr>
              <tr><td><code>normalizeTransformPayload()</code></td><td>Validates and fixes all operations (types, IDs, blocks, settings)</td></tr>
              <tr><td><code>coerceSectionType()</code></td><td>Maps AI section types to valid base theme types via semantic fallbacks</td></tr>
              <tr><td><code>normalizeSectionBlocks()</code></td><td>Fixes block arrays → objects, ensures block_order exists</td></tr>
              <tr><td><code>normalizeBlock()</code></td><td>Ensures every block has type + settings, creates fallback settings</td></tr>
              <tr><td><code>remapSectionBlockIds()</code></td><td>Ensures all block IDs are 13-digit numeric strings</td></tr>
              <tr><td><code>findSectionSourceContext()</code></td><td>Finds relevant source component code for a section by keyword matching</td></tr>
              <tr><td><code>buildRelevantSourceContext()</code></td><td>Builds source code snippets for the globals prompt (prioritized by section type)</td></tr>
            </tbody>
          </table>

          <h3>Error Handling</h3>
          <ul>
            <li><code>429</code> → "Rate limited, please try again shortly."</li>
            <li><code>402</code> → "Credits exhausted. Add funds in Settings {'>'} Workspace {'>'} Usage."</li>
            <li>Invalid JSON → Multiple repair attempts, then error</li>
            <li>No valid operations → Returns 500 with descriptive error</li>
            <li>Section failures → Client-side <code>continue</code> (skips, doesn't abort)</li>
          </ul>

          <hr />

          <h2 id="base-theme">11. Base Theme: Streamlined Home</h2>
          <p>Located at <code>public/base-themes/streamlined-home.zip</code></p>
          <p>A Kajabi theme with 23 section types. The <code>settings_data.json</code> contains:</p>
          <ul>
            <li><code>current.sections</code> — all section instances with their settings and blocks</li>
            <li><code>current.content_for_index</code> — ordered array of section IDs to render on the homepage</li>
            <li>Global settings: colors, fonts, button styles, spacing</li>
          </ul>
          <p>The export process replaces <code>content_for_index</code> with AI-generated section IDs and hides all original sections.</p>

          <hr />

          <h2 id="environment">12. Environment & Secrets</h2>
          <table>
            <thead><tr><th>Variable</th><th>Where</th><th>Purpose</th></tr></thead>
            <tbody>
              <tr><td><code>LOVABLE_API_KEY</code></td><td>Edge function env</td><td>Auth for AI gateway</td></tr>
              <tr><td><code>VITE_SUPABASE_URL</code></td><td>Client .env</td><td>Supabase project URL</td></tr>
              <tr><td><code>VITE_SUPABASE_PUBLISHABLE_KEY</code></td><td>Client .env</td><td>Supabase anon key</td></tr>
            </tbody>
          </table>

          <hr />

          <p className="text-muted-foreground text-sm mt-8">
            Generated {new Date().toISOString().split('T')[0]}. This page is part of the Kajabi Bridge Builder app.
          </p>
        </article>
      </main>
    </div>
  );
}