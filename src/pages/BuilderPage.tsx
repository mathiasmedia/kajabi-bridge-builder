import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Brain, Loader2, Trash2, Star, Lightbulb,
  Send, Wrench, Download, ImagePlus, X, FileArchive, Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useExportStore } from '@/store/useExportStore';
import { applyPlanAndExport } from '@/lib/kajabi-exporter';
import LiveThemePreview from '@/components/LiveThemePreview';

/** Cached section + block map so we only parse the zip once */
let cachedBaseSections: Record<string, string> | null = null;
let cachedBlockMap: Record<string, { type: string; textPreview: string }[]> | null = null;

interface BaseThemeInfo {
  sections: Record<string, string>;
  blockMap: Record<string, { type: string; textPreview: string }[]>;
}

async function getBaseThemeInfo(): Promise<BaseThemeInfo> {
  if (cachedBaseSections && cachedBlockMap) return { sections: cachedBaseSections, blockMap: cachedBlockMap };
  try {
    const resp = await fetch('/base-themes/pro-template.zip');
    const buf = await resp.arrayBuffer();
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buf);
    const sdFile = Object.keys(zip.files).find(p => p.endsWith('config/settings_data.json'));
    if (sdFile) {
      const sd = JSON.parse(await zip.files[sdFile].async('string'));
      const current = sd.current || sd;
      const indexSections: string[] = current.content_for_index || [];
      const sectionMap: Record<string, string> = {};
      const blockMap: Record<string, { blockId: string; type: string; textPreview: string }[]> = {};
      for (const secId of indexSections) {
        const sec = current.sections?.[secId];
        if (!sec) continue;
        sectionMap[secId] = sec.name || sec.type || 'unknown';
        const blocks: { blockId: string; type: string; textPreview: string }[] = [];
        const blockOrder = sec.block_order || [];
        for (const blockId of blockOrder) {
          const block = sec.blocks?.[blockId];
          if (!block) continue;
          const text = block.settings?.text || '';
          const preview = text.replace(/<[^>]*>/g, '').slice(0, 80);
          blocks.push({ blockId, type: block.type, textPreview: preview || `(${block.type} block)` });
        }
        blockMap[secId] = blocks;
      }
      cachedBaseSections = sectionMap;
      cachedBlockMap = blockMap;
      return { sections: sectionMap, blockMap };
    }
  } catch (e) { console.warn('Failed to load base theme info:', e); }
  return { sections: {}, blockMap: {} };
}
interface Template {
  id: string;
  name: string;
  source_project_name: string | null;
  plan_json: any;
  extracted_design_json: any;
  ai_critique: string | null;
}

interface AICritique {
  score: number;
  summary: string;
  issues: { severity: string; description: string; fix: string }[];
  improvements: string[];
}

