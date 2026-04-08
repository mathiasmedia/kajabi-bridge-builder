/**
 * Refinement Guardrails
 *
 * Prevents refinements from introducing regressions:
 *  - section removal
 *  - CTA count reduction
 *  - style-intent violations (dark→light, branded→placeholder)
 *  - footer/header thinning
 *
 * Works by capturing a before-snapshot, applying the refinement,
 * running a quick structural comparison, and rolling back if worse.
 */

import type { ExtractedDesign, ExtractedSection, TransformationPlan, TransformationOperation } from '@/types';
import type { ComparisonResult, ComparisonMismatch } from '@/lib/render-check-compare';

// ── Style Intent ──────────────────────────────────────────────────────────

export type ColorIntent = 'dark' | 'light' | 'unknown';
export type PanelIntent = 'branded_visual' | 'placeholder' | 'unknown';
export type CtaBandIntent = 'full_width_dark' | 'full_width_light' | 'inner_card' | 'unknown';

export interface SectionStyleIntent {
  sectionId: string;
  intent: string;
  colorIntent: ColorIntent;
  panelIntent: PanelIntent;
  ctaBandIntent: CtaBandIntent;
  ctaCount: number;
  hasRichContent: boolean;
}

/**
 * Extract style-intent for each major source section.
 */
export function extractStyleIntents(design: ExtractedDesign): SectionStyleIntent[] {
  return design.sections.map(s => ({
    sectionId: s.id,
    intent: s.intent,
    colorIntent: inferColorIntent(s),
    panelIntent: inferPanelIntent(s),
    ctaBandIntent: inferCtaBandIntent(s),
    ctaCount: countCtas(s),
    hasRichContent: s.hasRepeatedCards || (s.items?.length || 0) > 1 || !!s.hasChecklist,
  }));
}

export function inferColorIntent(s: ExtractedSection): ColorIntent {
  const bg = (s.backgroundColor || '').toLowerCase();
  if (!bg) return 'unknown';
  // Dark heuristics
  if (bg.includes('#0') || bg.includes('#1') || bg.includes('#2') || bg.includes('#3')) return 'dark';
  if (bg.includes('rgb(0') || bg.includes('rgb(1') || bg.includes('rgb(2') || bg.includes('rgb(3')) return 'dark';
  if (bg.includes('slate-9') || bg.includes('gray-9') || bg.includes('zinc-9') || bg.includes('neutral-9')) return 'dark';
  if (bg.includes('slate-8') || bg.includes('gray-8') || bg.includes('zinc-8') || bg.includes('neutral-8')) return 'dark';
  if (bg.includes('black')) return 'dark';
  // Light heuristics
  if (bg.includes('#f') || bg.includes('#e') || bg.includes('#d') || bg.includes('white')) return 'light';
  return 'unknown';
}

function inferPanelIntent(s: ExtractedSection): PanelIntent {
  if (s.intent === 'content_media_split' && (s.image || s.backgroundImage)) return 'branded_visual';
  if (s.intent === 'content_media_split') return 'placeholder';
  return 'unknown';
}

function inferCtaBandIntent(s: ExtractedSection): CtaBandIntent {
  if (s.intent !== 'cta_band') return 'unknown';
  const color = inferColorIntent(s);
  if (color === 'dark') return 'full_width_dark';
  if (color === 'light') return 'full_width_light';
  return 'unknown';
}

function countCtas(s: ExtractedSection): number {
  let n = 0;
  if (s.ctaText) n++;
  if (s.secondaryCtaText) n++;
  return n;
}

// ── Locked section intents ────────────────────────────────────────────────

const LOCKED_INTENTS = new Set([
  'testimonial_band',
  'program_cards',
  'cta_band',
  'content_media_split',
  'hero',
]);

// ── Regression detection ──────────────────────────────────────────────────

export interface RegressionReport {
  regressions: CriticalRegression[];
  hasCritical: boolean;
}

