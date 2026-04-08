import AppHeader from '@/components/AppHeader';

const currentState = {
  works: [
    'Loads the base Kajabi theme zip and parses settings_data.json.',
    'Extracts source design tokens, hero content, nav/footer basics, and section candidates from bundled source files.',
    'Generates AI transformation operations for globals and per-section mapping.',
    'Exports a Kajabi zip with settings_data.json updates and overrides.css appended.',
  ],
  partial: [
    'Section mapping works inconsistently and still depends on aggressive type coercion.',
    'The preview is directionally helpful but not a faithful Kajabi renderer.',
    'CSS override generation helps match styling but can become bloated and fragile.',
    'Section generation is now guarded against empty AI stub outputs, but content quality can still be weak.',
  ],
  broken: [
    'Visual fidelity between Lovable source and Kajabi output is not reliable yet.',
    'Image transfer/replacement is incomplete.',
    'Section type selection is still weak because Kajabi template types are constrained and the AI often invents types.',
    'Source project indexing is hardcoded to a small bundled set instead of real project ingestion.',
    'Export validity still has edge cases around malformed settings and template-specific field expectations.',
  ],
};

const successCriteria = [
  'The exported zip imports into Kajabi without repair work.',
  'The homepage structure in Kajabi matches the source Lovable project closely.',
  'Fonts, colors, buttons, logo, and copy map correctly.',
  'Images transfer correctly or are replaced intentionally and explicitly.',
  'The export relies on minimal CSS overrides instead of fighting the theme.',
  'settings_data.json stays well-formed: arrays stay arrays, objects stay objects, and section IDs remain valid.',
];

const knownBadOutputs = [
  '<code>content_for_index</code> becomes a string instead of an array.',
  'Stringified JSON ends up inside section or block settings.',
  'AI generates empty/custom stub sections with no useful content.',
  'Feature or image blocks render placeholders instead of meaningful mapped content.',
  'Wrong fonts or typography hierarchy appear in certain template combinations.',
  'The preview can look better or worse than the actual Kajabi import because it is only an approximation.',
];

const constraints = [
  '<code>settings_data.current</code> is the source of truth.',
  '<code>content_for_*</code> values must stay ordered arrays of section IDs, not strings.',
  '<code>sections</code> entries need valid IDs, valid section types, settings, block_order, and blocks.',
  '<code>block_order</code> must align with actual block IDs present in <code>blocks</code>.',
  'Section types and block structures must match what the base theme can actually render.',
  'Header/footer come from the theme layout and special section types, not arbitrary HTML.',
  'Specific field names matter for some templates, including keys like <code>btn_action</code> and <code>img_action</code>.',
  'The zip must be exported with STORE compression and preserve the original root folder structure.',
];

const nextPriorities = [
  'Make exported zips consistently valid across edge cases.',
  'Improve section mapping quality and template selection.',
  'Improve image transfer and intentional replacements.',
  'Reduce CSS override bloat by mapping into native theme settings first.',
  'Support indexing more than one bundled source project.',
];

const pipelineSteps = [
  'User picks a source project, base theme, and page on the new export flow.',
  'The app loads the base Kajabi zip and parses theme files client-side.',
  'The source extractor reads bundled source files and builds an ExtractedDesign object.',
  'The globals AI step maps colors, fonts, header, footer, hero, and CSS overrides.',
  'The section AI step runs once per extracted section and returns one addSection operation.',
  'Client post-processing hides original base theme sections and rewrites content_for_index.',
  'The exporter applies operations, sanitizes bad output patterns, and rebuilds a Kajabi zip.',
];

const blockerDetails = [
  'The system knows the source project only through pre-bundled files, so it is not a general project-to-project bridge yet.',
  'The AI is good at intent but weak at exact Kajabi template semantics, especially section type and field selection.',
  'The preview is React-based, while the final destination is Liquid-based, so there is a fidelity gap.',
  'Images and richer media are the least mature part of the pipeline.',
  'Exporter sanitization catches several malformed outputs, but not every template-specific mismatch.',
];

const appendixRows = [
  ['<code>/</code>', 'Start a new export project and load the base theme + source bundle.'],
  ['<code>/extract</code>', 'Review extracted design tokens and trigger AI plan generation.'],
  ['<code>/mapping</code>', 'Inspect operations, preview the transformed result, and export the zip.'],
  ['<code>/docs</code>', 'This internal status + architecture page.'],
];

const coreFileRows = [
  ['<code>src/store/useExportStore.ts</code>', 'Main client orchestrator for loading, extraction, AI planning, and export.'],
  ['<code>src/lib/source-extractor.ts</code>', 'Builds ExtractedDesign from bundled source files.'],
  ['<code>supabase/functions/ai-transform/index.ts</code>', 'Multi-step AI transform function for globals and section generation.'],
  ['<code>src/lib/kajabi-exporter.ts</code>', 'Applies operations, sanitizes output, and builds the export zip.'],
  ['<code>src/components/ThemePreview.tsx</code>', 'Approximate React preview of the generated Kajabi structure.'],
  ['<code>src/lib/project-bundles.ts</code>', 'Hardcoded source bundles used instead of live project indexing.'],
];

