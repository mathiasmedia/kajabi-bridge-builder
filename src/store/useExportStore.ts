import { create } from 'zustand';
import type { ExportProject, ExtractedDesign, KajabiThemeData, TransformationPlan, TransformationOperation, WorkspaceProject } from '@/types';
import { loadKajabiThemeFromZip, getThemeSections, getContentForPage } from '@/lib/kajabi-theme-loader';
import { extractDesignFromSource, type SourceProjectFiles } from '@/lib/source-extractor';
import { buildTransformationPlan } from '@/lib/transformation-planner';
import { applyPlanAndExport } from '@/lib/kajabi-exporter';
import { supabase } from '@/integrations/supabase/client';

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
  buildPlanWithAI: () => Promise<void>;
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

  buildPlanWithAI: async () => {
    const { extractedDesign, baseTheme, currentProject, sourceFiles } = get();
    if (!extractedDesign || !baseTheme || !currentProject || !sourceFiles) {
      set({ error: 'Missing required data to build AI plan' });
      return;
    }

    try {
      // Build compact theme structure
      const sections = getThemeSections(baseTheme);
      const contentForIndex = getContentForPage(baseTheme, 'index');
      const themeStructure: Record<string, any> = {
        content_for_index: contentForIndex,
        sections: {} as Record<string, any>,
      };
      for (const [id, section] of Object.entries(sections)) {
        const s = section as any;
        themeStructure.sections[id] = {
          type: s.type,
          name: s.name,
          settings: s.settings,
          block_order: s.block_order,
          blocks: Object.fromEntries(
            (s.block_order || []).map((bid: string) => [bid, {
              type: s.blocks?.[bid]?.type,
              settings: s.blocks?.[bid]?.settings,
            }])
          ),
        };
      }

      const availableSectionTypes = Object.keys(baseTheme.files)
        .filter(p => p.startsWith('sections/') && p.endsWith('.liquid'))
        .map(p => p.replace('sections/', '').replace('.liquid', ''));

      const sharedBody = {
        sourceFiles: {
          indexCss: sourceFiles.indexCss,
          tailwindConfig: sourceFiles.tailwindConfig,
          components: sourceFiles.components,
          pages: sourceFiles.pages,
        },
        extractedDesign,
        themeStructure,
        availableSectionTypes,
      };

      // ── Step 1: Globals (header, footer, hero, CSS) ──
      const nonHeroSections = extractedDesign.sections.filter(s => s.type !== 'hero');
      const totalSteps = 1 + nonHeroSections.length;

      set({ isLoading: true, loadingMessage: `Step 1/${totalSteps}: Generating global styles, header, footer & hero...` });

      const { data: globalsData, error: globalsError } = await supabase.functions.invoke('ai-transform', {
        body: { ...sharedBody, step: 'globals' },
      });

      if (globalsError) throw new Error(globalsError.message || 'Globals step failed');
      if (globalsData?.error) throw new Error(globalsData.error);

      const operations: TransformationOperation[] = [];

      if (Array.isArray(globalsData.operations)) {
        for (const op of globalsData.operations) {
          operations.push(op as TransformationOperation);
        }
      }

      if (globalsData.cssOverrides && typeof globalsData.cssOverrides === 'string') {
        operations.push({
          type: 'addCssOverride',
          css: globalsData.cssOverrides,
          label: 'AI-generated CSS overrides',
        });
      }

      // ── Step 2+: One call per non-hero section ──
      for (let i = 0; i < nonHeroSections.length; i++) {
        const section = nonHeroSections[i];
        const stepNum = i + 2;
        set({
          loadingMessage: `Step ${stepNum}/${totalSteps}: Generating "${section.heading || section.type}" section...`,
        });

        const { data: sectionData, error: sectionError } = await supabase.functions.invoke('ai-transform', {
          body: {
            ...sharedBody,
            step: 'section',
            sectionToGenerate: section,
          },
        });

        if (sectionError) {
          console.warn(`Section "${section.type}" failed:`, sectionError.message);
          continue; // Skip failed sections, don't abort
        }
        if (sectionData?.error) {
          console.warn(`Section "${section.type}" returned error:`, sectionData.error);
          continue;
        }

        if (Array.isArray(sectionData?.operations)) {
          for (const op of sectionData.operations) {
            operations.push(op as TransformationOperation);
          }
        }
      }

      // ── Hide all original content sections & replace content_for_index ──
      const existingContentIds = getContentForPage(baseTheme, currentProject.page).filter(Boolean);

      // Hide every original content section so the exported theme only shows AI-generated ones
      for (const sectionId of existingContentIds) {
        operations.push({ type: 'hideSection', sectionId });
      }

      const addedSectionIds = operations
        .filter((op): op is Extract<TransformationOperation, { type: 'addSection' }> => op.type === 'addSection')
        .map(op => op.sectionId);

      // Replace (not append) content_for_index with only the new sections
      const contentKey = currentProject.page === 'index' ? 'content_for_index' : `content_for_${currentProject.page}`;
      operations.push({
        type: 'updateGlobalSetting',
        key: contentKey,
        value: addedSectionIds,
        label: 'Replace page content with AI-generated sections',
      });

      if (operations.length === 0) {
        throw new Error('AI returned no valid operations across all steps. Please try again.');
      }

      const plan: TransformationPlan = {
        sourceProjectId: currentProject.sourceProjectId,
        sourceProjectName: currentProject.sourceProjectName,
        sourcePage: currentProject.page,
        baseThemeId: 'streamlined-home',
        extractedDesign,
        operations,
        validationWarnings: [],
      };

      set({ transformationPlan: plan, isLoading: false });
    } catch (e) {
      console.error('AI plan failed:', e);
      set({ error: `AI transform failed: ${e instanceof Error ? e.message : e}`, isLoading: false });
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
