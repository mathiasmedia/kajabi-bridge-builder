import { useMemo } from 'react';
import type { TransformationPlan, TransformationOperation, ExtractedDesign } from '@/types';

interface ThemePreviewProps {
  plan: TransformationPlan;
  design: ExtractedDesign;
}

/** Collect addSection operations into renderable section data */
function collectSections(ops: TransformationOperation[]) {
  const sections: Array<{
    id: string;
    label: string;
    type: string;
    name: string;
    settings: Record<string, any>;
    blocks: Array<{ id: string; type: string; settings: Record<string, any> }>;
  }> = [];

  for (const op of ops) {
    if (op.type !== 'addSection') continue;
    const blockList = (op.section.block_order || []).map((bid) => ({
      id: bid,
      type: op.section.blocks[bid]?.type || 'unknown',
      settings: op.section.blocks[bid]?.settings || {},
    }));
    sections.push({
      id: op.sectionId,
      label: op.label,
      type: op.section.type,
      name: op.section.name || op.label,
      settings: op.section.settings || {},
      blocks: blockList,
    });
  }

  return sections;
}

/** Extract CSS overrides */
function collectCss(ops: TransformationOperation[]) {
  return ops
    .filter((op): op is Extract<TransformationOperation, { type: 'addCssOverride' }> => op.type === 'addCssOverride')
    .map((op) => op.css)
    .join('\n');
}

/** Extract global settings */
function collectGlobals(ops: TransformationOperation[]) {
  const globals: Record<string, any> = {};
  for (const op of ops) {
    if (op.type === 'updateGlobalSetting') {
      globals[op.key] = op.value;
    }
  }
  return globals;
}

export default function ThemePreview({ plan, design }: ThemePreviewProps) {
  const sections = useMemo(() => collectSections(plan.operations), [plan.operations]);
  const globals = useMemo(() => collectGlobals(plan.operations), [plan.operations]);
  const css = useMemo(() => collectCss(plan.operations), [plan.operations]);

  const bgColor = globals.body_bg_color || design.hero?.backgroundColor || '#ffffff';
  const textColor = globals.body_text_color || design.hero?.textColor || '#1a1a1a';

  return (
    <div className="flex flex-col w-full overflow-hidden rounded-lg border bg-white">
      {/* Injected CSS (scoped via wrapper) */}
      {css && (
        <style>{`
          .kajabi-preview { ${css.replace(/@import[^;]+;/g, '')} }
        `}</style>
      )}

      <div
        className="kajabi-preview flex flex-col min-h-0 text-sm"
        style={{ backgroundColor: bgColor, color: textColor }}
      >
        {/* Header */}
        <PreviewHeader design={design} />

        {/* Hero */}
        {design.hero && <PreviewHero hero={design.hero} buttonStyle={design.buttonStyle} />}

        {/* AI-generated sections */}
        {sections.length > 0 ? (
          sections.map((section) => (
            <PreviewSection key={section.id} section={section} />
          ))
        ) : (
          <div className="py-8 text-center text-xs opacity-40">No sections generated</div>
        )}

        {/* Footer */}
        <PreviewFooter design={design} />
      </div>
    </div>
  );
}

function PreviewHeader({ design }: { design: ExtractedDesign }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2.5 text-xs"
      style={{
        backgroundColor: design.header.backgroundColor,
        color: design.header.textColor,
      }}
    >
      <span className="font-bold text-sm">{design.header.logoText || '●'}</span>
      <div className="flex gap-3">
        {design.header.navItems.slice(0, 5).map((item, i) => (
          <span key={i} className="opacity-80 hover:opacity-100 cursor-default">
            {item.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function PreviewHero({
  hero,
  buttonStyle,
}: {
  hero: NonNullable<ExtractedDesign['hero']>;
  buttonStyle: ExtractedDesign['buttonStyle'];
}) {
  return (
    <div
      className="px-6 py-10 text-center"
      style={{
        backgroundColor: hero.backgroundColor || '#0a0a0a',
        color: hero.textColor || '#ffffff',
      }}
    >
      {hero.heading && (
        <h2 className="text-lg font-bold leading-tight mb-2">{hero.heading}</h2>
      )}
      {hero.subheading && (
        <p className="text-xs opacity-70 mb-3 max-w-xs mx-auto">{hero.subheading}</p>
      )}
      {hero.ctaText && (
        <span
          className="inline-block px-3 py-1.5 text-xs font-medium"
          style={{
            backgroundColor: buttonStyle.backgroundColor,
            color: buttonStyle.textColor,
            borderRadius: buttonStyle.borderRadius,
          }}
        >
          {hero.ctaText}
        </span>
      )}
    </div>
  );
}

function PreviewSection({
  section,
}: {
  section: ReturnType<typeof collectSections>[number];
}) {
  const bg = section.settings.background_color || section.settings.bg_color;
  const text = section.settings.text_color;
  const headingColor = section.settings.heading_color;

  return (
    <div
      className="px-5 py-6 border-t border-black/5"
      style={{
        backgroundColor: bg || undefined,
        color: text || undefined,
      }}
    >
      {/* Section heading */}
      {section.settings.heading && (
        <h3
          className="text-sm font-bold mb-3 text-center"
          style={{ color: headingColor || undefined }}
        >
          {section.settings.heading}
        </h3>
      )}

      {/* Blocks grid */}
      {section.blocks.length > 0 && (
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${Math.min(section.blocks.length, 3)}, 1fr)`,
          }}
        >
          {section.blocks.map((block) => (
            <PreviewBlock key={block.id} block={block} headingColor={headingColor} />
          ))}
        </div>
      )}

      {/* Section-level text/subheading */}
      {section.settings.text && (
        <div
          className="text-xs opacity-70 mt-2 text-center"
          dangerouslySetInnerHTML={{ __html: section.settings.text }}
        />
      )}
    </div>
  );
}

function PreviewBlock({
  block,
  headingColor,
}: {
  block: { id: string; type: string; settings: Record<string, any> };
  headingColor?: string;
}) {
  const { settings } = block;

  return (
    <div className="rounded p-3 text-center" style={{ textAlign: settings.text_align || 'center' }}>
      {settings.heading && (
        <div className="font-bold text-sm mb-1" style={{ color: headingColor || undefined }}>
          {settings.heading}
        </div>
      )}
      {settings.text && (
        <div
          className="text-xs opacity-70 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: settings.text }}
        />
      )}
      {settings.button_label && (
        <span className="inline-block mt-2 px-2 py-1 text-[10px] rounded bg-current/10 opacity-60">
          {settings.button_label}
        </span>
      )}
    </div>
  );
}

function PreviewFooter({ design }: { design: ExtractedDesign }) {
  return (
    <div
      className="px-4 py-3 text-[10px] text-center border-t border-black/5"
      style={{
        backgroundColor: design.footer.backgroundColor,
        color: design.footer.textColor,
      }}
    >
      {design.footer.copyright || `© ${new Date().getFullYear()}`}
    </div>
  );
}
