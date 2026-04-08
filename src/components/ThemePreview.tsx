import { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { TransformationPlan, TransformationOperation, ExtractedDesign } from '@/types';

interface ThemePreviewProps {
  plan: TransformationPlan;
  design: ExtractedDesign;
}

type SectionData = {
  id: string;
  label: string;
  type: string;
  name: string;
  settings: Record<string, any>;
  blocks: Array<{ id: string; type: string; settings: Record<string, any> }>;
};

function collectSections(ops: TransformationOperation[]): SectionData[] {
  const sections: SectionData[] = [];
  for (const op of ops) {
    if (op.type !== 'addSection') continue;
    sections.push({
      id: op.sectionId,
      label: op.label,
      type: op.section.type,
      name: op.section.name || op.label,
      settings: op.section.settings || {},
      blocks: (op.section.block_order || []).map((bid) => ({
        id: bid,
        type: op.section.blocks[bid]?.type || 'unknown',
        settings: op.section.blocks[bid]?.settings || {},
      })),
    });
  }
  return sections;
}

function collectGlobals(ops: TransformationOperation[]) {
  const globals: Record<string, any> = {};
  for (const op of ops) {
    if (op.type === 'updateGlobalSetting') globals[op.key] = op.value;
  }
  return globals;
}

export default function ThemePreview({ plan, design }: ThemePreviewProps) {
  const sections = useMemo(() => collectSections(plan.operations), [plan.operations]);
  const globals = useMemo(() => collectGlobals(plan.operations), [plan.operations]);

  const pageBg = globals.body_bg_color || '#0b1214';
  const pageText = globals.body_text_color || '#e0e8e4';

  return (
    <div className="flex flex-col w-full overflow-hidden rounded-lg border" style={{ backgroundColor: pageBg, color: pageText }}>
      {/* Header */}
      <PreviewHeader design={design} />

      {/* Hero */}
      {design.hero && <PreviewHero hero={design.hero} buttonStyle={design.buttonStyle} />}

      {/* AI-generated sections */}
      {sections.length > 0 ? (
        sections.map((section) => (
          <PreviewSection key={section.id} section={section} pageBg={pageBg} pageText={pageText} />
        ))
      ) : (
        <div className="py-12 text-center text-xs opacity-30">No sections generated</div>
      )}

      {/* Footer */}
      <PreviewFooter design={design} />
    </div>
  );
}

function PreviewHeader({ design }: { design: ExtractedDesign }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2.5 text-[10px] shrink-0"
      style={{ backgroundColor: design.header.backgroundColor, color: design.header.textColor }}
    >
      <span className="font-bold text-xs">{design.header.logoText || '●'}</span>
      <div className="flex gap-2.5">
        {design.header.navItems.slice(0, 5).map((item, i) => (
          <span key={i} className="opacity-70">{item.name}</span>
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
  const hasBgImage = !!hero.backgroundImage;
  return (
    <div
      className="px-5 py-12 text-center shrink-0 relative overflow-hidden"
      style={{
        backgroundColor: hero.backgroundColor || '#0a0a0a',
        color: hero.textColor || '#ffffff',
      }}
    >
      {hasBgImage && (
        <img
          src={hero.backgroundImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
      )}
      <div className="relative z-10">
        {hero.heading && (
          <h2 className="text-base font-bold leading-tight mb-1.5 font-serif">{hero.heading}</h2>
        )}
        {hero.subheading && (
          <p className="text-[10px] opacity-60 mb-3 max-w-[200px] mx-auto leading-relaxed">{hero.subheading}</p>
        )}
        {hero.ctaText && (
          <span
            className="inline-block px-3 py-1.5 text-[10px] font-semibold"
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
    </div>
  );
}

function PreviewSection({ section, pageBg, pageText }: { section: SectionData; pageBg: string; pageText: string }) {
  const bg = section.settings.background_color || section.settings.bg_color || pageBg;
  const text = section.settings.text_color || pageText;
  const headingColor = section.settings.heading_color || text;
  const cols = Math.min(section.blocks.length, 3);

  // Determine layout based on section type
  const isColumnar = ['text-columns', 'icon-columns', 'features', 'stats'].some(t =>
    section.type.includes(t)
  );
  const isSplitMedia = section.type.includes('media') || section.type.includes('split') || section.type.includes('image-with-text');
  const isCta = section.type.includes('cta') || section.type.includes('banner');

  return (
    <div className="shrink-0" style={{ backgroundColor: bg, color: text }}>
      <div className="px-4 py-6">
        {/* Section heading */}
        {section.settings.heading && (
          <SectionHeading text={section.settings.heading} color={headingColor} />
        )}

        {/* Section subheading / text */}
        {section.settings.text && (
          <div
            className="text-[10px] opacity-70 text-center mb-3 max-w-[220px] mx-auto leading-relaxed"
            dangerouslySetInnerHTML={{ __html: stripHtmlWrapper(section.settings.text) }}
          />
        )}

        {/* Blocks */}
        {section.blocks.length > 0 && (
          <div
            className={`gap-2 ${isSplitMedia ? 'flex' : isColumnar ? 'grid' : isCta ? 'flex flex-col items-center' : 'grid'}`}
            style={!isSplitMedia ? { gridTemplateColumns: `repeat(${cols}, 1fr)` } : undefined}
          >
            {section.blocks.map((block) => (
              <PreviewBlock
                key={block.id}
                block={block}
                headingColor={headingColor}
                isSplitMedia={isSplitMedia}
              />
            ))}
          </div>
        )}

        {/* CTA button at section level */}
        {section.settings.button_label && (
          <div className="text-center mt-3">
            <span className="inline-block px-3 py-1 text-[10px] font-semibold rounded bg-white/10">
              {section.settings.button_label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeading({ text, color }: { text: string; color: string }) {
  // Strip any HTML tags from heading text for clean display
  const clean = text.replace(/<[^>]*>/g, '').trim();
  if (!clean) return null;
  return (
    <h3
      className="text-xs font-bold mb-2 text-center font-serif"
      style={{ color }}
    >
      {clean}
    </h3>
  );
}

function PreviewBlock({
  block,
  headingColor,
  isSplitMedia,
}: {
  block: { id: string; type: string; settings: Record<string, any> };
  headingColor: string;
  isSplitMedia: boolean;
}) {
  const { settings } = block;
  const align = settings.text_align || 'center';

  // Image block
  if (block.type === 'image' || block.type === 'media') {
    return (
      <div className="flex-1 rounded bg-white/5 min-h-[60px] flex items-center justify-center">
        <svg className="w-6 h-6 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="m3 16 5-5 4 4 4-4 5 5" />
          <circle cx="8.5" cy="8.5" r="1.5" />
        </svg>
      </div>
    );
  }

  return (
    <div className={`rounded p-2 ${isSplitMedia ? 'flex-1' : ''}`} style={{ textAlign: align as any }}>
      {settings.heading && (
        <div className="font-bold text-[11px] mb-0.5 font-serif" style={{ color: headingColor }}>
          {settings.heading}
        </div>
      )}
      {settings.text && (
        <div
          className="text-[9px] opacity-60 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: stripHtmlWrapper(settings.text) }}
        />
      )}
      {settings.button_label && (
        <span className="inline-block mt-1.5 px-2 py-0.5 text-[9px] rounded bg-white/10 font-medium">
          {settings.button_label}
        </span>
      )}
    </div>
  );
}

function PreviewFooter({ design }: { design: ExtractedDesign }) {
  return (
    <div
      className="px-4 py-3 text-[9px] text-center shrink-0"
      style={{ backgroundColor: design.footer.backgroundColor, color: design.footer.textColor }}
    >
      {design.footer.copyright || `© ${new Date().getFullYear()}`}
    </div>
  );
}

/** Strip wrapping <p> tags etc. but keep inner HTML */
function stripHtmlWrapper(html: string): string {
  return html
    .replace(/^<p>\s*/i, '')
    .replace(/\s*<\/p>$/i, '')
    .trim();
}
