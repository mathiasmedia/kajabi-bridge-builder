import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain, Loader2, Trash2, Star, AlertTriangle, CheckCircle, Lightbulb, RefreshCw, Send, Wrench, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useExportStore } from '@/store/useExportStore';
import { applyPlanAndExport } from '@/lib/kajabi-exporter';
import AppHeader from '@/components/AppHeader';
import ThemePreview from '@/components/ThemePreview';

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
  const [tweakPrompt, setTweakPrompt] = useState('');
  const [tweaking, setTweaking] = useState(false);
  const [tweakLog, setTweakLog] = useState<Record<string, string[]>>({});
  const [planVersion, setPlanVersion] = useState(0); // force preview re-render

  useEffect(() => { loadTemplates(); }, []);

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from('saved_templates')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { toast.error('Failed to load templates'); }
    else {
      setTemplates(data as SavedTemplate[]);
      const parsed: Record<string, AICritique> = {};
      for (const t of data as SavedTemplate[]) {
        if (t.ai_critique) { try { parsed[t.id] = JSON.parse(t.ai_critique); } catch {} }
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
        body: { planJson: template.plan_json, extractedDesign: template.extracted_design_json, sourceProjectName: template.source_project_name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCritiques(prev => ({ ...prev, [template.id]: data }));
      await supabase.from('saved_templates').update({ ai_critique: JSON.stringify(data) }).eq('id', template.id);
      toast.success(`Score: ${data.score}/10 — ${data.issues?.length || 0} issues found`);
    } catch (e) { toast.error(`Critique failed: ${e instanceof Error ? e.message : e}`); }
    finally { setCritiquing(null); }
  };

  const applyTweak = async (template: SavedTemplate, instruction: string) => {
    setTweaking(true);
    const logEntry = `🔧 ${instruction}`;
    setTweakLog(prev => ({ ...prev, [template.id]: [...(prev[template.id] || []), logEntry] }));

    try {
      const { data, error } = await supabase.functions.invoke('ai-tweak', {
        body: {
          planJson: template.plan_json,
          extractedDesign: template.extracted_design_json,
          tweakInstruction: instruction,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Update template in-place
      const updatedPlan = { ...template.plan_json, operations: data.operations };
      await supabase.from('saved_templates')
        .update({ plan_json: updatedPlan, ai_critique: null }) // clear old critique
        .eq('id', template.id);

      // Update local state
      setTemplates(prev => prev.map(t =>
        t.id === template.id ? { ...t, plan_json: updatedPlan, ai_critique: null } : t
      ));
      setCritiques(prev => {
        const next = { ...prev };
        delete next[template.id];
        return next;
      });
      setPlanVersion(v => v + 1);

      const changelog = data.changelog || 'Changes applied';
      setTweakLog(prev => ({
        ...prev,
        [template.id]: [...(prev[template.id] || []), `✅ ${changelog} (${data.operations.length} ops)`],
      }));
      toast.success(changelog);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTweakLog(prev => ({
        ...prev,
        [template.id]: [...(prev[template.id] || []), `❌ Failed: ${msg}`],
      }));
      toast.error(`Tweak failed: ${msg}`);
    } finally {
      setTweaking(false);
    }
  };

  const handleTweakSubmit = (template: SavedTemplate) => {
    if (!tweakPrompt.trim()) return;
    const instruction = tweakPrompt.trim();
    setTweakPrompt('');
    applyTweak(template, instruction);
  };

  const handleReExport = async (template: SavedTemplate) => {
    if (!template.source_project_id) { toast.error('No source project linked'); return; }
    const store = useExportStore.getState();
    store.createExportProject({
      id: crypto.randomUUID(),
      name: `Re-export ${template.source_project_name || 'Project'}`,
      sourceProjectId: template.source_project_id,
      sourceProjectName: template.source_project_name || '',
      baseTheme: 'streamlined-home', page: 'index',
      notes: `Re-export based on template "${template.name}"`,
      createdAt: new Date().toISOString(), status: 'new',
    });
    await store.loadBaseTheme('/base-themes/streamlined-home.zip');
    await store.ingestProject({ projectId: template.source_project_id, page: 'index' });
    const updated = useExportStore.getState();
    if (updated.sourceFiles && !updated.error) updated.extractDesign();
    navigate('/extract');
  };

  const handleDownloadZip = async (template: SavedTemplate) => {
    // Re-build zip from current plan
    const baseTheme = useExportStore.getState().baseTheme;
    if (!baseTheme) {
      toast.error('Load a base theme first (start a new export to initialize)');
      return;
    }
    try {
      const blob = await applyPlanAndExport(template.plan_json, baseTheme);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.name.replace(/\s+/g, '-').toLowerCase()}-tweaked.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Zip downloaded');
    } catch (e) {
      toast.error(`Export failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const selected = templates.find(t => t.id === selectedId);
  const selectedCritique = selectedId ? critiques[selectedId] : null;
  const selectedLog = selectedId ? (tweakLog[selectedId] || []) : [];

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
          <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-6">
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
                        {critiques[t.id] && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            <Star className="h-3 w-3 mr-1" />{critiques[t.id].score}/10
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            {/* Detail panel */}
            {selected ? (
              <div className="space-y-4">
                {/* Header */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle>{selected.name}</CardTitle>
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => handleDownloadZip(selected)}>
                          <Download className="mr-2 h-4 w-4" /> Download Zip
                        </Button>
                        <Button size="sm" onClick={() => handleReExport(selected)}>
                          <RefreshCw className="mr-2 h-4 w-4" /> Re-export
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleCritique(selected)} disabled={critiquing === selected.id}>
                          {critiquing === selected.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
                          Critique
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(selected.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p><span className="text-muted-foreground">Source:</span> {selected.source_project_name} · <span className="text-muted-foreground">Ops:</span> {selected.plan_json?.operations?.length || 0} · <span className="text-muted-foreground">Created:</span> {new Date(selected.created_at).toLocaleString()}</p>
                  </CardContent>
                </Card>

                {/* Two-column: Preview + Tweaks */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Visual Preview */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Theme Preview</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[520px]">
                        {selected.extracted_design_json ? (
                          <ThemePreview
                            key={`${selected.id}-${planVersion}`}
                            plan={selected.plan_json}
                            design={selected.extracted_design_json}
                          />
                        ) : (
                          <div className="py-12 text-center text-muted-foreground text-sm">
                            No design data saved
                          </div>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>

                  {/* Tweak Panel */}
                  <Card className="flex flex-col">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-primary" />
                        Tweak & Refine
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col min-h-0">
                      {/* Critique issues with Apply Fix buttons */}
                      {selectedCritique && (
                        <div className="mb-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Score: {selectedCritique.score}/10</span>
                            <Badge variant="outline" className="text-xs">{selectedCritique.issues?.length || 0} issues</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{selectedCritique.summary}</p>

                          {selectedCritique.issues?.length > 0 && (
                            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                              {selectedCritique.issues.map((issue, i) => (
                                <div key={i} className="text-xs border border-border rounded p-2">
                                  <div className="flex items-center justify-between gap-1 mb-1">
                                    <Badge variant={issue.severity === 'critical' ? 'destructive' : 'outline'} className="text-[10px]">
                                      {issue.severity}
                                    </Badge>
                                    {issue.fix && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-[10px] text-primary hover:text-primary"
                                        onClick={() => applyTweak(selected, issue.fix)}
                                        disabled={tweaking}
                                      >
                                        <Wrench className="h-3 w-3 mr-1" /> Apply Fix
                                      </Button>
                                    )}
                                  </div>
                                  <p className="text-muted-foreground">{issue.description}</p>
                                  {issue.fix && <p className="text-primary mt-0.5">Fix: {issue.fix}</p>}
                                </div>
                              ))}
                            </div>
                          )}

                          {selectedCritique.improvements?.length > 0 && (
                            <div className="mt-1">
                              <p className="text-xs font-medium flex items-center gap-1 mb-1">
                                <Lightbulb className="h-3 w-3 text-amber-300" /> Improvements
                              </p>
                              {selectedCritique.improvements.map((imp, i) => (
                                <div key={i} className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
                                  <span>• {imp}</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1.5 text-[10px] text-primary hover:text-primary shrink-0"
                                    onClick={() => applyTweak(selected, imp)}
                                    disabled={tweaking}
                                  >
                                    Apply
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tweak log */}
                      <ScrollArea className="flex-1 min-h-[80px] max-h-[180px] mb-3">
                        <div className="space-y-1.5">
                          {selectedLog.map((entry, i) => (
                            <div key={i} className="text-xs px-2 py-1.5 rounded bg-muted text-muted-foreground">
                              {entry}
                            </div>
                          ))}
                          {tweaking && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-1.5">
                              <Loader2 className="h-3 w-3 animate-spin" /> Applying tweak...
                            </div>
                          )}
                          {selectedLog.length === 0 && !tweaking && (
                            <p className="text-xs text-muted-foreground py-4 text-center">
                              {selectedCritique ? 'Click "Apply Fix" on issues above, or type a custom tweak below' : 'Run AI Critique first, or type a custom tweak below'}
                            </p>
                          )}
                        </div>
                      </ScrollArea>

                      {/* Tweak input */}
                      <div className="flex gap-2">
                        <Input
                          placeholder="e.g. 'Make all buttons use #2eb89a' or 'Fix testimonial widths'"
                          value={tweakPrompt}
                          onChange={e => setTweakPrompt(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleTweakSubmit(selected)}
                          disabled={tweaking}
                          className="text-sm"
                        />
                        <Button
                          size="icon"
                          onClick={() => handleTweakSubmit(selected)}
                          disabled={!tweakPrompt.trim() || tweaking}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <Card>
                <CardContent className="py-20 text-center text-muted-foreground">
                  Select a template to preview and tweak
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
