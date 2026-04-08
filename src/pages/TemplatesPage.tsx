import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain, Loader2, Trash2, FileJson, Star, AlertTriangle, CheckCircle, Lightbulb, RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useExportStore } from '@/store/useExportStore';
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
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponding, setAiResponding] = useState(false);
  const [aiMessages, setAiMessages] = useState<Record<string, Array<{ role: 'user' | 'ai'; text: string }>>>({});

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
    } else {
      setTemplates(data as SavedTemplate[]);
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

  const handleAiAsk = async (template: SavedTemplate) => {
    if (!aiPrompt.trim()) return;
    const question = aiPrompt.trim();
    setAiPrompt('');
    setAiResponding(true);

    // Add user message
    setAiMessages(prev => ({
      ...prev,
      [template.id]: [...(prev[template.id] || []), { role: 'user', text: question }],
    }));

    try {
      const { data, error } = await supabase.functions.invoke('ai-critique', {
        body: {
          planJson: template.plan_json,
          extractedDesign: template.extracted_design_json,
          sourceProjectName: template.source_project_name,
          customPrompt: question,
        },
      });
      if (error) throw error;
      const response = data?.summary || data?.error || 'No response';
      setAiMessages(prev => ({
        ...prev,
        [template.id]: [...(prev[template.id] || []), { role: 'ai', text: typeof data === 'object' ? formatAiResponse(data) : response }],
      }));
    } catch (e) {
      setAiMessages(prev => ({
        ...prev,
        [template.id]: [...(prev[template.id] || []), { role: 'ai', text: `Error: ${e instanceof Error ? e.message : e}` }],
      }));
    } finally {
      setAiResponding(false);
    }
  };

  const handleReExport = async (template: SavedTemplate) => {
    if (!template.source_project_id) {
      toast.error('No source project linked');
      return;
    }
    const store = useExportStore.getState();
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
  const selectedMessages = selectedId ? (aiMessages[selectedId] || []) : [];

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
                        {critiques[t.id] && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            <Star className="h-3 w-3 mr-1" />
                            {critiques[t.id].score}/10
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
                {/* Header + actions */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle>{selected.name}</CardTitle>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleReExport(selected)}>
                          <RefreshCw className="mr-2 h-4 w-4" /> Re-export
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleCritique(selected)} disabled={critiquing === selected.id}>
                          {critiquing === selected.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
                          AI Critique
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(selected.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p><span className="text-muted-foreground">Source:</span> {selected.source_project_name}</p>
                    <p><span className="text-muted-foreground">Operations:</span> {selected.plan_json?.operations?.length || 0}</p>
                    <p><span className="text-muted-foreground">Created:</span> {new Date(selected.created_at).toLocaleString()}</p>
                  </CardContent>
                </Card>

                {/* Two-column: Preview + AI panel */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Visual Preview */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Theme Preview</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[500px]">
                        {selected.extracted_design_json ? (
                          <ThemePreview
                            plan={selected.plan_json}
                            design={selected.extracted_design_json}
                          />
                        ) : (
                          <div className="py-12 text-center text-muted-foreground text-sm">
                            No design data saved with this template
                          </div>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>

                  {/* AI Chat Panel */}
                  <Card className="flex flex-col">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Brain className="h-4 w-4 text-primary" />
                        AI Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col min-h-0">
                      {/* Critique summary (if exists) */}
                      {selectedCritique && (
                        <div className="mb-3 p-3 rounded-md border border-border bg-muted/30 text-sm space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">Score: {selectedCritique.score}/10</span>
                            <Badge variant="outline" className="text-xs">{selectedCritique.issues?.length || 0} issues</Badge>
                          </div>
                          <p className="text-muted-foreground text-xs">{selectedCritique.summary}</p>

                          {selectedCritique.issues?.length > 0 && (
                            <div className="space-y-1.5 mt-2">
                              {selectedCritique.issues.slice(0, 3).map((issue, i) => (
                                <div key={i} className="text-xs border border-border rounded p-2">
                                  <Badge variant={issue.severity === 'critical' ? 'destructive' : 'outline'} className="text-[10px] mb-1">
                                    {issue.severity}
                                  </Badge>
                                  <p className="text-muted-foreground">{issue.description}</p>
                                  {issue.fix && <p className="text-primary mt-0.5">Fix: {issue.fix}</p>}
                                </div>
                              ))}
                              {selectedCritique.issues.length > 3 && (
                                <p className="text-xs text-muted-foreground">+ {selectedCritique.issues.length - 3} more issues</p>
                              )}
                            </div>
                          )}

                          {selectedCritique.patterns?.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs font-medium flex items-center gap-1 mb-1">
                                <CheckCircle className="h-3 w-3 text-emerald-400" /> Good patterns
                              </p>
                              {selectedCritique.patterns.map((p, i) => (
                                <p key={i} className="text-xs text-muted-foreground">• {p.name}: {p.description}</p>
                              ))}
                            </div>
                          )}

                          {selectedCritique.improvements?.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs font-medium flex items-center gap-1 mb-1">
                                <Lightbulb className="h-3 w-3 text-amber-300" /> Improvements
                              </p>
                              {selectedCritique.improvements.map((imp, i) => (
                                <p key={i} className="text-xs text-muted-foreground">• {imp}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Chat messages */}
                      <ScrollArea className="flex-1 min-h-[120px] max-h-[260px] mb-3">
                        <div className="space-y-2">
                          {selectedMessages.map((msg, i) => (
                            <div
                              key={i}
                              className={`text-sm rounded-lg px-3 py-2 ${
                                msg.role === 'user'
                                  ? 'bg-primary/10 text-foreground ml-8'
                                  : 'bg-muted text-muted-foreground mr-4'
                              }`}
                            >
                              <p className="whitespace-pre-wrap text-xs">{msg.text}</p>
                            </div>
                          ))}
                          {aiResponding && (
                            <div className="flex items-center gap-2 text-muted-foreground text-xs px-3 py-2">
                              <Loader2 className="h-3 w-3 animate-spin" /> Analyzing...
                            </div>
                          )}
                        </div>
                      </ScrollArea>

                      {/* Input */}
                      <div className="flex gap-2">
                        <Input
                          placeholder="Ask AI about this template... e.g. 'Why is the button color wrong?'"
                          value={aiPrompt}
                          onChange={e => setAiPrompt(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAiAsk(selected)}
                          disabled={aiResponding}
                          className="text-sm"
                        />
                        <Button
                          size="icon"
                          onClick={() => handleAiAsk(selected)}
                          disabled={!aiPrompt.trim() || aiResponding}
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
                  Select a template to view its preview and AI analysis
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function formatAiResponse(data: any): string {
  if (!data || typeof data !== 'object') return String(data);
  let text = '';
  if (data.summary) text += data.summary + '\n\n';
  if (data.issues?.length > 0) {
    text += '⚠️ Issues:\n';
    data.issues.forEach((i: any) => {
      text += `• [${i.severity}] ${i.description}`;
      if (i.fix) text += ` → ${i.fix}`;
      text += '\n';
    });
    text += '\n';
  }
  if (data.improvements?.length > 0) {
    text += '💡 Suggestions:\n';
    data.improvements.forEach((s: string) => { text += `• ${s}\n`; });
  }
  if (data.patterns?.length > 0) {
    text += '\n✅ Patterns:\n';
    data.patterns.forEach((p: any) => { text += `• ${p.name}: ${p.description}\n`; });
  }
  return text.trim();
}
