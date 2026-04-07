import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, FolderOpen, Upload, FileArchive, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useExportStore } from '@/store/useExportStore';
import { getProjectBundle, hasProjectBundle } from '@/lib/project-bundles';
import type { ExportProject } from '@/types';

const BASE_THEMES = [
  { id: 'streamlined-home', name: 'Streamlined Home', file: '/base-themes/streamlined-home.zip' },
];

export default function NewExportPage() {
  const navigate = useNavigate();
  const { workspaceProjects, createExportProject, loadBaseTheme, setSourceFiles } = useExportStore();
  
  const [projectName, setProjectName] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedTheme, setSelectedTheme] = useState('streamlined-home');
  const [page, setPage] = useState('index');
  const [notes, setNotes] = useState('');

  const selectedSourceProject = workspaceProjects.find(p => p.id === selectedSource);

  const handleCreate = async () => {
    if (!selectedSource || !selectedTheme) return;
    
    const project: ExportProject = {
      id: crypto.randomUUID(),
      name: projectName || `Export ${selectedSourceProject?.name || 'Project'}`,
      sourceProjectId: selectedSource,
      sourceProjectName: selectedSourceProject?.name || selectedSource,
      baseTheme: selectedTheme,
      page,
      notes,
      createdAt: new Date().toISOString(),
      status: 'new',
    };

    createExportProject(project);
    
    // Load base theme
    const theme = BASE_THEMES.find(t => t.id === selectedTheme);
    if (theme) {
      await loadBaseTheme(theme.file);
    }

    // Load source project files and extract design
    const bundle = getProjectBundle(selectedSource);
    if (bundle) {
      setSourceFiles(bundle.files);
      // Run extraction
      useExportStore.getState().extractDesign();
    }

    navigate('/extract');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container flex items-center h-16 gap-4">
          <FileArchive className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-display font-bold">Export to Kajabi</h1>
        </div>
      </header>

      <main className="container py-12 max-w-2xl animate-fade-in">
        <div className="mb-8">
          <h2 className="text-3xl font-display font-bold tracking-tight">New Export Project</h2>
          <p className="text-muted-foreground mt-2">Select a Lovable project and a Kajabi base theme to begin.</p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FolderOpen className="h-5 w-5 text-primary" />
                Source Project
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="source">Lovable Project</Label>
                <Select value={selectedSource} onValueChange={setSelectedSource}>
                  <SelectTrigger id="source" className="mt-1.5">
                    <SelectValue placeholder="Select a project from your workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaceProjects.length === 0 ? (
                      <SelectItem value="_none" disabled>No projects found — loading...</SelectItem>
                    ) : (
                      workspaceProjects.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="page">Page to export</Label>
                <Select value={page} onValueChange={setPage}>
                  <SelectTrigger id="page" className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="index">Homepage (index)</SelectItem>
                    <SelectItem value="about">About</SelectItem>
                    <SelectItem value="contact">Contact</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Upload className="h-5 w-5 text-primary" />
                Base Kajabi Theme
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedTheme} onValueChange={setSelectedTheme}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BASE_THEMES.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Export Project Name</Label>
                <Input
                  id="name"
                  className="mt-1.5"
                  placeholder={selectedSourceProject ? `Export ${selectedSourceProject.name}` : 'My Kajabi Export'}
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  className="mt-1.5"
                  placeholder="Any special instructions or notes..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Button
            size="lg"
            className="w-full font-display font-semibold"
            onClick={handleCreate}
            disabled={!selectedSource || !selectedTheme}
          >
            Start Export
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </main>
    </div>
  );
}
