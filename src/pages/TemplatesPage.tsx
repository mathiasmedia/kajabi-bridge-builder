import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain, Loader2, Trash2, Star, AlertTriangle, CheckCircle, Lightbulb, RefreshCw, Send, Wrench, Download, ImagePlus, X } from 'lucide-react';
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
import LiveThemePreview from '@/components/LiveThemePreview';

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
  const [tweakImage, setTweakImage] = useState<string | null>(null); // base64 data URL
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

  const applyTweak = async (template: SavedTemplate, instruction: string, imageData?: string | null) => {
    setTweaking(true);
    const logEntry = `🔧 ${instruction}${imageData ? ' 📷' : ''}`;
    setTweakLog(prev => ({ ...prev, [template.id]: [...(prev[template.id] || []), logEntry] }));

    try {
      const body: any = {
        planJson: template.plan_json,
        extractedDesign: template.extracted_design_json,
        tweakInstruction: instruction,
      };
      if (imageData) body.imageBase64 = imageData;

      const { data, error } = await supabase.functions.invoke('ai-tweak', { body });
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
    if (!tweakPrompt.trim() && !tweakImage) return;
    const instruction = tweakPrompt.trim() || 'Analyze the attached image and apply matching design changes';
    const img = tweakImage;
    setTweakPrompt('');
    setTweakImage(null);
    applyTweak(template, instruction, img);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setTweakImage(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleReExport = async (template: SavedTemplate) => {
    toast.info('Building zip from current plan…');
    try {
      // Ensure base theme is loaded
      let baseTheme = useExportStore.getState().baseTheme;
      if (!baseTheme) {
        await useExportStore.getState().loadBaseTheme('/base-themes/streamlined-home.zip');
        baseTheme = useExportStore.getState().baseTheme;
      }
      if (!baseTheme) { toast.error('Failed to load base theme'); return; }

      const blob = await applyPlanAndExport(template.plan_json, baseTheme);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.name.replace(/\s+/g, '-').toLowerCase()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Zip downloaded');
    } catch (e) {
      toast.error(`Export failed: ${e instanceof Error ? e.message : e}`);
    }
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
        ) : selected ? (
            <div className="flex gap-4 h-[calc(100vh-160px)]">
              {/* Left sidebar: template list + tweak panel */}
              <div className="w-[340px] shrink-0 flex flex-col gap-3 min-h-0">
                {/* Template selector (compact) */}
                <ScrollArea className="h-[140px] shrink-0">
                  <div className="space-y-1 pr-2">
                    {templates.map(t => (
                      <div
                        key={t.id}
                        className={`cursor-pointer rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent ${selectedId === t.id ? 'bg-accent border border-primary' : ''}`}
                        onClick={() => setSelectedId(t.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{t.name}</span>
                          {critiques[t.id] && (
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              <Star className="h-3 w-3 mr-0.5" />{critiques[t.id].score}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{t.source_project_name} · {t.plan_json?.operations?.length || 0} ops</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Actions bar */}
                <div className="flex gap-1.5 flex-wrap shrink-0">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleDownloadZip(selected)}>
                    <Download className="mr-1 h-3 w-3" /> Zip
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={() => handleReExport(selected)}>
                    <RefreshCw className="mr-1 h-3 w-3" /> Re-export
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleCritique(selected)} disabled={critiquing === selected.id}>
                    {critiquing === selected.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Brain className="mr-1 h-3 w-3" />}
                    Critique
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleDelete(selected.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>

                {/* Critique & tweak panel */}
                <div className="flex-1 min-h-0 flex flex-col border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/30 shrink-0">
                    <h3 className="text-sm font-medium flex items-center gap-1.5">
                      <Wrench className="h-3.5 w-3.5 text-primary" /> Tweak & Refine
                    </h3>
                  </div>

                  <ScrollArea className="flex-1 min-h-0">
                    <div className="p-3 space-y-3">
                      {/* Critique issues */}
                      {selectedCritique && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Score: {selectedCritique.score}/10</span>
                            <Badge variant="outline" className="text-xs">{selectedCritique.issues?.length || 0} issues</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{selectedCritique.summary}</p>

                          {selectedCritique.issues?.length > 0 && (
                            <div className="space-y-1.5">
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
                                        className="h-5 px-1.5 text-[10px] text-primary hover:text-primary"
                                        onClick={() => applyTweak(selected, issue.fix)}
                                        disabled={tweaking}
                                      >
                                        <Wrench className="h-3 w-3 mr-0.5" /> Fix
                                      </Button>
                                    )}
                                  </div>
                                  <p className="text-muted-foreground">{issue.description}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {selectedCritique.improvements?.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium flex items-center gap-1">
                                <Lightbulb className="h-3 w-3 text-amber-500" /> Improvements
                              </p>
                              {selectedCritique.improvements.map((imp, i) => (
                                <div key={i} className="flex items-start justify-between gap-1 text-xs text-muted-foreground">
                                  <span className="leading-relaxed">• {imp}</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1 text-[10px] text-primary hover:text-primary shrink-0"
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
                      {selectedLog.length > 0 && (
                        <div className="space-y-1">
                          {selectedLog.slice(-5).map((entry, i) => (
                            <div key={i} className="text-[10px] px-2 py-1 rounded bg-muted text-muted-foreground">
                              {entry}
                            </div>
                          ))}
                          {tweaking && (
                            <div className="flex items-center gap-1 text-[10px] px-2 py-1 text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" /> Applying…
                            </div>
                          )}
                        </div>
                      )}

                      {!selectedCritique && selectedLog.length === 0 && !tweaking && (
                        <p className="text-xs text-muted-foreground py-6 text-center">
                          Run AI Critique or type a tweak below
                        </p>
                      )}
                    </div>
                  </ScrollArea>

                  {/* Tweak input pinned at bottom */}
                  <div className="p-2 border-t shrink-0">
                    <div className="flex gap-1.5">
                      <Input
                        placeholder="Describe a tweak…"
                        value={tweakPrompt}
                        onChange={e => setTweakPrompt(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleTweakSubmit(selected)}
                        disabled={tweaking}
                        className="text-sm h-8"
                      />
                      <Button
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => handleTweakSubmit(selected)}
                        disabled={!tweakPrompt.trim() || tweaking}
                      >
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: full preview */}
              <div className="flex-1 min-w-0">
                <LiveThemePreview
                  key={`${selected.id}-${planVersion}`}
                  plan={selected.plan_json}
                  className="rounded-lg border overflow-hidden h-full"
                />
              </div>
            </div>
          ) : (
            /* No template selected — show list */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(t => (
                <Card
                  key={t.id}
                  className="cursor-pointer transition-colors hover:border-primary/50"
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
          )}
        </main>
    </div>
  );
}