export interface CriticalRegression {
  kind: string;
  severity: 'critical' | 'warning';
  message: string;
}

/**
 * Compare before/after render-check results and flag critical regressions.
 */
export function detectRegressions(
  before: ComparisonResult,
  after: ComparisonResult,
  sourceIntents: SectionStyleIntent[],
): RegressionReport {
  const regressions: CriticalRegression[] = [];

  // 1. Score regression
  if (after.score < before.score) {
    regressions.push({
      kind: 'score_decreased',
      severity: (before.score - after.score) >= 10 ? 'critical' : 'warning',
      message: `Score dropped from ${before.score} to ${after.score}`,
    });
  }

  // 2. Critical mismatch count increased
  const beforeCritical = countCriticalMismatches(before.mismatches);
  const afterCritical = countCriticalMismatches(after.mismatches);
  if (afterCritical > beforeCritical) {
    regressions.push({
      kind: 'critical_mismatches_increased',
      severity: 'critical',
      message: `Critical mismatches increased from ${beforeCritical} to ${afterCritical}`,
    });
  }

  // 3. Section presence regressions — locked intents must not disappear
  const beforeMissing = new Set(before.mismatches.filter(m => m.category === 'section' && m.message.includes('not found')).map(m => m.message));
  const afterMissing = new Set(after.mismatches.filter(m => m.category === 'section' && m.message.includes('not found')).map(m => m.message));
  for (const msg of afterMissing) {
    if (!beforeMissing.has(msg)) {
      // New missing section
      const isLocked = sourceIntents.some(si => LOCKED_INTENTS.has(si.intent) && msg.toLowerCase().includes(si.intent.replace(/_/g, ' ')));
      regressions.push({
        kind: 'section_removed',
        severity: isLocked ? 'critical' : 'warning',
        message: `Section disappeared after refinement: ${msg.slice(0, 80)}`,
      });
    }
  }

  // 4. Hero regressions
  const beforeHeroErrors = before.mismatches.filter(m => m.category === 'hero' && m.severity === 'error').length;
  const afterHeroErrors = after.mismatches.filter(m => m.category === 'hero' && m.severity === 'error').length;
  if (afterHeroErrors > beforeHeroErrors) {
    regressions.push({
      kind: 'hero_weakened',
      severity: 'critical',
      message: `Hero errors increased from ${beforeHeroErrors} to ${afterHeroErrors}`,
    });
  }

  // 5. CTA count regressions
  const beforeCtaIssues = before.mismatches.filter(m => m.category === 'cta' || (m.category === 'hero' && m.message.toLowerCase().includes('cta'))).length;
  const afterCtaIssues = after.mismatches.filter(m => m.category === 'cta' || (m.category === 'hero' && m.message.toLowerCase().includes('cta'))).length;
  if (afterCtaIssues > beforeCtaIssues) {
    regressions.push({
      kind: 'cta_richness_reduced',
      severity: 'warning',
      message: `CTA-related issues increased from ${beforeCtaIssues} to ${afterCtaIssues}`,
    });
  }

  // 6. Footer regressions
  const beforeFooter = before.mismatches.filter(m => m.category === 'footer').length;
  const afterFooter = after.mismatches.filter(m => m.category === 'footer').length;
  if (afterFooter > beforeFooter) {
    regressions.push({
      kind: 'footer_thinned',
      severity: 'warning',
      message: `Footer issues increased from ${beforeFooter} to ${afterFooter}`,
    });
  }

  // 7. Navigation regressions
  const beforeNav = before.mismatches.filter(m => m.category === 'navigation').length;
  const afterNav = after.mismatches.filter(m => m.category === 'navigation').length;
  if (afterNav > beforeNav) {
    regressions.push({
      kind: 'nav_thinned',
      severity: 'warning',
      message: `Navigation issues increased from ${beforeNav} to ${afterNav}`,
    });
  }

  return {
    regressions,
    hasCritical: regressions.some(r => r.severity === 'critical'),
  };
}

