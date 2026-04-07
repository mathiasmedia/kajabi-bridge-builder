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

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasCompleteAddSection(op: TransformationOperation): boolean {
  if (op.type !== 'addSection') return false;

  return Boolean(
    op.sectionId &&
    isPlainObject(op.section) &&
    typeof op.section.type === 'string' &&
    op.section.type.trim().length > 0 &&
    isPlainObject(op.section.settings) &&
    Array.isArray(op.section.block_order) &&
    isPlainObject(op.section.blocks)
  );
}

function parseContentForValue(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    return value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  }

  if (typeof value !== 'string') return null;

  try {
    const parsed = JSON.parse(value.replace(/'/g, '"'));
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    }
  } catch {
    return null;
  }

  return null;
}

function aiPlanNeedsFallback(
  operations: TransformationOperation[],
  baseTheme: KajabiThemeData,
  page: string,
): boolean {
  const contentKey = page === 'index' ? 'content_for_index' : `content_for_${page}`;
  const existingContentSectionIds = new Set(getContentForPage(baseTheme, page).filter(Boolean));
  const addedSectionIds = new Set<string>();

  let hasInvalidAddSection = false;
  let hiddenExistingContentSections = 0;

  for (const op of operations) {
    if (op.type === 'addSection') {
      if (hasCompleteAddSection(op)) {
        addedSectionIds.add(op.sectionId);
      } else {
        hasInvalidAddSection = true;
      }
    }

    if (op.type === 'hideSection' && existingContentSectionIds.has(op.sectionId)) {
      hiddenExistingContentSections += 1;
    }
  }

  const hasBrokenContentForUpdate = operations.some((op) => {
    if (op.type !== 'updateGlobalSetting' || op.key !== contentKey) return false;

    const ids = parseContentForValue(op.value);
    if (!ids?.length) return true;

    return ids.some((id) => !existingContentSectionIds.has(id) && !addedSectionIds.has(id));
  });

  return hasInvalidAddSection || hasBrokenContentForUpdate || (hiddenExistingContentSections > 0 && addedSectionIds.size === 0);
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
    set({ isLoading: true, loadingMessage: 'AI is analyzing your project and generating transformations...' });
    try {
      // Build a compact theme structure for the AI
      const sections = getThemeSections(baseTheme);
      const contentForIndex = getContentForPage(baseTheme, 'index');
      const themeStructure: Record<string, any> = {
        content_for_index: contentForIndex,
        sections: {} as Record<string, any>,
      };
      // Include header, footer, and content sections
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

      // Extract available section types from theme liquid files
      const availableSectionTypes = Object.keys(baseTheme.files)
        .filter(p => p.startsWith('sections/') && p.endsWith('.liquid'))
        .map(p => p.replace('sections/', '').replace('.liquid', ''));

      const { data, error } = await supabase.functions.invoke('ai-transform', {
        body: {
          sourceFiles: {
            indexCss: sourceFiles.indexCss,
            tailwindConfig: sourceFiles.tailwindConfig,
            components: sourceFiles.components,
            pages: sourceFiles.pages,
          },
          extractedDesign,
          themeStructure,
          availableSectionTypes,
        },
      });

      if (error) throw new Error(error.message || 'AI transform failed');
      if (data?.error) throw new Error(data.error);

      const operations: TransformationOperation[] = [];

      // Add AI-generated operations
      if (Array.isArray(data.operations)) {
        for (const op of data.operations) {
          operations.push(op as TransformationOperation);
        }
      }

      // Add AI-generated CSS as override
      if (data.cssOverrides && typeof data.cssOverrides === 'string') {
        operations.push({
          type: 'addCssOverride',
          css: data.cssOverrides,
          label: 'AI-generated CSS overrides',
        });
      }

      if (aiPlanNeedsFallback(operations, baseTheme, currentProject.page)) {
        console.warn('AI returned incomplete section data, using deterministic fallback plan instead.');
        const fallbackPlan = buildTransformationPlan(
          extractedDesign,
          baseTheme,
          currentProject.sourceProjectId,
          currentProject.sourceProjectName,
          currentProject.page,
        );
        set({ transformationPlan: fallbackPlan, isLoading: false, error: null });
        return;
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
      console.error('AI plan failed, falling back to static:', e);
      set({ loadingMessage: 'AI failed, using static mapping...' });
      // Fallback to static plan
      try {
        const plan = buildTransformationPlan(
          extractedDesign,
          baseTheme,
          currentProject.sourceProjectId,
          currentProject.sourceProjectName,
          currentProject.page,
        );
        set({ transformationPlan: plan, isLoading: false, error: `AI transform failed (${e}), used static fallback` });
      } catch (e2) {
        set({ error: `Failed to build plan: ${e2}`, isLoading: false });
      }
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
