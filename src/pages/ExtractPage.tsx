import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Palette, Type, Layout, Image, MousePointer2, Loader2, Sparkles, AlertTriangle, CheckCircle2, Info, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useExportStore } from '@/store/useExportStore';
import AppHeader from '@/components/AppHeader';
import IngestionSummary from '@/components/IngestionSummary';
import type { ExtractedSection, ExtractionWarning } from '@/types';

export default function ExtractPage() {
  const navigate = useNavigate();
  const { currentProject, extractedDesign, extractionWarnings, sourceSnapshot, ingestionWarnings, isLoading, loadingMessage, error } = useExportStore();

  useEffect(() => {
    if (!currentProject) {
      navigate('/');
      return;
    }
  }, [currentProject, navigate]);

  if (!currentProject) return null;

  const handleBuildPlanWithAI = async () => {
    await useExportStore.getState().buildPlanWithAI();
    if (useExportStore.getState().transformationPlan) {
      navigate('/mapping');
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
      <main className="container py-8 max-w-4xl animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-display font-bold">Extracted Design</h2>
            <p className="text-muted-foreground mt-1">
              From <span className="font-medium text-foreground">{currentProject.sourceProjectName}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button onClick={handleBuildPlanWithAI} disabled={!extractedDesign}>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Plan
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive mb-6">
            <CardContent className="pt-6 text-destructive">{error}</CardContent>
          </Card>
        )}

        {!extractedDesign ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Design extraction will begin after source files are loaded.</p>
              <p className="text-sm text-muted-foreground mt-2">This happens automatically when you select a source project.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Ingestion Summary */}
            {sourceSnapshot && (
              <div className="md:col-span-2">
                <IngestionSummary snapshot={sourceSnapshot} warnings={ingestionWarnings} />
              </div>
            )}

            {/* Colors */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Palette className="h-4 w-4 text-primary" /> Colors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {extractedDesign.colors.slice(0, 12).map((color, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border px-2 py-1">
                      <div className="h-5 w-5 rounded-sm border" style={{ backgroundColor: color.value }} />
                      <span className="text-xs font-mono">{color.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{color.usage}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Fonts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Type className="h-4 w-4 text-primary" /> Typography
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Heading</p>
                  <p className="text-lg font-semibold">{extractedDesign.headingFont}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Body</p>
                  <p className="text-lg">{extractedDesign.bodyFont}</p>
                </div>
              </CardContent>
            </Card>

            {/* Button Style */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MousePointer2 className="h-4 w-4 text-primary" /> Button Style
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <button
                    className="px-4 py-2 rounded text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: extractedDesign.buttonStyle.backgroundColor,
                      color: extractedDesign.buttonStyle.textColor,
                      borderRadius: extractedDesign.buttonStyle.borderRadius,
                    }}
                  >
                    Sample Button
                  </button>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Style: {extractedDesign.buttonStyle.style}</p>
                    <p>Radius: {extractedDesign.buttonStyle.borderRadius}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Header */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Layout className="h-4 w-4 text-primary" /> Header
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm">Nav items: {extractedDesign.header.navItems.length}</p>
                  <div className="flex flex-wrap gap-1">
                    {extractedDesign.header.navItems.map((item, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{item.name}</Badge>
                    ))}
                  </div>
                  {extractedDesign.header.sticky && <Badge>Sticky</Badge>}
                </div>
              </CardContent>
            </Card>

            {/* Hero */}
            {extractedDesign.hero && (
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Image className="h-4 w-4 text-primary" /> Hero Section
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                    {extractedDesign.hero.heading && (
                      <h3 className="text-xl font-display font-bold">{extractedDesign.hero.heading}</h3>
                    )}
                    {extractedDesign.hero.subheading && (
                      <p className="text-muted-foreground">{extractedDesign.hero.subheading}</p>
                    )}
                    {extractedDesign.hero.ctaText && (
                      <Badge className="mt-2">{extractedDesign.hero.ctaText}</Badge>
                    )}
                    {extractedDesign.hero.backgroundImage && (
                      <p className="text-xs text-muted-foreground mt-2">📷 Background image detected</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Extraction Warnings */}
            {extractionWarnings.length > 0 && (
              <Card className="md:col-span-2 border-yellow-500/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-yellow-500">
                    <AlertTriangle className="h-4 w-4" /> Extraction Warnings ({extractionWarnings.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {extractionWarnings.map((w, i) => (
                      <WarningRow key={i} warning={w} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Sections with debug info */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Sections ({extractedDesign.sections.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {extractedDesign.sections.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sections detected</p>
                ) : (
                  <div className="space-y-3">
                    {extractedDesign.sections.map((section, i) => (
                      <SectionDebugCard key={section.id} section={section} index={i} warnings={extractionWarnings.filter(w => w.sectionId === section.id)} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Assets */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Assets ({extractedDesign.assets.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {extractedDesign.assets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No assets found</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {extractedDesign.assets.map((asset, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {asset.fileName}
                        {asset.url && <span className="ml-1 text-primary">🔗</span>}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

function WarningRow({ warning }: { warning: ExtractionWarning }) {
  const icon = warning.severity === 'error' ? <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
    : warning.severity === 'warning' ? <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
    : <Info className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
  return (
    <div className="flex items-start gap-2 text-xs">
      {icon}
      <span className="text-muted-foreground">{warning.message}</span>
    </div>
  );
}

function SectionDebugCard({ section, index, warnings }: { section: ExtractedSection; index: number; warnings: ExtractionWarning[] }) {
  const confidenceColor = section.confidence >= 0.8 ? 'text-green-400' : section.confidence >= 0.5 ? 'text-yellow-400' : 'text-red-400';
  const confidencePct = `${(section.confidence * 100).toFixed(0)}%`;

  const flags = [
    section.hasHeading && 'heading',
    section.hasBody && 'body',
    section.hasButtons && 'buttons',
    section.hasImages && 'images',
    section.hasStats && 'stats',
    section.hasTestimonials && 'testimonials',
    section.hasPricing && 'pricing',
    section.hasRepeatedCards && `${section.repeatedItemCount} cards`,
  ].filter(Boolean);

  return (
    <Collapsible>
      <div className="rounded-md border px-3 py-2">
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-mono w-6">{index + 1}</span>
            <Badge variant="outline" className="font-mono text-[11px]">{section.intent}</Badge>
            <span className={`text-xs font-mono ${confidenceColor}`}>{confidencePct}</span>
            <span className="text-sm flex-1 text-left">{section.heading || 'Untitled'}</span>
            {warnings.length > 0 && <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />}
            {section.repeatedItemCount > 0 && (
              <Badge variant="secondary" className="text-[10px]">{section.repeatedItemCount} items</Badge>
            )}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 pt-3 border-t space-y-2 text-xs">
            {/* Source file */}
            {section.sourceFile && (
              <div><span className="text-muted-foreground">Source:</span> <span className="font-mono">{section.sourceFile}</span></div>
            )}

            {/* Evidence */}
            <div>
              <span className="text-muted-foreground">Evidence:</span>
              <ul className="ml-4 mt-1 space-y-0.5 list-disc text-muted-foreground">
                {section.evidence.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>

            {/* Flags */}
            <div className="flex flex-wrap gap-1">
              {flags.map((f, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">{f}</Badge>
              ))}
            </div>

            {/* Media intent */}
            <div>
              <span className="text-muted-foreground">Media:</span>{' '}
              <Badge variant="outline" className="text-[10px] font-mono">{section.mediaIntent}</Badge>
              <span className={`text-xs font-mono ml-2 ${section.mediaConfidence >= 0.8 ? 'text-green-400' : 'text-yellow-400'}`}>
                {(section.mediaConfidence * 100).toFixed(0)}%
              </span>
              {section.mediaEvidence.length > 0 && (
                <ul className="ml-4 mt-1 space-y-0.5 list-disc text-muted-foreground text-xs">
                  {section.mediaEvidence.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
              {section.imageTargets.length > 0 && (
                <div className="ml-4 mt-1 space-y-0.5 text-xs">
                  {section.imageTargets.map((t, i) => (
                    <div key={i} className="text-muted-foreground">
                      <Badge variant="secondary" className="text-[9px] mr-1">{t.role}</Badge>
                      {t.url && <span className="font-mono text-[10px] truncate max-w-[200px] inline-block align-bottom">{t.url.split('/').pop()}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Items preview */}
            {section.items && section.items.length > 0 && (
              <div>
                <span className="text-muted-foreground">Items:</span>
                <div className="ml-4 mt-1 space-y-1">
                  {section.items.map((item, i) => (
                    <div key={i} className="text-muted-foreground">
                      {i + 1}. {item.value && <span className="text-primary font-mono">{item.value}</span>}
                      {item.heading && <span className="font-medium text-foreground"> {item.heading}</span>}
                      {item.quote && <span className="italic"> "{item.quote.slice(0, 60)}…"</span>}
                      {item.price && <span className="text-primary"> {item.price}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section-level warnings */}
            {warnings.length > 0 && (
              <div className="space-y-1 mt-2">
                {warnings.map((w, i) => <WarningRow key={i} warning={w} />)}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
