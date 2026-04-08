import { useState, useEffect } from 'react';
import { Eye, Loader2, CheckCircle2, XCircle, AlertTriangle, Info, ChevronDown, ChevronUp, Wrench, Zap, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useExportStore } from '@/store/useExportStore';
import type { ComparisonMismatch } from '@/lib/render-check-compare';
import type { RefinementSuggestion } from '@/lib/render-check-refinement';

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  error: <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />,
  info: <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
};

const CATEGORY_LABELS: Record<string, string> = {
  hero: 'Hero', cta: 'CTA', section: 'Sections', navigation: 'Navigation',
  footer: 'Footer', content: 'Content', render: 'Render',
};

const STRATEGY_LABELS: Record<string, { label: string; color: string }> = {
  apply_deterministic_fix: { label: 'Auto-fix', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  regenerate_section: { label: 'Regenerate', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  strengthen_existing_section: { label: 'Strengthen', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  warn_only: { label: 'Info', color: 'bg-muted text-muted-foreground border-border' },
};

export default function RenderCheckPanel() {
  const {
    renderCheckResult, isRenderChecking, runRenderCheck,
    transformationPlan, refinementResult, previousScore,
    generateRefinements, applyRefinement, applyAllSafeRefinements,
  } = useExportStore();
  const [showPreview, setShowPreview] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Auto-generate refinements when render check completes
  useEffect(() => {
    if (renderCheckResult?.success && renderCheckResult.comparison && !refinementResult) {
      generateRefinements();
    }
  }, [renderCheckResult, refinementResult, generateRefinements]);

  if (!transformationPlan) return null;

  const result = renderCheckResult;
  const comparison = result?.comparison;

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const grouped = comparison?.mismatches?.reduce<Record<string, ComparisonMismatch[]>>((acc, m) => {
    (acc[m.category] = acc[m.category] || []).push(m);
    return acc;
  }, {}) || {};

  const deterministicSuggestions = refinementResult?.suggestions.filter(
    s => s.strategy === 'apply_deterministic_fix' && s.proposedOperations?.length
  ) || [];

  const otherSuggestions = refinementResult?.suggestions.filter(
    s => s.strategy !== 'apply_deterministic_fix'
  ) || [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="h-4 w-4" />
          Render Check
          {result && comparison && (
            <Badge variant={comparison.pass ? 'default' : 'destructive'} className="ml-auto text-xs">
              {comparison.score}/100
              {previousScore !== null && previousScore !== comparison.score && (
                <span className="ml-1 opacity-70">
                  (was {previousScore})
                </span>
              )}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Initial state */}
        {!result && !isRenderChecking && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Render through Kajabi Liquid engine and compare against source.
            </p>
            <Button size="sm" variant="outline" onClick={runRenderCheck}>
              <Eye className="mr-2 h-3.5 w-3.5" /> Run Render Check
            </Button>
          </div>
        )}

        {/* Loading */}
        {isRenderChecking && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Rendering through Kajabi engine…
          </div>
        )}

        {/* Error */}
        {result && !result.success && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <XCircle className="h-4 w-4" /> Render check failed
            </div>
            <p className="text-xs text-muted-foreground">{result.error}</p>
            <Button size="sm" variant="outline" onClick={runRenderCheck}>Retry</Button>
          </div>
        )}

        {/* Success */}
        {result?.success && comparison && (
          <>
            {/* Summary */}
            <div className="flex items-center gap-2 text-sm">
              {comparison.pass ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
              <span>{comparison.summary}</span>
            </div>

            {/* Diagnostics */}
            {result.diagnostics && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>{result.diagnostics.renderedSectionIds.length} section(s) rendered in {result.diagnostics.renderTimeMs}ms</p>
                {result.diagnostics.missingSectionIds.length > 0 && (
                  <p className="text-amber-500">{result.diagnostics.missingSectionIds.length} expected section(s) missing</p>
                )}
              </div>
            )}

            {/* Mismatch categories */}
            {Object.keys(grouped).length > 0 && (
              <div className="space-y-1.5">
                {Object.entries(grouped).map(([category, items]) => {
                  const expanded = expandedCategories.has(category);
                  const errorCount = items.filter(i => i.severity === 'error').length;
                  const warnCount = items.filter(i => i.severity === 'warning').length;
                  return (
                    <div key={category} className="rounded border">
                      <button
                        className="flex w-full items-center gap-2 p-2 text-left text-xs hover:bg-muted/50"
                        onClick={() => toggleCategory(category)}
                      >
                        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        <span className="font-medium">{CATEGORY_LABELS[category] || category}</span>
                        <span className="ml-auto flex gap-1">
                          {errorCount > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px]">{errorCount}</Badge>}
                          {warnCount > 0 && <Badge variant="outline" className="h-4 px-1 text-[10px] border-amber-500/50 text-amber-500">{warnCount}</Badge>}
                        </span>
                      </button>
                      {expanded && (
                        <div className="border-t px-2 py-1.5 space-y-1">
                          {items.map((m, i) => (
                            <div key={i} className="flex items-start gap-1.5 text-[11px]">
                              {SEVERITY_ICON[m.severity]}
                              <span className="break-words">{m.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Refinement Suggestions ── */}
            {refinementResult && refinementResult.suggestions.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-medium">
                      <Wrench className="h-3.5 w-3.5" />
                      Refinement Suggestions ({refinementResult.suggestions.length})
                    </p>
                    {deterministicSuggestions.length > 0 && (
                      <Button size="sm" variant="default" className="h-6 text-[10px] px-2" onClick={applyAllSafeRefinements}>
                        <Zap className="mr-1 h-3 w-3" />
                        Apply {deterministicSuggestions.length} safe fix{deterministicSuggestions.length !== 1 ? 'es' : ''}
                      </Button>
                    )}
                  </div>

                  {/* Deterministic fixes */}
                  {deterministicSuggestions.length > 0 && (
                    <div className="space-y-1">
                      {deterministicSuggestions.map(s => (
                        <SuggestionRow key={s.id} suggestion={s} onApply={() => applyRefinement(s.id)} />
                      ))}
                    </div>
                  )}

                  {/* Other suggestions */}
                  {otherSuggestions.length > 0 && (
                    <div className="space-y-1">
                      {otherSuggestions.map(s => (
                        <SuggestionRow key={s.id} suggestion={s} />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Actions row */}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowPreview(!showPreview)}>
                {showPreview ? 'Hide' : 'Show'} Preview
              </Button>
              <Button size="sm" variant="outline" className="text-xs" onClick={runRenderCheck}>
                <RotateCcw className="mr-1 h-3 w-3" /> Re-check
              </Button>
            </div>

            {showPreview && result.renderedHtml && (
              <ScrollArea className="h-[500px] w-full rounded border">
                <iframe
                  srcDoc={result.renderedHtml}
                  className="h-[2000px] w-full border-0"
                  sandbox="allow-same-origin"
                  title="Kajabi Render Check Preview"
                />
              </ScrollArea>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SuggestionRow({ suggestion, onApply }: { suggestion: RefinementSuggestion; onApply?: () => void }) {
  const style = STRATEGY_LABELS[suggestion.strategy] || STRATEGY_LABELS.warn_only;
  return (
    <div className="flex items-start gap-2 rounded border p-2 text-[11px]">
      {SEVERITY_ICON[suggestion.severity]}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={`shrink-0 border text-[9px] px-1 h-4 ${style.color}`}>
            {style.label}
          </Badge>
          <span className="break-words">{suggestion.message}</span>
        </div>
        {suggestion.targetIntent && (
          <span className="text-muted-foreground text-[10px]">Target: {suggestion.targetIntent}</span>
        )}
      </div>
      {onApply && suggestion.strategy === 'apply_deterministic_fix' && (
        <Button size="sm" variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]" onClick={onApply}>
          Apply
        </Button>
      )}
    </div>
  );
}
