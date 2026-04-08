import { create } from 'zustand';
import type { ExportProject, ExtractedDesign, KajabiThemeData, TransformationPlan, TransformationOperation, WorkspaceProject } from '@/types';
import { loadKajabiThemeFromZip, getThemeSections, getContentForPage } from '@/lib/kajabi-theme-loader';
import { extractDesignFromSource, type SourceProjectFiles } from '@/lib/source-extractor';
import { buildTransformationPlan } from '@/lib/transformation-planner';
import { applyPlanAndExport } from '@/lib/kajabi-exporter';
import { preValidateExport, type ValidationResult } from '@/lib/kajabi-exporter';
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
  exportValidation: ValidationResult | null;

  // Actions
  setWorkspaceProjects: (projects: WorkspaceProject[]) => void;
  createExportProject: (project: ExportProject) => void;
  setSourceFiles: (files: SourceProjectFiles) => void;
  loadBaseTheme: (zipUrl: string) => Promise<void>;
  extractDesign: () => void;
  buildPlan: () => void;
  buildPlanWithAI: () => Promise<void>;
  refinePlanWithAI: () => Promise<void>;
  exportZip: () => Promise<Blob | null>;
  runExportValidation: () => ValidationResult | null;
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
  exportValidation: null,

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

      // Build hero block map with actual block IDs so the AI uses them directly
      const contentForPage = getContentForPage(baseTheme, currentProject.page).filter(Boolean);
      const heroSectionId = contentForPage[0]; // First content section is the hero
      let heroBlockMap: Record<string, any> | undefined;
      if (heroSectionId && sections[heroSectionId]) {
        const heroSec = sections[heroSectionId] as any;
        const blockOrder = heroSec.block_order || Object.keys(heroSec.blocks || {});
        heroBlockMap = {};
        for (const bid of blockOrder) {
          const block = heroSec.blocks?.[bid];
          if (block) {
            heroBlockMap[bid] = { type: block.type, settings: block.settings };
          }
        }
      }

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
        heroSectionId,
        heroBlockMap,
      };

      // ── Step 1: Globals (header, footer, hero, navigation, CSS) ──
      const nonHeroSections = extractedDesign.sections.filter(s => {
        if (s.type === 'hero') return false;
        const heading = (s.heading || '').toLowerCase();
        const type = (s.type || '').toLowerCase();
        if (type === 'content' && (heading.includes('footer') || heading === 'footer')) return false;
        return true;
      });
      const totalSteps = 1 + nonHeroSections.length;

      set({ isLoading: true, loadingMessage: `Step 1/${totalSteps}: Generating global styles, header, footer, hero & navigation...` });

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
      // Track existing headings for deduplication
      const existingSectionHeadings: string[] = [];
      
      // Collect headings from globals (hero heading)
      if (extractedDesign.hero?.heading) {
        existingSectionHeadings.push(extractedDesign.hero.heading);
      }

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
            existingSectionHeadings,
          },
        });

        if (sectionError) {
          console.warn(`Section "${section.type}" failed:`, sectionError.message);
          continue;
        }
        if (sectionData?.error) {
          console.warn(`Section "${section.type}" returned error:`, sectionData.error);
          continue;
        }

        if (Array.isArray(sectionData?.operations)) {
          for (const op of sectionData.operations) {
            operations.push(op as TransformationOperation);
            // Track heading for dedup
            if (op.type === 'addSection' && op.section?.settings?.heading) {
              existingSectionHeadings.push(op.section.settings.heading);
            }
          }
        }
      }

      // ── Post-processing: Deduplication ──
      const deduplicatedOps = deduplicateOperations(operations);

      // ── Build content_for_index: keep modified existing sections + add new ones ──
      const existingContentIds = getContentForPage(baseTheme, currentProject.page).filter(Boolean);

      // Find existing sections that were modified by globals (replaceText, updateSectionSetting, updateBlockSetting)
      const modifiedExistingSections = new Set<string>();
      for (const op of deduplicatedOps) {
        const opAny = op as any;
        if (
          (op.type === 'updateSectionSetting' || op.type === 'updateBlockSetting' || op.type === 'replaceText') &&
          opAny.sectionId &&
          existingContentIds.includes(opAny.sectionId)
        ) {
          modifiedExistingSections.add(opAny.sectionId);
        }
      }

      // Hide unmodified existing content sections
      for (const sectionId of existingContentIds) {
        if (!modifiedExistingSections.has(sectionId)) {
          deduplicatedOps.push({ type: 'hideSection', sectionId });
        }
      }

      const addedSectionIds = deduplicatedOps
        .filter((op): op is Extract<TransformationOperation, { type: 'addSection' }> => op.type === 'addSection')
        .map(op => op.sectionId);

      // Build page content: modified existing sections first (preserving order), then new sections
      const keptExistingIds = existingContentIds.filter(id => modifiedExistingSections.has(id));
      const finalContentIds = [...keptExistingIds, ...addedSectionIds];

      const contentKey = currentProject.page === 'index' ? 'content_for_index' : `content_for_${currentProject.page}`;
      deduplicatedOps.push({
        type: 'updateGlobalSetting',
        key: contentKey,
        value: finalContentIds,
        label: 'Replace page content with modified + AI-generated sections',
      });

      // ── Ensure link_lists from nav items if no updateNavigation ops exist ──
      const hasNavOps = deduplicatedOps.some(op => op.type === 'updateNavigation');
      if (!hasNavOps && extractedDesign.header?.navItems?.length > 0) {
        deduplicatedOps.push({
          type: 'updateNavigation',
          menuId: 'main-menu',
          links: extractedDesign.header.navItems,
        } as TransformationOperation);
      }

      if (deduplicatedOps.length === 0) {
        throw new Error('AI returned no valid operations across all steps. Please try again.');
      }

      const plan: TransformationPlan = {
        sourceProjectId: currentProject.sourceProjectId,
        sourceProjectName: currentProject.sourceProjectName,
        sourcePage: currentProject.page,
        baseThemeId: 'streamlined-home',
        extractedDesign,
        operations: deduplicatedOps,
        validationWarnings: [],
      };

      set({ transformationPlan: plan, isLoading: false });
    } catch (e) {
      console.error('AI plan failed:', e);
      set({ error: `AI transform failed: ${e instanceof Error ? e.message : e}`, isLoading: false });
    }
  },

  refinePlanWithAI: async () => {
    const { transformationPlan, extractedDesign, sourceFiles } = get();
    if (!transformationPlan || !extractedDesign) {
      set({ error: 'No plan to refine' });
      return;
    }
    set({ isLoading: true, loadingMessage: 'AI is reviewing and improving the plan...' });
    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-transform', {
        body: {
          step: 'refine',
          extractedDesign,
          currentPlan: transformationPlan,
          sourceFiles: sourceFiles ? {
            indexCss: sourceFiles.indexCss,
            tailwindConfig: sourceFiles.tailwindConfig,
            components: sourceFiles.components,
            pages: sourceFiles.pages,
          } : undefined,
        },
      });
      if (fnError) throw new Error(fnError.message || 'Refine failed');
      if (data?.error) throw new Error(data.error);

      const operations: TransformationOperation[] = data.operations || [];
      
      // Add CSS overrides if returned
      if (data.cssOverrides && typeof data.cssOverrides === 'string') {
        // Replace existing CSS override ops
        const nonCssOps = operations.filter(op => op.type !== 'addCssOverride');
        nonCssOps.push({
          type: 'addCssOverride',
          css: data.cssOverrides,
          label: 'AI-refined CSS overrides',
        });
        operations.length = 0;
        operations.push(...nonCssOps);
      }

      const improvements: string[] = data.improvements || [];
      if (improvements.length > 0) {
        console.log('AI improvements:', improvements);
      }

      set({
        transformationPlan: { ...transformationPlan, operations },
        isLoading: false,
      });
    } catch (e) {
      console.error('AI refine failed:', e);
      set({ error: `Refine failed: ${e instanceof Error ? e.message : e}`, isLoading: false });
    }
  },

  runExportValidation: () => {
    const { transformationPlan, baseTheme } = get();
    if (!transformationPlan || !baseTheme) return null;
    const result = preValidateExport(transformationPlan, baseTheme);
    set({ exportValidation: result });
    return result;
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

// ── Deduplication pass ────────────────────────────────────────────────

function deduplicateOperations(operations: TransformationOperation[]): TransformationOperation[] {
  const result: TransformationOperation[] = [];
  const seenHeadings = new Set<string>();
  const seenSectionIds = new Set<string>();

  for (const op of operations) {
    if (op.type === 'addSection') {
      // Skip duplicate section IDs
      if (seenSectionIds.has(op.sectionId)) {
        console.warn(`Dedup: skipping duplicate section ID "${op.sectionId}"`);
        continue;
      }

      // Skip sections with duplicate headings
      const heading = op.section?.settings?.heading;
      if (heading && typeof heading === 'string') {
        const normalizedHeading = heading.trim().toLowerCase();
        if (seenHeadings.has(normalizedHeading)) {
          console.warn(`Dedup: skipping section with duplicate heading "${heading}"`);
          continue;
        }
        seenHeadings.add(normalizedHeading);
      }

      // Skip footer-like sections in content arrays
      const sectionName = (op.section?.name || '').toLowerCase();
      const sectionType = (op.section?.type || '').toLowerCase();
      if (sectionName.includes('footer') || sectionType === 'footer') {
        console.warn(`Dedup: skipping footer-like section "${op.label}"`);
        continue;
      }

      // Skip heading-only sections when the section should be richer
      const blocks = op.section?.blocks || {};
      const blockValues = Object.values(blocks);
      const hasSubstantiveBlocks = blockValues.some((b: any) => {
        const s = b?.settings || {};
        return (s.text && s.text.length > 20) || s.btn_text || s.btn_action || s.button_label;
      });
      if (blockValues.length <= 1 && !hasSubstantiveBlocks && heading) {
        // Check if it's truly just a heading with no body — only skip if section label suggests richer content
        const label = (op.label || '').toLowerCase();
        const isExpectedRich = ['stat', 'feature', 'program', 'testimonial', 'course', 'service'].some(k => label.includes(k));
        if (isExpectedRich) {
          console.warn(`Dedup: skipping thin section "${op.label}" (expected richer content)`);
          continue;
        }
      }

      seenSectionIds.add(op.sectionId);
    }

    result.push(op);
  }

  return result;
}
