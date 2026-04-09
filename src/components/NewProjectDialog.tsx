import { useState, useRef, useCallback } from 'react';
import { Loader2, ImagePlus, X, Globe, Type, Eye } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
  const [statusMsg, setStatusMsg] = useState('');
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadToStorage = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop() || 'png';
    const path = `ref-images/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('theme-assets').upload(path, file, { contentType: file.type });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('theme-assets').getPublicUrl(path);
    return urlData.publicUrl;
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) { toast.error(`${file.name} exceeds 20MB limit`); continue; }
      try {
        if (file.size > 4 * 1024 * 1024) {
          // Large file — upload to storage, use public URL
          toast.info(`Uploading ${file.name}…`);
          const publicUrl = await uploadToStorage(file);
          setImages(prev => [...prev, publicUrl]);
        } else {
          // Small file — inline as base64
          const reader = new FileReader();
          reader.onload = () => setImages(prev => [...prev, reader.result as string]);
          reader.readAsDataURL(file);
        }
      } catch (err) {
        toast.error(`Upload failed: ${err instanceof Error ? err.message : err}`);
      }
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
    setProgress(10);
    try {
      let visionDesign = null;

      // Step 1: If images provided, extract design via vision first
      if (images.length > 0) {
        setStatusMsg('Analyzing screenshot…');
        setProgress(15);
        const { data: visionData, error: visionErr } = await supabase.functions.invoke('ai-vision-extract', {
          body: {
            imageBase64: images[0],
            referenceUrl: url.trim() || null,
            context: description.trim() || name.trim(),
          },
        });
        if (!visionErr && visionData?.design) {
          visionDesign = visionData.design;
          setProgress(35);
          setStatusMsg('Design extracted — generating template…');
        } else {
          console.warn('Vision extraction failed, proceeding without:', visionErr || visionData?.error);
          setProgress(25);
          setStatusMsg('Generating template…');
        }
      } else {
        setStatusMsg('Generating template…');
        setProgress(20);
      }

      // Step 2: Call AI to generate initial plan, passing vision data if available
      const { data, error } = await supabase.functions.invoke('ai-generate', {
        body: {
          name: name.trim(),
          referenceUrl: url.trim() || null,
          referenceImages: images.length > 0 ? images : null,
          description: description.trim() || null,
          visionDesign,
        },
      });

      setProgress(85);
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Save to DB
      setStatusMsg('Saving project…');
      setProgress(90);
      const { data: saved, error: saveErr } = await supabase
        .from('saved_templates')
        .insert({
          name: name.trim(),
          source_project_name: url.trim() || description.trim().slice(0, 50) || 'Custom Design',
          plan_json: { operations: data.operations },
          extracted_design_json: {
            ...(data.extractedDesign || {}),
            ...(visionDesign ? { visionDesign } : {}),
          },
        })
        .select('id')
        .single();

      if (saveErr) throw saveErr;

      setProgress(100);
      toast.success('Project created — opening builder');
      onOpenChange(false);
      onCreated(saved.id);

      // Reset
      setName(''); setUrl(''); setDescription(''); setImages([]);
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setCreating(false);
      setStatusMsg('');
      setProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>
            Provide a reference design — the AI will generate a matching Kajabi template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label htmlFor="project-name">Project Name</Label>
            <Input id="project-name" placeholder="My Brand Website" value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="ref-url" className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Reference URL
            </Label>
            <Input id="ref-url" type="url" placeholder="https://example.com" value={url} onChange={e => setUrl(e.target.value)} />
          </div>

          <div>
            <Label className="flex items-center gap-1.5">
              <ImagePlus className="h-3.5 w-3.5" /> Reference Images
            </Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {images.map((img, i) => (
                <div key={i} className="relative group">
                  <img src={img} alt={`ref-${i}`} className="h-16 w-16 object-cover rounded border border-border" />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileRef.current?.click()}
                className="h-16 w-16 rounded border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary/50 transition-colors"
              >
                <ImagePlus className="h-5 w-5 text-muted-foreground" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
            </div>
          </div>

          <div>
            <Label htmlFor="desc" className="flex items-center gap-1.5">
              <Type className="h-3.5 w-3.5" /> Design Description
            </Label>
            <Textarea
              id="desc"
              placeholder="Describe the look and feel you want — colors, style, mood..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {creating && statusMsg && (
            <div className="space-y-1.5">
              <Progress value={progress} className="h-1.5" />
              <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
                {progress < 35 && images.length > 0 && <Eye className="h-3 w-3" />}
                {progress >= 35 && <Loader2 className="h-3 w-3 animate-spin" />}
                {statusMsg}
              </p>
            </div>
          )}

          <Button className="w-full" size="lg" onClick={handleCreate} disabled={creating}>
            {creating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {statusMsg || 'Generating…'}
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
