import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, X, AlertTriangle, Info, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useExportStore } from '@/store/useExportStore';
import { generateChangeSummary } from '@/lib/kajabi-exporter';
import AppHeader from '@/components/AppHeader';
import ThemePreview from '@/components/ThemePreview';

export default function MappingPage() {
  const navigate = useNavigate();
  const { currentProject, transformationPlan, extractedDesign, isLoading, loadingMessage, removeOperation } = useExportStore();

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
            <Button onClick={handleExport}>
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

            {/* Validation */}
            {transformationPlan.validationWarnings.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning" /> Validation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {transformationPlan.validationWarnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        {w.severity === 'error' ? (
                          <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        ) : w.severity === 'warning' ? (
                          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
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
      </main>
    </div>
  );
}
