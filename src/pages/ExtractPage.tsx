import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Palette, Type, Layout, Image, MousePointer2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useExportStore } from '@/store/useExportStore';
import AppHeader from '@/components/AppHeader';

export default function ExtractPage() {
  const navigate = useNavigate();
  const { currentProject, extractedDesign, isLoading, loadingMessage, error } = useExportStore();

  useEffect(() => {
    if (!currentProject) {
      navigate('/');
      return;
    }
  }, [currentProject, navigate]);

  if (!currentProject) return null;

  const handleBuildPlan = () => {
    useExportStore.getState().buildPlan();
    navigate('/mapping');
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
            <Button onClick={handleBuildPlan} disabled={!extractedDesign}>
              Build Plan
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
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Sections */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Sections ({extractedDesign.sections.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {extractedDesign.sections.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sections detected</p>
                ) : (
                  <div className="space-y-2">
                    {extractedDesign.sections.map((section, i) => (
                      <div key={section.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                        <span className="text-xs text-muted-foreground font-mono w-6">{i + 1}</span>
                        <Badge variant="outline">{section.type}</Badge>
                        <span className="text-sm">{section.heading || 'Untitled'}</span>
                      </div>
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
