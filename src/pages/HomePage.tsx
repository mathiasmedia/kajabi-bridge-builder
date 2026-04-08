import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, FileArchive, Trash2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import NewProjectDialog from '@/components/NewProjectDialog';

interface SavedProject {
  id: string;
  name: string;
  source_project_name: string | null;
  plan_json: any;
  ai_critique: string | null;
  created_at: string;
}

export default function HomePage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [creatingDefault, setCreatingDefault] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    const { data, error } = await supabase
      .from('saved_templates')
      .select('id, name, source_project_name, plan_json, ai_critique, created_at')
      .order('created_at', { ascending: false });
    if (error) toast.error('Failed to load projects');
    else setProjects(data as SavedProject[]);
    setLoading(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const { error } = await supabase.from('saved_templates').delete().eq('id', id);
    if (error) toast.error('Delete failed');
    else {
      setProjects(prev => prev.filter(p => p.id !== id));
      toast.success('Project deleted');
    }
  };

  const getCritiqueScore = (critique: string | null) => {
    if (!critique) return null;
    try { return JSON.parse(critique).score; } catch { return null; }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal header */}
      <header className="border-b bg-card">
        <div className="container flex items-center h-14 gap-3">
          <FileArchive className="h-5 w-5 text-primary" />
          <span className="font-display font-bold text-lg">Kajabi Builder</span>
        </div>
      </header>

      <main className="container py-12 max-w-4xl animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold">Your Projects</h1>
            <p className="text-muted-foreground mt-1">
              Create Kajabi templates from any reference design
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="lg" onClick={handleStartDefault} disabled={creatingDefault}>
              {creatingDefault ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileArchive className="mr-2 h-5 w-5" />}
              Start with Default
            </Button>
            <Button size="lg" onClick={() => setShowNew(true)}>
              <Plus className="mr-2 h-5 w-5" /> New Project
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <FileArchive className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium mb-1">No projects yet</h3>
              <p className="text-muted-foreground mb-6">
                Create your first Kajabi template from a reference website or image
              </p>
              <Button onClick={() => setShowNew(true)}>
                <Plus className="mr-2 h-4 w-4" /> New Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => {
              const score = getCritiqueScore(p.ai_critique);
              return (
                <Card
                  key={p.id}
                  className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md group"
                  onClick={() => navigate(`/builder/${p.id}`)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{p.name}</p>
                        {p.source_project_name && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {p.source_project_name}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(p.created_at).toLocaleDateString()} · {p.plan_json?.operations?.length || 0} ops
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {score != null && (
                          <Badge variant="outline" className="text-xs">
                            <Star className="h-3 w-3 mr-0.5" />{score}
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => handleDelete(e, p.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <NewProjectDialog open={showNew} onOpenChange={setShowNew} onCreated={(id) => navigate(`/builder/${id}`)} />
    </div>
  );
}
