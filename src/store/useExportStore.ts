import { create } from 'zustand';
import type { ExportProject, ExtractedDesign, KajabiThemeData, TransformationPlan, WorkspaceProject } from '@/types';
import { loadKajabiThemeFromZip } from '@/lib/kajabi-theme-loader';
import { extractDesignFromSource, type SourceProjectFiles } from '@/lib/source-extractor';
import { buildTransformationPlan } from '@/lib/transformation-planner';
import { applyPlanAndExport } from '@/lib/kajabi-exporter';

interface ExportStore {
  // State
  currentProject: ExportProject | null;
  workspaceProjects: WorkspaceProject[];
  sourceFiles: SourceProjectFiles | null;
  extractedDesign: ExtractedDesign | null;
  baseTheme: KajabiThemeData | null;
  transformationPlan: TransformationPlan | null;
  isLoading: boolean;
  loadingMessage: string;
  error: string | null;

  // Actions
  setWorkspaceProjects: (projects: WorkspaceProject[]) => void;
  createExportProject: (project: ExportProject) => void;
  setSourceFiles: (files: SourceProjectFiles) => void;
  loadBaseTheme: (zipUrl: string) => Promise<void>;
  extractDesign: () => void;
  buildPlan: () => void;
  exportZip: () => Promise<Blob | null>;
  updateOperation: (index: number, updates: Partial<any>) => void;
  removeOperation: (index: number) => void;
  reset: () => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean, message?: string) => void;
}

export const useExportStore = create<ExportStore>((set, get) => ({
  currentProject: null,
  workspaceProjects: [],
  sourceFiles: null,
  extractedDesign: null,
  baseTheme: null,
  transformationPlan: null,
  isLoading: false,
  loadingMessage: '',
  error: null,

  setWorkspaceProjects: (projects) => set({ workspaceProjects: projects }),

  createExportProject: (project) => set({ currentProject: project, error: null }),

  setSourceFiles: (files) => set({ sourceFiles: files }),

  loadBaseTheme: async (zipUrl: string) => {
    set({ isLoading: true, loadingMessage: 'Loading base Kajabi theme...' });
    try {
      const response = await fetch(zipUrl);
      const data = await response.arrayBuffer();
      const theme = await loadKajabiThemeFromZip(data);
      set({ baseTheme: theme, isLoading: false });
    } catch (e) {
      set({ error: `Failed to load base theme: ${e}`, isLoading: false });
    }
  },

  extractDesign: () => {
    const { sourceFiles } = get();
    if (!sourceFiles) {
      set({ error: 'No source files loaded' });
      return;
    }
    set({ isLoading: true, loadingMessage: 'Extracting design from source project...' });
    try {
      const design = extractDesignFromSource(sourceFiles);
      set({ extractedDesign: design, isLoading: false });
    } catch (e) {
      set({ error: `Failed to extract design: ${e}`, isLoading: false });
    }
  },

  buildPlan: () => {
    const { extractedDesign, baseTheme, currentProject } = get();
    if (!extractedDesign || !baseTheme || !currentProject) {
      set({ error: 'Missing required data to build plan' });
      return;
    }
    set({ isLoading: true, loadingMessage: 'Building transformation plan...' });
    try {
      const plan = buildTransformationPlan(
        extractedDesign,
        baseTheme,
        currentProject.sourceProjectId,
        currentProject.sourceProjectName,
        currentProject.page,
      );
      set({ transformationPlan: plan, isLoading: false });
    } catch (e) {
      set({ error: `Failed to build plan: ${e}`, isLoading: false });
    }
  },

  exportZip: async () => {
    const { transformationPlan, baseTheme } = get();
    if (!transformationPlan || !baseTheme) {
      set({ error: 'Missing plan or theme data' });
      return null;
    }
    set({ isLoading: true, loadingMessage: 'Exporting Kajabi theme zip...' });
    try {
      const blob = await applyPlanAndExport(transformationPlan, baseTheme);
      set({ isLoading: false });
      return blob;
    } catch (e) {
      set({ error: `Failed to export: ${e}`, isLoading: false });
      return null;
    }
  },

  updateOperation: (index, updates) => {
    const { transformationPlan } = get();
    if (!transformationPlan) return;
    const ops = [...transformationPlan.operations];
    ops[index] = { ...ops[index], ...updates };
    set({ transformationPlan: { ...transformationPlan, operations: ops } });
  },

  removeOperation: (index) => {
    const { transformationPlan } = get();
    if (!transformationPlan) return;
    const ops = transformationPlan.operations.filter((_, i) => i !== index);
    set({ transformationPlan: { ...transformationPlan, operations: ops } });
  },

  reset: () => set({
    currentProject: null,
    sourceFiles: null,
    extractedDesign: null,
    baseTheme: null,
    transformationPlan: null,
    isLoading: false,
    error: null,
  }),

  setError: (error) => set({ error }),
  setLoading: (isLoading, loadingMessage = '') => set({ isLoading, loadingMessage }),
}));
