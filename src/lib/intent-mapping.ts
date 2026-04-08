/**
 * Intent-to-Kajabi mapping layer.
 *
 * Defines how extracted section intents map to Kajabi section types,
 * block patterns, and quality guards.
 */

import type { SectionIntent, ExtractedSection, TransformationOperation, ValidationWarning, MediaIntent } from '@/types';

// ── Intent → Kajabi section type rules ──────────────────────────────────

export interface IntentToKajabiRule {
  intent: SectionIntent;
  allowedSectionTypes: string[];
  preferredSectionType: string;
  fallbackSectionType: string;
  /** If true, this intent should NOT appear in content_for_index */
  excludeFromContent: boolean;
  /** If true, this intent requires strong evidence to be generated */
  requiresStrongEvidence: boolean;
  /** Minimum confidence threshold to allow generation */
  minConfidence: number;
  /** Minimum number of extracted items required (0 = no requirement) */
  minItems: number;
}

export const INTENT_RULES: IntentToKajabiRule[] = [
  { intent: 'hero',               allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false, requiresStrongEvidence: false, minConfidence: 0.5, minItems: 0 },
  { intent: 'stats',              allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false, requiresStrongEvidence: false, minConfidence: 0.6, minItems: 2 },
  { intent: 'feature_grid',       allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false, requiresStrongEvidence: false, minConfidence: 0.5, minItems: 0 },
  { intent: 'program_cards',      allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false, requiresStrongEvidence: false, minConfidence: 0.6, minItems: 2 },
  { intent: 'testimonial_band',   allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false, requiresStrongEvidence: false, minConfidence: 0.6, minItems: 1 },
  { intent: 'cta_band',           allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false, requiresStrongEvidence: false, minConfidence: 0.5, minItems: 0 },
  { intent: 'content_media_split',allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false, requiresStrongEvidence: false, minConfidence: 0.5, minItems: 0 },
  { intent: 'heading_divider',    allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false, requiresStrongEvidence: false, minConfidence: 0.6, minItems: 0 },
  // FAQ is a MAJOR section — requires strong evidence (accordion + repeated Q/A items)
  { intent: 'faq',                allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false, requiresStrongEvidence: true, minConfidence: 0.7, minItems: 2 },
  { intent: 'footer_like',        allowedSectionTypes: [],          preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: true,  requiresStrongEvidence: false, minConfidence: 0, minItems: 0 },
  { intent: 'unknown',            allowedSectionTypes: ['section'], preferredSectionType: 'section', fallbackSectionType: 'section', excludeFromContent: false, requiresStrongEvidence: false, minConfidence: 0, minItems: 0 },
];

export function getRuleForIntent(intent: SectionIntent): IntentToKajabiRule {
  return INTENT_RULES.find(r => r.intent === intent) || INTENT_RULES[INTENT_RULES.length - 1];
}

// ── Strong-evidence gating ──────────────────────────────────────────────

/**
 * Returns true if the section should be generated, false if it should be skipped.
 * Also returns a reason string if skipped.
 */