export default function BuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [critique, setCritique] = useState<AICritique | null>(null);
  const [critiquing, setCritiquing] = useState(false);
  const [tweakPrompt, setTweakPrompt] = useState('');
  const [tweaking, setTweaking] = useState(false);
  const [tweakImage, setTweakImage] = useState<string | null>(null);
  const [tweakLog, setTweakLog] = useState<string[]>([]);
  const [planHistory, setPlanHistory] = useState<any[]>([]);
  const [planVersion, setPlanVersion] = useState(0);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from('saved_templates')
        .select('id, name, source_project_name, plan_json, extracted_design_json, ai_critique')
        .eq('id', id)
        .single();
      if (error || !data) { toast.error('Project not found'); navigate('/'); return; }
      setTemplate(data as Template);
      if (data.ai_critique) { try { setCritique(JSON.parse(data.ai_critique)); } catch {} }
      setLoading(false);
    })();
  }, [id]);

  const handleExport = async () => {
    if (!template) return;
    toast.info('Building zip…');
    try {
      let baseTheme = useExportStore.getState().baseTheme;
      if (!baseTheme) {
        await useExportStore.getState().loadBaseTheme('/base-themes/pro-template.zip');
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
      toast.success('Downloaded');
    } catch (e) { toast.error(`Export failed: ${e instanceof Error ? e.message : e}`); }
  };

  const handleCritique = async () => {
    if (!template) return;
    setCritiquing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-critique', {
        body: { planJson: template.plan_json, extractedDesign: template.extracted_design_json, sourceProjectName: template.source_project_name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCritique(data);
      await supabase.from('saved_templates').update({ ai_critique: JSON.stringify(data) }).eq('id', template.id);
      toast.success(`Score: ${data.score}/10`);
    } catch (e) { toast.error(`Critique failed: ${e instanceof Error ? e.message : e}`); }
    finally { setCritiquing(false); }
  };

  const applyTweak = async (instruction: string, imageData?: string | null) => {
    if (!template) return;
    // Save current plan for undo
    setPlanHistory(prev => [...prev, template.plan_json]);
    setTweaking(true);
    setTweakLog(prev => [...prev, `🔧 ${instruction}${imageData ? ' 📷' : ''}`]);
    try {
      // Use previously extracted design if available, or extract from new image
      let visionDesign = template.extracted_design_json?.visionDesign || null;
      if (imageData) {
        setTweakLog(prev => [...prev, '👁️ Analyzing screenshot…']);
        const { data: visionData, error: visionErr } = await supabase.functions.invoke('ai-vision-extract', {
          body: {
            imageBase64: imageData,
            context: instruction,
          },
        });
        if (!visionErr && visionData?.design) {
          visionDesign = visionData.design;
          // Persist the vision extraction so future tweaks can reuse it
          const updatedDesign = { ...template.extracted_design_json, visionDesign: visionData.design };
          await supabase.from('saved_templates')
            .update({ extracted_design_json: updatedDesign })
            .eq('id', template.id);
          setTemplate(prev => prev ? { ...prev, extracted_design_json: updatedDesign } : prev);
          setTweakLog(prev => [...prev, `✅ Design extracted & saved: ${visionData.design.overallStyle || 'analyzed'}`]);
        } else {
          console.warn('Vision extraction failed, proceeding with raw image:', visionErr || visionData?.error);
          setTweakLog(prev => [...prev, '⚠️ Vision extraction failed — using raw image']);
        }
      } else if (visionDesign) {
        setTweakLog(prev => [...prev, '📋 Using previously extracted design']);
      }

      const { sections: baseSections, blockMap } = await getBaseThemeInfo();

      const body: any = {
        planJson: template.plan_json,
        extractedDesign: template.extracted_design_json,
        tweakInstruction: instruction,
        baseSections,
        blockMap,
        visionDesign,
      };
      if (imageData) body.imageBase64 = imageData;
      const { data, error } = await supabase.functions.invoke('ai-tweak', { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const updatedPlan = { ...template.plan_json, operations: data.operations };
      await supabase.from('saved_templates')
        .update({ plan_json: updatedPlan, ai_critique: null })
        .eq('id', template.id);

      setTemplate(prev => prev ? { ...prev, plan_json: updatedPlan, ai_critique: null } : prev);
      setCritique(null);
      setPlanVersion(v => v + 1);

      const changelog = data.changelog || 'Changes applied';
      setTweakLog(prev => [...prev, `✅ ${changelog} (${data.operations.length} ops)`]);
      toast.success(changelog);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTweakLog(prev => [...prev, `❌ Failed: ${msg}`]);
      toast.error(`Tweak failed: ${msg}`);
    } finally { setTweaking(false); }
  };

  const handleTweakSubmit = () => {
    if (!tweakPrompt.trim() && !tweakImage) return;
    const instruction = tweakPrompt.trim() || 'Analyze the attached image and apply matching design changes';
    const img = tweakImage;
    setTweakPrompt('');
    setTweakImage(null);
    applyTweak(instruction, img);
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

  const handleUndo = async () => {
    if (!template || planHistory.length === 0) return;
    const previousPlan = planHistory[planHistory.length - 1];
    setPlanHistory(prev => prev.slice(0, -1));
    await supabase.from('saved_templates')
      .update({ plan_json: previousPlan, ai_critique: null })
      .eq('id', template.id);
    setTemplate(prev => prev ? { ...prev, plan_json: previousPlan, ai_critique: null } : prev);
    setCritique(null);
    setPlanVersion(v => v + 1);
    setTweakLog(prev => [...prev, '⏪ Undid last tweak']);
    toast.success('Undone');
  };

  const handleDelete = async () => {
    if (!template) return;
    const { error } = await supabase.from('saved_templates').delete().eq('id', template.id);
    if (error) toast.error('Delete failed');
    else { toast.success('Project deleted'); navigate('/'); }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!template) return null;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Compact header */}
      <header className="border-b bg-card shrink-0">
        <div className="flex items-center h-12 px-4 gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Projects
          </Button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FileArchive className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium truncate">{template.name}</span>
            {template.source_project_name && (
              <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                — {template.source_project_name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleUndo} disabled={planHistory.length === 0}>
              <Undo2 className="mr-1 h-3 w-3" /> Undo
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleExport}>
              <Download className="mr-1 h-3 w-3" /> Export Zip
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleCritique} disabled={critiquing}>
              {critiquing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Brain className="mr-1 h-3 w-3" />}
              Critique
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main area: chat sidebar + canvas */}
      <div className="flex flex-1 min-h-0">
        {/* Left: chat/tweak panel */}
        <div className="w-[340px] shrink-0 border-r flex flex-col min-h-0 bg-card">
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                🔧 Tweak & Refine
              </h3>

              {/* Critique results */}
              {critique && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Score: {critique.score}/10</span>
                    <Badge variant="outline" className="text-xs">{critique.issues?.length || 0} issues</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{critique.summary}</p>

                  {critique.issues?.length > 0 && (
                    <div className="space-y-1.5">
                      {critique.issues.map((issue, i) => (
                        <div key={i} className="text-xs border border-border rounded p-2">
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <Badge variant={issue.severity === 'critical' ? 'destructive' : 'outline'} className="text-[10px]">
                              {issue.severity}
                            </Badge>
                            {issue.fix && (
                              <Button
                                variant="ghost" size="sm"
                                className="h-5 px-1.5 text-[10px] text-primary"
                                onClick={() => applyTweak(issue.fix)}
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

                  {critique.improvements?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium flex items-center gap-1">
                        <Lightbulb className="h-3 w-3 text-amber-500" /> Improvements
                      </p>
                      {critique.improvements.map((imp, i) => (
                        <div key={i} className="flex items-start justify-between gap-1 text-xs text-muted-foreground">
                          <span className="leading-relaxed">• {imp}</span>
                          <Button
                            variant="ghost" size="sm"
                            className="h-5 px-1 text-[10px] text-primary shrink-0"
                            onClick={() => applyTweak(imp)}
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
              {tweakLog.length > 0 && (
                <div className="space-y-1">
                  {tweakLog.slice(-8).map((entry, i) => (
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

              {!critique && tweakLog.length === 0 && !tweaking && (
                <p className="text-xs text-muted-foreground py-8 text-center">
                  Describe changes below or run AI Critique to get suggestions
                </p>
              )}
            </div>
          </ScrollArea>

          {/* Tweak input */}
          <div className="p-2 border-t shrink-0 space-y-1.5">
            {tweakImage && (
              <div className="relative inline-block">
                <img src={tweakImage} alt="Tweak reference" className="h-12 rounded border border-border" />
                <button
                  onClick={() => setTweakImage(null)}
                  className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="flex gap-1.5">
              <label className="cursor-pointer flex items-center justify-center h-8 w-8 shrink-0 rounded-md border border-input bg-background hover:bg-accent transition-colors">
                <ImagePlus className="h-3.5 w-3.5 text-muted-foreground" />
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={tweaking} />
              </label>
              <Input
                placeholder="Describe a tweak…"
                value={tweakPrompt}
                onChange={e => setTweakPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleTweakSubmit()}
                disabled={tweaking}
                className="text-sm h-8"
              />
              <Button
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleTweakSubmit}
                disabled={(!tweakPrompt.trim() && !tweakImage) || tweaking}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right: full preview */}
        <div className="flex-1 min-w-0">
          <LiveThemePreview
            key={`${template.id}-${planVersion}`}
            plan={template.plan_json}
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
}
