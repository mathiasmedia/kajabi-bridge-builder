import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, X, AlertTriangle, Info, Download, Loader2, ShieldCheck, ShieldAlert, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useExportStore } from '@/store/useExportStore';
import { generateChangeSummary } from '@/lib/kajabi-exporter';
import AppHeader from '@/components/AppHeader';
import ThemePreview from '@/components/ThemePreview';

export default function MappingPage() {
  const navigate = useNavigate();
  const { currentProject, transformationPlan, extractedDesign, isLoading, loadingMessage, removeOperation, runExportValidation, exportValidation } = useExportStore();
  const [logsOpen, setLogsOpen] = useState(false);
  const [expandedOps, setExpandedOps] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (transformationPlan) {
      runExportValidation();
    }
  }, [transformationPlan, runExportValidation]);

  const canExport = exportValidation?.ready !== false;

  if (!currentProject || (!transformationPlan && !isLoading)) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="container py-20 text-center">
          <p className="text-muted-foreground">No transformation plan available.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>Start Over</Button>
        </main>
      </div>
    );
  }

  const changeSummary = transformationPlan ? generateChangeSummary(transformationPlan) : [];

  const handleExport = async () => {
    if (!canExport) return;
    const blob = await useExportStore.getState().exportZip();
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentProject.name.replace(/\s+/g, '-').toLowerCase()}-kajabi-theme.zip`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const toggleOp = (index: number) => {
    setExpandedOps(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const copyAllOps = () => {
    if (transformationPlan) {
      navigator.clipboard.writeText(JSON.stringify(transformationPlan.operations, null, 2));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="container py-20 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{loadingMessage}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container py-8 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-display font-bold">Transformation Plan</h2>
            <p className="text-muted-foreground mt-1">{transformationPlan.operations.length} operations planned</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/extract')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={handleExport} disabled={!canExport}>
              <Download className="mr-2 h-4 w-4" /> Export Kajabi Zip
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Source summary */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Source Project</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">Project:</span> {currentProject.sourceProjectName}</p>
                <p><span className="text-muted-foreground">Page:</span> {currentProject.page}</p>
                <p><span className="text-muted-foreground">Theme:</span> {currentProject.baseTheme}</p>
                <Separator className="my-3" />
                {extractedDesign && (
                  <>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Extracted</p>
                    <p>{extractedDesign.colors.length} colors</p>
                    <p>Heading: {extractedDesign.headingFont}</p>
                    <p>Body: {extractedDesign.bodyFont}</p>
                    <p>{extractedDesign.sections.length} sections</p>
                    <p>{extractedDesign.assets.length} assets</p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Export Validation Report */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {exportValidation?.ready ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                  )}
                  Export Validation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!exportValidation ? (
                  <p className="text-sm text-muted-foreground">Validating…</p>
                ) : (
                  <>
                    <Badge variant={exportValidation.ready ? 'default' : 'destructive'} className="text-xs">
                      {exportValidation.ready
                        ? 'Ready to export'
                        : `Blocked: ${exportValidation.errors.length} structural error${exportValidation.errors.length !== 1 ? 's' : ''}`}
                    </Badge>

                    {exportValidation.errors.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-destructive uppercase tracking-wide">Errors</p>
                        {exportValidation.errors.map((e, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs text-destructive">
                            <X className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>{e}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {exportValidation.warnings.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-yellow-500 uppercase tracking-wide">Warnings</p>
                        {exportValidation.warnings.map((w, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs text-yellow-500/80">
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {exportValidation.autoFixes.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                          <Wrench className="h-3 w-3" /> Auto-fixes ({exportValidation.autoFixes.length})
                        </p>
                        <ScrollArea className="max-h-[120px]">
                          {exportValidation.autoFixes.map((f, i) => (
                            <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                              <Check className="h-3 w-3 mt-0.5 shrink-0 text-emerald-500" />
                              <span>{f}</span>
                            </div>
                          ))}
                        </ScrollArea>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {transformationPlan.validationWarnings.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" /> Plan Warnings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {transformationPlan.validationWarnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        {w.severity === 'error' ? (
                          <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        ) : w.severity === 'warning' ? (
                          <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                        ) : (
                          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        )}
                        <span>{w.message}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Center: Live Preview */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <ScrollArea className="h-[600px]">
                {extractedDesign && transformationPlan ? (
                  <ThemePreview plan={transformationPlan} design={extractedDesign} />
                ) : (
                  <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                    No preview available
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Right: Operations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Operations ({changeSummary.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <div className="p-4 space-y-2">
                  {changeSummary.map((summary, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border px-3 py-2 group">
                      <Check className="h-3.5 w-3.5 text-success shrink-0" />
                      <span className="text-sm flex-1">{summary}</span>
                      <button
                        onClick={() => removeOperation(i)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove operation"
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Full Operation Logs */}
        <div className="mt-6">
          <Collapsible open={logsOpen} onOpenChange={setLogsOpen}>
            <Card>
              <CardHeader className="pb-2">
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-2 w-full text-left">
                    {logsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <CardTitle className="text-base">Full Operation Logs ({transformationPlan.operations.length})</CardTitle>
                  </button>
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="flex justify-end mb-2">
                    <Button variant="outline" size="sm" onClick={copyAllOps}>
                      <Copy className="h-3 w-3 mr-1" /> Copy All JSON
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                    {transformationPlan.operations.map((op, i) => {
                      const isExpanded = expandedOps.has(i);
                      const opLabel = (op as any).label || (op as any).type || `Operation ${i}`;
                      const opType = (op as any).type || 'unknown';
                      const blockCount = opType === 'addSection'
                        ? Object.keys((op as any).section?.blocks || {}).length
                        : null;

                      return (
                        <div key={i} className="border rounded-md overflow-hidden">
                          <button
                            className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                            onClick={() => toggleOp(i)}
                          >
                            {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                            <Badge variant="outline" className="text-[10px] font-mono shrink-0">{opType}</Badge>
                            <span className="text-xs flex-1 truncate">{opLabel}</span>
                            {blockCount !== null && (
                              <Badge variant={blockCount > 0 ? 'default' : 'destructive'} className="text-[10px] shrink-0">
                                {blockCount} blocks
                              </Badge>
                            )}
                          </button>
                          {isExpanded && (
                            <pre className="px-3 pb-3 text-[11px] leading-relaxed font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all bg-muted/30">
                              {JSON.stringify(op, null, 2)}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>
      </main>
    </div>
  );
}