export function shouldGenerateSection(section: ExtractedSection): { allowed: boolean; reason?: string } {
  const rule = getRuleForIntent(section.intent);

  // Excluded from content (e.g. footer_like)
  if (rule.excludeFromContent) {
    return { allowed: false, reason: `Intent "${section.intent}" excluded from homepage content` };
  }

  // Confidence gate
  if (section.confidence < rule.minConfidence) {
    return { allowed: false, reason: `Intent "${section.intent}" confidence ${section.confidence.toFixed(2)} below threshold ${rule.minConfidence}` };
  }

  // Item count gate for repeated-item sections
  if (rule.minItems > 0 && (section.items?.length || 0) < rule.minItems) {
    return { allowed: false, reason: `Intent "${section.intent}" requires ${rule.minItems}+ items but has ${section.items?.length || 0}` };
  }

  // Strong evidence gate for major sections (FAQ, pricing, gallery, etc.)
  if (rule.requiresStrongEvidence) {
    if (section.evidence.length < 1) {
      return { allowed: false, reason: `Intent "${section.intent}" requires strong evidence but has none` };
    }
    // Check for structural evidence, not just name-based
    const hasStructuralEvidence = section.evidence.some(e =>
      /item|repeated|accordion|Q\/A|question.*answer|answer.*question/i.test(e)
    );
    if (!hasStructuralEvidence) {
      return { allowed: false, reason: `Intent "${section.intent}" requires structural evidence (e.g. repeated Q/A items) but only has: ${section.evidence.join('; ')}` };
    }
  }

  return { allowed: true };
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

  // Check FAQ generated without strong evidence
  const faqSections = sections.filter(s => s.intent === 'faq');
  const faqOps = addSectionOps.filter(op => (op.label || '').toLowerCase().includes('faq'));
  if (faqOps.length > 0 && faqSections.length === 0) {
    warnings.push({ severity: 'warning', message: 'FAQ section generated but no FAQ intent found in extracted source — may be hallucinated' });
  }
  for (const s of faqSections) {
    if (s.confidence < 0.7 || (s.items?.length || 0) < 2) {
      warnings.push({ severity: 'warning', message: `FAQ section "${s.heading}" has weak evidence (confidence: ${s.confidence}, items: ${s.items?.length || 0})`, target: s.id });
    }
  }

  // Check FAQ rendered without accordion/Q&A semantics
  for (const op of faqOps) {
    const blocks = Object.values(op.section?.blocks || {});
    const hasAccordionBlock = blocks.some((b: any) => b.type === 'accordion');
    const hasQAPattern = blocks.some((b: any) => {
      const text = (b.settings?.text || '');
      return /<h[34]>[^<]*\?<\/h[34]>/.test(text); // question mark in heading
    });
    if (!hasAccordionBlock && !hasQAPattern) {
      warnings.push({ severity: 'warning', message: 'FAQ section rendered without accordion or Q&A heading patterns — interaction semantics lost' });
    }
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
        return text.includes('"') || text.includes('\u201c') || text.includes('italic');
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

  // ── Media quality guards ──

  // Hero missing background image
  const heroSections = sections.filter(s => s.intent === 'hero');
  for (const s of heroSections) {
    if (s.mediaIntent === 'background_image' && s.imageTargets.length > 0) {
      const heroOps = operations.filter(op => {
        if (op.type === 'updateSectionSetting' && (op as any).key === 'bg_image') return true;
        if (op.type === 'addSection' && (op.label || '').toLowerCase().includes('hero')) {
          const bgImg = (op as any).section?.settings?.bg_image;
          return !!bgImg;
        }
        return false;
      });
      if (heroOps.length === 0) {
        warnings.push({ severity: 'warning', message: `Hero has background image in source but output has no bg_image`, target: s.id });
      }
    }
  }

  // Program cards losing images
  for (const s of programSections) {
    if (s.mediaIntent === 'repeated_card_images' && s.imageTargets.length > 0) {
      const matchingOp = addSectionOps.find(op => {
        const label = (op.label || '').toLowerCase();
        return label.includes('program') || label.includes('course');
      });
      if (matchingOp) {
        const blocks = Object.values(matchingOp.section?.blocks || {});
        const hasAnyImage = blocks.some((b: any) => b.settings?.image);
        if (!hasAnyImage) {
          warnings.push({ severity: 'warning', message: `Program cards have ${s.imageTargets.length} images in source but output blocks have no images`, target: s.id });
        }
      }
    }
  }

  // Content media split losing image
  const mediaSplitSections = sections.filter(s => s.intent === 'content_media_split' && s.mediaIntent !== 'no_media');
  for (const s of mediaSplitSections) {
    const matchingOp = addSectionOps.find(op => (op.label || '').toLowerCase().includes('content'));
    if (matchingOp) {
      const blocks = Object.values(matchingOp.section?.blocks || {});
      const hasImage = blocks.some((b: any) => b.type === 'image' || b.settings?.image);
      if (!hasImage) {
        warnings.push({ severity: 'warning', message: `Content/media split section "${s.heading}" lost its image in output`, target: s.id });
      }
    }
  }

  // Available images not consumed
  const allTargets = sections.flatMap(s => s.imageTargets || []);
  const consumedUrls = new Set<string>();
  for (const op of operations) {
    const opStr = JSON.stringify(op);
    for (const t of allTargets) {
      if (t.url && opStr.includes(t.url)) {
        consumedUrls.add(t.url);
      }
    }
  }
  const unconsumedTargets = allTargets.filter(t => t.url && !consumedUrls.has(t.url));
  if (unconsumedTargets.length > 0) {
    warnings.push({
      severity: 'info',
      message: `${unconsumedTargets.length} image URL(s) available but not consumed in output: ${unconsumedTargets.map(t => t.role).join(', ')}`,
    });
  }

  return warnings;
}
