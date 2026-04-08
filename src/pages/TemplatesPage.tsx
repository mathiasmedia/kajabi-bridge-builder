import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain, Loader2, Trash2, FileJson, Star, AlertTriangle, CheckCircle, Lightbulb, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useExportStore } from '@/store/useExportStore';
import { hasProjectBundle } from '@/lib/project-bundles';
import AppHeader from '@/components/AppHeader';

interface SavedTemplate {
  id: string;
  name: string;
  source_project_id: string | null;
  source_project_name: string | null;
  plan_json: any;
  extracted_design_json: any;
  zip_storage_path: string | null;
  ai_critique: string | null;
  notes: string | null;
  created_at: string;
}

interface AICritique {
  score: number;
  summary: string;
  issues: { severity: string; description: string; fix: string }[];
  patterns: { name: string; description: string; example?: string }[];
  improvements: string[];
}

export default function TemplatesPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [critiquing, setCritiquing] = useState<string | null>(null);
  const [critiques, setCritiques] = useState<Record<string, AICritique>>({});

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from('saved_templates')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Failed to load templates');
      console.error(error);
    } else {
      setTemplates(data as SavedTemplate[]);
      // Parse stored critiques
      const parsed: Record<string, AICritique> = {};
      for (const t of data as SavedTemplate[]) {
        if (t.ai_critique) {
          try { parsed[t.id] = JSON.parse(t.ai_critique); } catch {}
        }
      }
      setCritiques(parsed);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('saved_templates').delete().eq('id', id);
    if (error) toast.error('Delete failed');
    else {
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (selectedId === id) setSelectedId(null);
      toast.success('Template deleted');
    }
  };

  const handleCritique = async (template: SavedTemplate) => {
    setCritiquing(template.id);
    try {
      const { data, error } = await supabase.functions.invoke('ai-critique', {
        body: {
          planJson: template.plan_json,
          extractedDesign: template.extracted_design_json,
          sourceProjectName: template.source_project_name,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setCritiques(prev => ({ ...prev, [template.id]: data }));
      
      // Persist critique
      await supabase.from('saved_templates')
        .update({ ai_critique: JSON.stringify(data) })
        .eq('id', template.id);
      
      toast.success(`Score: ${data.score}/10 — ${data.issues?.length || 0} issues found`);
    } catch (e) {
      toast.error(`Critique failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setCritiquing(null);
    }
  };

  const handleReExport = async (template: SavedTemplate) => {
    if (!template.source_project_id) {
      toast.error('No source project linked to this template');
      return;
    }
    const store = useExportStore.getState();
    // Create a new export project with the same source
    store.createExportProject({
      id: crypto.randomUUID(),
      name: `Re-export ${template.source_project_name || 'Project'}`,
      sourceProjectId: template.source_project_id,
      sourceProjectName: template.source_project_name || '',
      baseTheme: 'streamlined-home',
      page: 'index',
      notes: `Re-export based on template "${template.name}"`,
      createdAt: new Date().toISOString(),
      status: 'new',
    });
    // Load base theme + ingest
    await store.loadBaseTheme('/base-themes/streamlined-home.zip');
    await store.ingestProject({ projectId: template.source_project_id, page: 'index' });
    const updated = useExportStore.getState();
    if (updated.sourceFiles && !updated.error) {
      updated.extractDesign();
    }
    navigate('/extract');
  };

  const selected = templates.find(t => t.id === selectedId);
  const selectedCritique = selectedId ? critiques[selectedId] : null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container py-8 animate-fade-in">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold">Saved Templates</h2>
            <p className="mt-1 text-muted-foreground">{templates.length} templates saved</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No saved templates yet. Export a project and click "Save Template" on the mapping page.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
            {/* Template list */}
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-2 pr-2">
                {templates.map(t => (
                  <Card
                    key={t.id}
                    className={`cursor-pointer transition-colors hover:border-primary/50 ${selectedId === t.id ? 'border-primary' : ''}`}
                    onClick={() => setSelectedId(t.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{t.source_project_name}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(t.created_at).toLocaleDateString()} · {t.plan_json?.operations?.length || 0} ops
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {critiques[t.id] && (
                            <Badge variant="outline" className="text-xs">
                              <Star className="h-3 w-3 mr-1" />
                              {critiques[t.id].score}/10
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            {/* Detail panel */}
            {selected ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{selected.name}</CardTitle>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCritique(selected)}
                          disabled={critiquing === selected.id}
                        >
                          {critiquing === selected.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Brain className="mr-2 h-4 w-4" />
                          )}
                          AI Critique
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(selected.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p><span className="text-muted-foreground">Source:</span> {selected.source_project_name}</p>
                    <p><span className="text-muted-foreground">Operations:</span> {selected.plan_json?.operations?.length || 0}</p>
                    <p><span className="text-muted-foreground">Created:</span> {new Date(selected.created_at).toLocaleString()}</p>
                    {selected.zip_storage_path && (
                      <p className="flex items-center gap-1"><FileJson className="h-4 w-4 text-muted-foreground" /> Zip saved</p>
                    )}
                  </CardContent>
                </Card>

                {/* AI Critique results */}
                {selectedCritique && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        AI Critique — {selectedCritique.score}/10
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm">{selectedCritique.summary}</p>

                      {selectedCritique.issues?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                            <AlertTriangle className="h-4 w-4 text-amber-400" /> Issues
                          </h4>
                          <div className="space-y-2">
                            {selectedCritique.issues.map((issue, i) => (
                              <div key={i} className="text-sm border border-border rounded-md p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant={issue.severity === 'critical' ? 'destructive' : 'outline'} className="text-xs">
                                    {issue.severity}
                                  </Badge>
                                </div>
                                <p className="text-muted-foreground">{issue.description}</p>
                                {issue.fix && <p className="mt-1 text-primary text-xs">Fix: {issue.fix}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedCritique.patterns?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                            <CheckCircle className="h-4 w-4 text-emerald-400" /> Patterns (reuse in future)
                          </h4>
                          <div className="space-y-2">
                            {selectedCritique.patterns.map((p, i) => (
                              <div key={i} className="text-sm border border-border rounded-md p-3">
                                <p className="font-medium">{p.name}</p>
                                <p className="text-muted-foreground">{p.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedCritique.improvements?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                            <Lightbulb className="h-4 w-4 text-amber-300" /> Improvements
                          </h4>
                          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                            {selectedCritique.improvements.map((imp, i) => (
                              <li key={i}>{imp}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Plan JSON preview */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Plan Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64">
                      <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                        {JSON.stringify(selected.plan_json?.operations?.slice(0, 10), null, 2)}
                        {(selected.plan_json?.operations?.length || 0) > 10 && '\n\n... and more operations'}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="py-20 text-center text-muted-foreground">
                  Select a template to view details and run AI critique
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
