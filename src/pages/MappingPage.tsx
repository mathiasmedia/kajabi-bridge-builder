import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, X, AlertTriangle, Info, Download, Loader2, ShieldCheck, ShieldAlert, Wrench, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useExportStore } from '@/store/useExportStore';
import { generateChangeSummary, type ChangeSummaryItem } from '@/lib/kajabi-exporter';
import AppHeader from '@/components/AppHeader';
import RenderCheckPanel from '@/components/RenderCheckPanel';

const OP_TYPE_COLORS: Record<string, string> = {
  addSection: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  addBlock: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  updateGlobalSetting: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  updateSectionSetting: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  updateBlockSetting: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  replaceText: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  hideSection: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
  showSection: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
  updateNavigation: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
  addCssOverride: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  replaceLogo: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  replaceImage: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
};

export default function MappingPage() {
  const navigate = useNavigate();
  const {
    currentProject,
    transformationPlan,
    extractedDesign,
    isLoading,
    loadingMessage,
    removeOperation,
    runExportValidation,
    exportValidation,
    refinePlanWithAI,
  } = useExportStore();

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
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold">Transformation Plan</h2>
            <p className="mt-1 text-muted-foreground">{transformationPlan.operations.length} operations planned</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" onClick={() => navigate('/extract')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button variant="outline" onClick={() => refinePlanWithAI()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Improve
            </Button>
            <Button onClick={handleExport} disabled={!canExport}>
              <Download className="mr-2 h-4 w-4" /> Export Kajabi Zip
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] gap-6 items-start">
          <div className="min-w-0 space-y-4">
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
                    <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Extracted</p>
                    <p>{extractedDesign.colors.length} colors</p>
                    <p>Heading: {extractedDesign.headingFont}</p>
                    <p>Body: {extractedDesign.bodyFont}</p>
                    <p>{extractedDesign.sections.length} sections</p>
                    <p>{extractedDesign.assets.length} assets</p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
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
                        <p className="text-xs font-medium uppercase tracking-wide text-destructive">Errors</p>
                        {exportValidation.errors.map((e, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs text-destructive">
                            <X className="mt-0.5 h-3 w-3 shrink-0" />
                            <span className="break-words">{e}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {exportValidation.warnings.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-yellow-500">Warnings</p>
                        {exportValidation.warnings.map((w, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs text-yellow-500/80">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            <span className="break-words">{w}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {exportValidation.autoFixes.length > 0 && (
                      <div className="space-y-1">
                        <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          <Wrench className="h-3 w-3" /> Auto-fixes ({exportValidation.autoFixes.length})
                        </p>
                        <div className="space-y-1">
                          {exportValidation.autoFixes.map((f, i) => (
                            <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                              <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                              <span className="break-words">{f}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {transformationPlan.validationWarnings.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" /> Plan Warnings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {transformationPlan.validationWarnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        {w.severity === 'error' ? (
                          <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        ) : w.severity === 'warning' ? (
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                        ) : (
                          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="break-words">{w.message}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

          </div>

          <Card className="min-w-0 max-w-full overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Operations ({changeSummary.length})</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 max-w-full p-0">
              <ScrollArea className="h-[calc(100vh-200px)] w-full">
                <div className="min-w-0 space-y-2 p-3">
                  {changeSummary.map((item, i) => (
                    <OperationRow key={i} item={item} index={i} onRemove={removeOperation} />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function OperationRow({ item, index, onRemove }: { item: ChangeSummaryItem; index: number; onRemove: (i: number) => void }) {
  const [showJson, setShowJson] = useState(false);
  const colorClass = OP_TYPE_COLORS[item.type] || 'bg-muted text-muted-foreground border-border';

  return (
    <div className="min-w-0 rounded-md border p-3">
      <div className="flex items-start gap-3 min-w-0">
        <span className="mt-1 shrink-0 text-right font-mono text-[10px] text-muted-foreground">{index + 1}</span>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="outline" className={`shrink-0 border font-mono text-[10px] ${colorClass}`}>
              {item.type}
            </Badge>
            <span className="min-w-0 break-words text-sm font-medium">{item.label}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {item.json && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 whitespace-nowrap px-2 font-mono text-[10px] text-muted-foreground"
                onClick={() => setShowJson(!showJson)}
              >
                {showJson ? 'Hide JSON' : 'Show JSON'}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 whitespace-nowrap px-2 text-[10px] text-muted-foreground"
              onClick={() => onRemove(index)}
            >
              Remove
            </Button>
          </div>
        </div>
      </div>

      <pre className="mt-2 ml-6 max-w-full overflow-x-auto whitespace-pre-wrap break-words font-sans text-[11px] text-muted-foreground">
        {item.detail}
      </pre>

      {showJson && item.json && (
        <pre className="mt-2 ml-6 max-h-[420px] max-w-full overflow-auto break-all whitespace-pre-wrap rounded border bg-muted/50 p-2 font-mono text-[10px] text-muted-foreground">
          {item.json}
        </pre>
      )}
    </div>
  );
}