const typeRows = [
  ['<code>ExportProject</code>', 'The active export job metadata and status.'],
  ['<code>ExtractedDesign</code>', 'Parsed colors, fonts, hero, sections, footer, and assets from the source bundle.'],
  ['<code>TransformationPlan</code>', 'The final AI/local operation list plus warnings.'],
  ['<code>TransformationOperation</code>', 'Union of actions like updateGlobalSetting, addSection, replaceText, and addCssOverride.'],
  ['<code>KajabiThemeData</code>', 'Parsed zip contents: settings_data, text files, binary assets, and root prefix.'],
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <main className="container max-w-5xl px-6 py-10">
        <article className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:tracking-tight prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-lg prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-muted prose-pre:rounded-lg prose-pre:p-4 prose-pre:text-xs prose-pre:overflow-x-auto prose-table:text-xs prose-th:text-left prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-th:border-b prose-td:border-b prose-th:border-border prose-td:border-border">
          <h1>Export to Kajabi — Internal Architecture &amp; Current Status</h1>
          <p className="text-base text-muted-foreground">
            This page is written for fast handoff to ChatGPT or any other reviewer: what the app is trying to do, how it currently works, what is broken, and what should improve next.
          </p>

          <h2>Fast answers</h2>
          <ol>
            <li><strong>What is the app trying to do?</strong> Turn a Lovable React/Tailwind site into a Kajabi-importable theme zip that preserves structure, styling direction, and content.</li>
            <li><strong>How does it currently do it?</strong> It loads a base Kajabi theme, extracts tokens/content from bundled source files, asks an AI function to generate Kajabi operations, then applies those operations and exports a zip.</li>
            <li><strong>What is actually broken or incomplete?</strong> Section mapping fidelity, image transfer, type selection, preview accuracy, and export validity in edge cases.</li>
            <li><strong>What do we want to improve next?</strong> Reliable exports first, then better section mapping, better image handling, less CSS override dependence, and broader source indexing.</li>
          </ol>

          <h2>Current State of the Product</h2>
          <div className="not-prose grid gap-4 md:grid-cols-3">
            <StatusCard title="Works" items={currentState.works} />
            <StatusCard title="Partially works" items={currentState.partial} />
            <StatusCard title="Broken / weak" items={currentState.broken} />
          </div>

          <h2>What success looks like</h2>
          <ul>
            {successCriteria.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <h2>Known bad outputs</h2>
          <ul>
            {knownBadOutputs.map((item) => (
              <li key={item} dangerouslySetInnerHTML={{ __html: item }} />
            ))}
          </ul>

          <h2>Non-negotiable Kajabi constraints</h2>
          <ul>
            {constraints.map((item) => (
              <li key={item} dangerouslySetInnerHTML={{ __html: item }} />
            ))}
          </ul>

          <h2>What the app is trying to do</h2>
          <p>
            The product goal is not generic HTML export. It is a constrained translation system: take the intent and content of a Lovable site and rebuild it inside the data model of a specific Kajabi base theme.
            That means the output has to respect Kajabi&apos;s section system instead of inventing arbitrary markup.
          </p>

          <h2>How it currently does it</h2>
          <ol>
            {pipelineSteps.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>

          <pre>{`/ → choose source + base theme
  ↓
load base theme zip
  ↓
extract source tokens + section candidates
  ↓
AI globals pass
  ↓
AI section-by-section pass
  ↓
hide original sections + rewrite content_for_index
  ↓
sanitize settings_data
  ↓
export Kajabi zip`}</pre>

          <h2>What is actually broken or incomplete</h2>
          <ul>
            {blockerDetails.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            Most of the product risk is in the translation gap between a flexible React source and a rigid Kajabi theme schema. The app can usually produce something, but not yet something consistently faithful.
          </p>

          <h2>What we want to improve next</h2>
          <ol>
            {nextPriorities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>

          <h2>Current architecture snapshot</h2>
          <ul>
            <li><strong>Frontend:</strong> React + Vite + TypeScript + Tailwind.</li>
            <li><strong>Client state:</strong> Zustand holds the current project, source files, extracted design, base theme, and transformation plan.</li>
            <li><strong>AI backend:</strong> One backend function handles a globals pass and a section-generation pass.</li>
            <li><strong>Export layer:</strong> JSZip rebuilds the Kajabi theme zip after operations are applied.</li>
            <li><strong>Current source ingestion:</strong> Hardcoded project bundles, not true project crawling/indexing.</li>
          </ul>

          <h2>Appendix: routes</h2>
          <SimpleTable rows={appendixRows} headers={["Route", "Purpose"]} />

          <h2>Appendix: core files</h2>
          <SimpleTable rows={coreFileRows} headers={["File", "Role"]} />

          <h2>Appendix: core types</h2>
          <SimpleTable rows={typeRows} headers={["Type", "Purpose"]} />

          <h2>Appendix: edge function reality</h2>
          <ul>
            <li>The globals step generates colors, fonts, header/footer/hero updates, and CSS overrides.</li>
            <li>The section step generates exactly one <code>addSection</code> operation per extracted section.</li>
            <li>The function now normalizes incomplete AI output more aggressively and falls back to source-derived section content if the model returns an empty section stub.</li>
            <li>The exporter already sanitizes several malformed patterns, but more template-aware validation is still needed.</li>
          </ul>

          <p className="mt-8 text-sm text-muted-foreground">
            Updated {new Date().toISOString().split('T')[0]}. This is an internal working doc for improving output quality, not polished marketing copy.
          </p>
        </article>
      </main>
    </div>
  );
}

function StatusCard({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 text-card-foreground">
      <h3 className="mb-3 text-sm font-semibold tracking-tight">{title}</h3>
      <ul className="space-y-2 pl-5 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function SimpleTable({
  headers,
  rows,
}: {
  headers: [string, string];
  rows: Array<[string, string]>;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>{headers[0]}</th>
          <th>{headers[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([left, right]) => (
          <tr key={left}>
            <td dangerouslySetInnerHTML={{ __html: left }} />
            <td>{right}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}