function countCriticalMismatches(mismatches: ComparisonMismatch[]): number {
  return mismatches.filter(m => m.severity === 'error').length;
}

// ── Style-intent violation check ──────────────────────────────────────────

export interface StyleViolation {
  kind: string;
  message: string;
}

/**
 * Check proposed operations against source style intents.
 * Returns violations if operations would change dark→light, branded→placeholder, etc.
 */
export function checkStyleIntentViolations(
  proposedOps: TransformationOperation[],
  sourceIntents: SectionStyleIntent[],
): StyleViolation[] {
  const violations: StyleViolation[] = [];

  for (const op of proposedOps) {
    if (op.type === 'addSection') {
      const sectionSettings = op.section?.settings || {};
      const sectionName = (op.section?.name || '').toLowerCase();

      // Find matching source intent
      const matchingIntent = sourceIntents.find(si =>
        op.sectionId.includes(si.intent.replace(/_/g, '-')) ||
        sectionName.includes(si.intent.replace(/_/g, ' '))
      );

      if (matchingIntent) {
        // Check color intent violation
        if (matchingIntent.colorIntent === 'dark') {
          const bgColor = (sectionSettings.section_bg_color || sectionSettings.background_color || '').toLowerCase();
          if (bgColor && (bgColor.includes('#fff') || bgColor.includes('#fef') || bgColor.includes('white'))) {
            violations.push({
              kind: 'dark_to_light',
              message: `Section "${op.label}" changes dark source intent to light background`,
            });
          }
        }

        // Check panel intent violation
        if (matchingIntent.panelIntent === 'branded_visual') {
          const hasImage = Object.values(op.section?.blocks || {}).some(
            (b: any) => b.settings?.image || b.settings?.background_image
          );
          if (!hasImage) {
            violations.push({
              kind: 'branded_to_placeholder',
              message: `Section "${op.label}" loses branded visual — becomes placeholder`,
            });
          }
        }

        // Check CTA count reduction
        const opCtaCount = Object.values(op.section?.blocks || {}).filter(
          (b: any) => b.settings?.btn_text || b.settings?.button_label
        ).length;
        if (opCtaCount < matchingIntent.ctaCount) {
          violations.push({
            kind: 'cta_count_reduced',
            message: `Section "${op.label}" has ${opCtaCount} CTAs but source has ${matchingIntent.ctaCount}`,
          });
        }
      }
    }
  }

  return violations;
}

// ── Guardrailed apply ─────────────────────────────────────────────────────

export interface GuardrailedResult {
  accepted: string[];
  rejected: Array<{ id: string; reason: string }>;
  styleViolations: StyleViolation[];
}

/**
 * Apply refinement suggestions one at a time with style-intent checks.
 * Returns which were accepted vs rejected.
 * 
 * Note: this does NOT run render checks (that's done in the store).
 * It only does pre-apply style-intent validation.
 */
export function preScreenRefinements(
  suggestions: Array<{ id: string; proposedOperations?: TransformationOperation[]; strategy: string }>,
  sourceIntents: SectionStyleIntent[],
): GuardrailedResult {
  const accepted: string[] = [];
  const rejected: Array<{ id: string; reason: string }> = [];
  const allViolations: StyleViolation[] = [];

  for (const suggestion of suggestions) {
    if (suggestion.strategy !== 'apply_deterministic_fix') {
      accepted.push(suggestion.id);
      continue;
    }

    const ops = suggestion.proposedOperations || [];
    if (ops.length === 0) {
      accepted.push(suggestion.id);
      continue;
    }

    const violations = checkStyleIntentViolations(ops, sourceIntents);
    if (violations.length > 0) {
      rejected.push({
        id: suggestion.id,
        reason: violations.map(v => v.message).join('; '),
      });
      allViolations.push(...violations);
    } else {
      accepted.push(suggestion.id);
    }
  }

  return { accepted, rejected, styleViolations: allViolations };
}
