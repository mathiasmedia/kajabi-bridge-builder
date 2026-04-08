import { useState } from 'react';
import { Eye, Loader2, CheckCircle2, XCircle, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useExportStore } from '@/store/useExportStore';
import type { RenderCheckOutput } from '@/lib/renderer-integration';
import type { ComparisonMismatch } from '@/lib/render-check-compare';

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  error: <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-yellow-500" />,
  info: <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
};

const CATEGORY_LABELS: Record<string, string> = {
  hero: 'Hero',
  cta: 'CTA',
  section: 'Sections',
  navigation: 'Navigation',
  footer: 'Footer',
  content: 'Content',
  render: 'Render',
};

export default function RenderCheckPanel() {
  const { renderCheckResult, isRenderChecking, runRenderCheck, transformationPlan } = useExportStore();
  const [showPreview, setShowPreview] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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

  // Group mismatches by category
  const grouped = comparison?.mismatches?.reduce<Record<string, ComparisonMismatch[]>>((acc, m) => {
    (acc[m.category] = acc[m.category] || []).push(m);
    return acc;
  }, {}) || {};

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="h-4 w-4" />
          Render Check
          {result && comparison && (
            <Badge
              variant={comparison.pass ? 'default' : 'destructive'}
              className="ml-auto text-xs"
            >
              {comparison.score}/100
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Run button */}
        {!result && !isRenderChecking && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Render the generated theme through the Kajabi Liquid engine and compare structurally against the source design.
            </p>
            <Button size="sm" variant="outline" onClick={runRenderCheck}>
              <Eye className="mr-2 h-3.5 w-3.5" />
              Run Render Check
            </Button>
          </div>
        )}

        {/* Loading state */}
        {isRenderChecking && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Rendering through Kajabi engine…</span>
          </div>
        )}

        {/* Error state */}
        {result && !result.success && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <XCircle className="h-4 w-4" />
              Render check failed
            </div>
            <p className="text-xs text-muted-foreground">{result.error}</p>
            <Button size="sm" variant="outline" onClick={runRenderCheck}>
              Retry
            </Button>
          </div>
        )}

        {/* Success state with comparison */}
        {result?.success && comparison && (
          <>
            {/* Summary */}
            <div className="flex items-center gap-2 text-sm">
              {comparison.pass ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              )}
              <span>{comparison.summary}</span>
            </div>

            {/* Diagnostics */}
            {result.diagnostics && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>{result.diagnostics.renderedSectionIds.length} section(s) rendered in {result.diagnostics.renderTimeMs}ms</p>
                {result.diagnostics.missingSectionIds.length > 0 && (
                  <p className="text-yellow-500">{result.diagnostics.missingSectionIds.length} expected section(s) missing from render</p>
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
                          {warnCount > 0 && <Badge variant="outline" className="h-4 px-1 text-[10px] border-yellow-500/50 text-yellow-500">{warnCount}</Badge>}
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

            {/* Toggle rendered preview */}
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? 'Hide' : 'Show'} Rendered Preview
            </Button>

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

            {/* Re-run */}
            <Button size="sm" variant="outline" onClick={runRenderCheck} className="text-xs">
              Re-run Check
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
