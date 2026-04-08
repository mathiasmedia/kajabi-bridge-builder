import { useState, useRef } from 'react';
import { Loader2, ImagePlus, X, Globe, Type } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}

export default function NewProjectDialog({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name} exceeds 5MB limit`); continue; }
      const reader = new FileReader();
      reader.onload = () => setImages(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    }
    if (e.target) e.target.value = '';
  };

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx));

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Please enter a project name'); return; }
    if (!url.trim() && images.length === 0 && !description.trim()) {
      toast.error('Provide at least a URL, image, or description');
      return;
    }

    setCreating(true);
    setProgress(0);
    try {
      // Step 1: Analyze the reference
      setStatus('Analyzing design…');
      setProgress(10);
      const { data: analysis, error: analyzeErr } = await supabase.functions.invoke('ai-analyze', {
        body: {
          referenceUrl: url.trim() || null,
          referenceImages: images.length > 0 ? images : null,
          description: description.trim() || null,
        },
      });

      if (analyzeErr) throw analyzeErr;
      if (analysis?.error) throw new Error(analysis.error);

      const sections = analysis.sections || [];
      const brandAnalysis = analysis.brandAnalysis || {};
      const totalSections = sections.length;

      if (totalSections === 0) throw new Error('No sections detected in the design');

      setStatus(`Found ${totalSections} sections — generating…`);
      setProgress(20);

      // Step 2: Create the template record early so we can navigate to it
      const { data: saved, error: saveErr } = await supabase
        .from('saved_templates')
        .insert({
          name: name.trim(),
          source_project_name: url.trim() || description.trim().slice(0, 50) || 'Custom Design',
          plan_json: { operations: [] },
          extracted_design_json: brandAnalysis,
        })
        .select('id')
        .single();

      if (saveErr) throw saveErr;

      // Step 3: Generate sections one by one
      let allOperations: any[] = [];

      for (let i = 0; i < totalSections; i++) {
        const sectionName = sections[i].name || `Section ${i + 1}`;
        setStatus(`Building: ${sectionName} (${i + 1}/${totalSections})`);
        setProgress(20 + Math.round((i / totalSections) * 70));

        const { data: sectionData, error: sectionErr } = await supabase.functions.invoke('ai-generate', {
          body: {
            sectionDescription: sections[i],
            brandAnalysis,
            sectionIndex: i,
            totalSections,
            existingOperations: allOperations,
            referenceImages: images.length > 0 ? images : null,
          },
        });

        if (sectionErr) {
          console.error(`Section ${i} error:`, sectionErr);
          toast.error(`Failed on "${sectionName}" — skipping`);
          continue;
        }
        if (sectionData?.error) {
          console.error(`Section ${i} AI error:`, sectionData.error);
          toast.error(`Failed on "${sectionName}" — skipping`);
          continue;
        }

        if (sectionData?.operations) {
          allOperations = [...allOperations, ...sectionData.operations];

          // Update the template progressively
          await supabase.from('saved_templates')
            .update({ plan_json: { operations: allOperations } })
            .eq('id', saved.id);
        }
      }

      setStatus('Finalizing…');
      setProgress(95);

      // Final save
      await supabase.from('saved_templates')
        .update({
          plan_json: { operations: allOperations },
          extracted_design_json: brandAnalysis,
        })
        .eq('id', saved.id);

      setProgress(100);
      toast.success(`Created with ${allOperations.length} operations across ${totalSections} sections`);
      onOpenChange(false);
      onCreated(saved.id);

      setName(''); setUrl(''); setDescription(''); setImages([]);
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setCreating(false);
      setStatus('');
      setProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={creating ? undefined : onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>
            Upload a screenshot of a website — the AI will analyze it and build a matching Kajabi template section by section.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label htmlFor="project-name">Project Name</Label>
            <Input id="project-name" placeholder="My Brand Website" value={name} onChange={e => setName(e.target.value)} disabled={creating} />
          </div>

          <div>
            <Label className="flex items-center gap-1.5">
              <ImagePlus className="h-3.5 w-3.5" /> Reference Screenshots
            </Label>
            <p className="text-xs text-muted-foreground mb-1.5">Upload screenshots of the website you want to match</p>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {images.map((img, i) => (
                <div key={i} className="relative group">
                  <img src={img} alt={`ref-${i}`} className="h-16 w-16 object-cover rounded border border-border" />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    disabled={creating}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileRef.current?.click()}
                className="h-16 w-16 rounded border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary/50 transition-colors"
                disabled={creating}
              >
                <ImagePlus className="h-5 w-5 text-muted-foreground" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
            </div>
          </div>

          <div>
            <Label htmlFor="ref-url" className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Reference URL <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input id="ref-url" type="url" placeholder="https://example.com" value={url} onChange={e => setUrl(e.target.value)} disabled={creating} />
          </div>

          <div>
            <Label htmlFor="desc" className="flex items-center gap-1.5">
              <Type className="h-3.5 w-3.5" /> Design Notes <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Textarea
              id="desc"
              placeholder="Any additional notes — style preferences, brand colors, specific sections…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              disabled={creating}
            />
          </div>

          {creating && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">{status}</p>
            </div>
          )}

          <Button className="w-full" size="lg" onClick={handleCreate} disabled={creating}>
            {creating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {status || 'Generating…'}
              </>
            ) : (
              'Create Project'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
