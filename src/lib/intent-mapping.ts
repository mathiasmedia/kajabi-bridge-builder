/**
 * Intent-to-Kajabi mapping layer.
 *
 * Defines how extracted section intents map to Kajabi section types,
 * block patterns, and quality guards.
 */

import type { SectionIntent, ExtractedSection, TransformationOperation, ValidationWarning } from '@/types';

// ── Intent → Kajabi section type rules ──────────────────────────────────

export interface IntentToKajabiRule {
  intent: SectionIntent;
  allowedSectionTypes: string[];
  preferredSectionType: string;
  fallbackSectionType: string;
  /** If true, this intent should NOT appear in content_for_index */
  excludeFromContent: boolean;
}

export const INTENT_RULES: IntentToKajabiRule[] = [
  { intent: 'hero',               allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false },
  { intent: 'stats',              allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false },
  { intent: 'feature_grid',       allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false },
  { intent: 'program_cards',      allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false },
  { intent: 'testimonial_band',   allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false },
  { intent: 'cta_band',           allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false },
  { intent: 'content_media_split',allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false },
  { intent: 'heading_divider',    allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false },
  { intent: 'faq',                allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false },
  { intent: 'footer_like',        allowedSectionTypes: [],          preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: true },
  { intent: 'unknown',            allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false },
];

export function getRuleForIntent(intent: SectionIntent): IntentToKajabiRule {
  return INTENT_RULES.find(r => r.intent === intent) || INTENT_RULES[INTENT_RULES.length - 1];
}

// ── Mapping quality guards ──────────────────────────────────────────────

export function validateMappingQuality(
  sections: ExtractedSection[],
  operations: TransformationOperation[],
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  const addSectionOps = operations.filter(
    (op): op is Extract<TransformationOperation, { type: 'addSection' }> => op.type === 'addSection',
  );

  // Check hero presence
  const hasHeroSection = sections.some(s => s.intent === 'hero');
  const hasHeroOp = addSectionOps.some(op => (op.label || '').toLowerCase().includes('hero'));
  const hasHeroGlobalOp = operations.some(op =>
    op.type === 'replaceText' && (op as any).sectionId && (op.label || '').toLowerCase().includes('hero'),
  );
  if (hasHeroSection && !hasHeroOp && !hasHeroGlobalOp) {
    warnings.push({ severity: 'warning', message: 'Hero section exists in source but may be missing from output' });
  }

  // Check footer-like in content arrays
  const footerLikeInContent = addSectionOps.filter(op => {
    const label = (op.label || '').toLowerCase();
    return label.includes('footer');
  });
  if (footerLikeInContent.length > 0) {
    warnings.push({ severity: 'warning', message: 'Footer-like section found in homepage content array — should be excluded' });
  }

  // Check stats mapped without values
  const statsSections = sections.filter(s => s.intent === 'stats');
  for (const s of statsSections) {
    const matchingOp = addSectionOps.find(op => (op.label || '').toLowerCase().includes('stat'));
    if (matchingOp) {
      const blocks = Object.values(matchingOp.section?.blocks || {});
      const hasValues = blocks.some((b: any) => {
        const text = (b.settings?.text || '');
        return /<h[34]>[^<]*\d[^<]*<\/h[34]>/.test(text);
      });
      if (!hasValues && s.items && s.items.length > 0) {
        warnings.push({ severity: 'warning', message: `Stats section "${s.heading}" mapped without numeric values`, target: s.id });
      }
    }
  }

  // Check program_cards collapsed
  const programSections = sections.filter(s => s.intent === 'program_cards');
  for (const s of programSections) {
    if (s.items && s.items.length >= 2) {
      const matchingOp = addSectionOps.find(op => {
        const label = (op.label || '').toLowerCase();
        return label.includes('program') || label.includes('course');
      });
      if (matchingOp) {
        const blockCount = Object.keys(matchingOp.section?.blocks || {}).length;
        // Should have at least items.length blocks (plus maybe a heading block)
        if (blockCount < s.items.length) {
          warnings.push({
            severity: 'warning',
            message: `Program cards section "${s.heading}" has ${s.items.length} items but only ${blockCount} blocks — items may be collapsed`,
            target: s.id,
          });
        }
      }
    }
  }

  // Check testimonial_band without items
  const testimonialSections = sections.filter(s => s.intent === 'testimonial_band');
  for (const s of testimonialSections) {
    const matchingOp = addSectionOps.find(op => (op.label || '').toLowerCase().includes('testimonial'));
    if (matchingOp) {
      const blocks = Object.values(matchingOp.section?.blocks || {});
      const hasQuotes = blocks.some((b: any) => {
        const text = (b.settings?.text || '');
        return text.includes('"') || text.includes('"') || text.includes('italic');
      });
      if (!hasQuotes && s.items && s.items.length > 0) {
        warnings.push({ severity: 'warning', message: `Testimonial section "${s.heading}" mapped without quote content`, target: s.id });
      }
    }
  }

  // Check CTA without action
  const ctaSections = sections.filter(s => s.intent === 'cta_band');
  for (const s of ctaSections) {
    if (s.hasButtons) {
      const matchingOp = addSectionOps.find(op => (op.label || '').toLowerCase().includes('cta'));
      if (matchingOp) {
        const blocks = Object.values(matchingOp.section?.blocks || {});
        const hasCta = blocks.some((b: any) => b.type === 'cta' || b.settings?.use_btn === 'true');
        if (!hasCta) {
          warnings.push({ severity: 'warning', message: `CTA section "${s.heading}" mapped without CTA button`, target: s.id });
        }
      }
    }
  }

  // Check heading_divider with low confidence
  const dividerSections = sections.filter(s => s.intent === 'heading_divider' && s.confidence < 0.6);
  for (const s of dividerSections) {
    warnings.push({ severity: 'info', message: `Heading divider "${s.heading}" has low confidence (${s.confidence}) — may be misclassified`, target: s.id });
  }

  return warnings;
}
