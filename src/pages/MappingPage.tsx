import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, X, AlertTriangle, Info, Download, Loader2, ShieldCheck, ShieldAlert, Wrench, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useExportStore } from '@/store/useExportStore';
import { generateChangeSummary } from '@/lib/kajabi-exporter';
import AppHeader from '@/components/AppHeader';
import ThemePreview from '@/components/ThemePreview';

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
  const { currentProject, transformationPlan, extractedDesign, isLoading, loadingMessage, removeOperation, runExportValidation, exportValidation, refinePlanWithAI } = useExportStore();

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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-display font-bold">Transformation Plan</h2>
            <p className="text-muted-foreground mt-1">{transformationPlan.operations.length} operations planned</p>
          </div>
          <div className="flex gap-2">
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column: Source + Validation + Warnings */}
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
                        {exportValidation.autoFixes.map((f, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Check className="h-3 w-3 mt-0.5 shrink-0 text-emerald-500" />
                            <span>{f}</span>
                          </div>
                        ))}
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

            {/* Preview */}
            <Card>
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
          </div>

          {/* Right column: Operations — full width, no truncation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Operations ({changeSummary.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-200px)]">
                <div className="p-3 space-y-1.5">
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

function OperationRow({ item, index, onRemove }: { item: import('@/lib/kajabi-exporter').ChangeSummaryItem; index: number; onRemove: (i: number) => void }) {
  const [showJson, setShowJson] = useState(false);
  const colorClass = OP_TYPE_COLORS[item.type] || 'bg-muted text-muted-foreground border-border';

  return (
    <div className="rounded-md border px-3 py-2 group">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-muted-foreground w-5 shrink-0 text-right">{index + 1}</span>
        <Badge variant="outline" className={`text-[10px] font-mono shrink-0 border ${colorClass}`}>
          {item.type}
        </Badge>
        <span className="text-sm font-medium flex-1 truncate">{item.label}</span>
        {item.json && (
          <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] font-mono text-muted-foreground" onClick={() => setShowJson(!showJson)}>
            {showJson ? '▼ JSON' : '▶ JSON'}
          </Button>
        )}
        <button
          onClick={() => onRemove(index)}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove operation"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </button>
      </div>
      <pre className="text-[11px] text-muted-foreground mt-1 ml-7 whitespace-pre-wrap font-sans">{item.detail}</pre>
      {showJson && item.json && (
        <pre className="text-[10px] text-muted-foreground mt-2 ml-7 whitespace-pre-wrap font-mono bg-muted/50 rounded p-2 max-h-[400px] overflow-auto border">
          {item.json}
        </pre>
      )}
    </div>
  );
}