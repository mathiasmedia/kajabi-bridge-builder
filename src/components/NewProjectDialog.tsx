import { useState, useRef } from 'react';
import { Loader2, ImagePlus, X, Globe, Type } from 'lucide-react';
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
    try {
      // Call AI to generate initial plan from references
      const { data, error } = await supabase.functions.invoke('ai-generate', {
        body: {
          name: name.trim(),
          referenceUrl: url.trim() || null,
          referenceImages: images.length > 0 ? images : null,
          description: description.trim() || null,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Save to DB
      const { data: saved, error: saveErr } = await supabase
        .from('saved_templates')
        .insert({
          name: name.trim(),
          source_project_name: url.trim() || description.trim().slice(0, 50) || 'Custom Design',
          plan_json: { operations: data.operations },
          extracted_design_json: data.extractedDesign || null,
        })
        .select('id')
        .single();

      if (saveErr) throw saveErr;

      toast.success('Project created — opening builder');
      onOpenChange(false);
      onCreated(saved.id);

      // Reset
      setName(''); setUrl(''); setDescription(''); setImages([]);
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setCreating(false);
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

          <Button className="w-full" size="lg" onClick={handleCreate} disabled={creating}>
            {creating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating template…
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
