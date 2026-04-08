import { describe, it, expect } from 'vitest';
import { validateAndFix, type ValidationResult } from '@/lib/export-validator';
import type { KajabiThemeData } from '@/types';

// Minimal base theme fixture matching streamlined-home structure
function createBaseTheme(): KajabiThemeData {
  return {
    settingsData: { current: {} },
    files: {
      'config/settings_data.json': '{}',
      'sections/section.liquid': '',
      'sections/page_content.liquid': '',
      'sections/header.liquid': '',
      'sections/footer.liquid': '',
      'sections/newsletter_hero.liquid': '',
    },
    assets: {},
    rootPrefix: 'streamlined-home/',
  };
}

describe('Export Validator', () => {
  it('passes clean settings_data', () => {
    const theme = createBaseTheme();
    const settingsData = {
      current: {
        content_for_index: ['1718825317433'],
        sections: {
          '1718825317433': {
            type: 'section',
            name: 'Test',
            settings: { heading: 'Hello' },
            block_order: ['1718825317501'],
            blocks: {
              '1718825317501': { type: 'text', settings: { text: '<p>Content</p>' } },
            },
          },
        },
      },
    };

    const result = validateAndFix(settingsData, theme);
    expect(result.ready).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fixes stringified content_for_index', () => {
    const theme = createBaseTheme();
    const settingsData = {
      current: {
        content_for_index: "['1718825317433']",
        sections: {
          '1718825317433': {
            type: 'section',
            name: 'Test',
            settings: {},
            block_order: [],
            blocks: {},
          },
        },
      },
    };

    const result = validateAndFix(settingsData, theme);
    expect(result.ready).toBe(true);
    expect(settingsData.current.content_for_index).toEqual(['1718825317433']);
    expect(result.autoFixes.some(f => f.includes('stringified'))).toBe(true);
  });

  it('removes empty stub sections', () => {
    const theme = createBaseTheme();
    const settingsData = {
      current: {
        content_for_index: ['stub1', 'good1'],
        sections: {
          stub1: { settings: {}, blocks: {}, block_order: [] }, // no type
          good1: { type: 'section', name: 'Good', settings: {}, block_order: [], blocks: {} },
        },
      },
    };

    const result = validateAndFix(settingsData, theme);
    expect(result.ready).toBe(true);
    expect(settingsData.current.sections.stub1).toBeUndefined();
    expect(settingsData.current.content_for_index).toEqual(['good1']);
    expect(result.autoFixes.some(f => f.includes('no valid type'))).toBe(true);
  });

  it('fixes block_order mismatches', () => {
    const theme = createBaseTheme();
    const settingsData = {
      current: {
        content_for_index: ['s1'],
        sections: {
          s1: {
            type: 'section',
            name: 'Test',
            settings: {},
            block_order: ['missing_block', 'b1'],
            blocks: {
              b1: { type: 'text', settings: { heading: 'Hello' } },
              b2: { type: 'text', settings: { heading: 'World' } },
            },
          },
        },
      },
    };

    const result = validateAndFix(settingsData, theme);
    expect(result.ready).toBe(true);
    const s1 = settingsData.current.sections.s1;
    expect(s1.block_order).not.toContain('missing_block');
    expect(s1.block_order).toContain('b1');
    expect(s1.block_order).toContain('b2');
  });

  it('fixes stringified JSON in settings', () => {
    const theme = createBaseTheme();
    const settingsData = {
      current: {
        content_for_index: ['s1'],
        sections: {
          s1: {
            type: 'section',
            name: 'Test',
            settings: {
              padding_desktop: '{"top":"80","bottom":"80"}',
            },
            block_order: [],
            blocks: {},
          },
        },
      },
    };

    const result = validateAndFix(settingsData, theme);
    expect(result.ready).toBe(true);
    expect(settingsData.current.sections.s1.settings.padding_desktop).toEqual({ top: '80', bottom: '80' });
  });

  it('renames wrong field names to Kajabi conventions', () => {
    const theme = createBaseTheme();
    const settingsData = {
      current: {
        content_for_index: ['s1'],
        sections: {
          s1: {
            type: 'section',
            name: 'CTA',
            settings: { btn_url: '/signup', image_link: '/hero.jpg' },
            block_order: [],
            blocks: {},
          },
        },
      },
    };

    const result = validateAndFix(settingsData, theme);
    expect(result.ready).toBe(true);
    const s = settingsData.current.sections.s1.settings as Record<string, any>;
    expect(s.btn_action).toBe('/signup');
    expect(s.btn_url).toBeUndefined();
    expect(s.img_action).toBe('/hero.jpg');
  });

  it('removes header/footer from content_for_index', () => {
    const theme = createBaseTheme();
    const settingsData = {
      current: {
        content_for_index: ['h1', 's1', 'f1'],
        sections: {
          h1: { type: 'header', name: 'Header', settings: {}, block_order: [], blocks: {} },
          s1: { type: 'section', name: 'Body', settings: {}, block_order: [], blocks: {} },
          f1: { type: 'footer', name: 'Footer', settings: {}, block_order: [], blocks: {} },
        },
      },
    };

    const result = validateAndFix(settingsData, theme);
    expect(result.ready).toBe(true);
    expect(settingsData.current.content_for_index).toEqual(['s1']);
  });

  it('removes duplicate section IDs from content_for_index', () => {
    const theme = createBaseTheme();
    const settingsData = {
      current: {
        content_for_index: ['s1', 's1', 's2'],
        sections: {
          s1: { type: 'section', name: 'A', settings: {}, block_order: [], blocks: {} },
          s2: { type: 'section', name: 'B', settings: {}, block_order: [], blocks: {} },
        },
      },
    };

    const result = validateAndFix(settingsData, theme);
    expect(result.ready).toBe(true);
    expect(settingsData.current.content_for_index).toEqual(['s1', 's2']);
  });

  it('preserves valid link_lists and fixes stringified ones', () => {
    const theme = createBaseTheme();
    const settingsData = {
      current: {
        content_for_index: [],
        sections: {},
        link_lists: { main: { links: [] }, broken: 'not an object' },
      },
    };

    const result = validateAndFix(settingsData, theme);
    expect(result.ready).toBe(true);
    expect(settingsData.current.link_lists.main).toEqual({ links: [] });
    expect(settingsData.current.link_lists.broken).toBeUndefined();
  });

  it('converts block arrays to objects', () => {
    const theme = createBaseTheme();
    const settingsData = {
      current: {
        content_for_index: ['s1'],
        sections: {
          s1: {
            type: 'section',
            name: 'Test',
            settings: {},
            block_order: [],
            blocks: [
              { type: 'text', settings: { heading: 'A' } },
              { type: 'text', settings: { heading: 'B' } },
            ],
          },
        },
      },
    };

    const result = validateAndFix(settingsData, theme);
    expect(result.ready).toBe(true);
    const blocks = settingsData.current.sections.s1.blocks;
    expect(Array.isArray(blocks)).toBe(false);
    expect(Object.keys(blocks).length).toBe(2);
  });

  it('errors on missing settings_data.current', () => {
    const theme = createBaseTheme();
    const settingsData = { current: null as any };

    const result = validateAndFix(settingsData, theme);
    expect(result.ready).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('warns on unknown section types', () => {
    const theme = createBaseTheme();
    const settingsData = {
      current: {
        content_for_index: ['s1'],
        sections: {
          s1: {
            type: 'text-columns',
            name: 'Stats',
            settings: {},
            block_order: [],
            blocks: {},
          },
        },
      },
    };

    const result = validateAndFix(settingsData, theme);
    expect(result.ready).toBe(true); // warning, not error
    expect(result.warnings.some(w => w.includes('text-columns'))).toBe(true);
  });

  it('prunes references to non-existent sections', () => {
    const theme = createBaseTheme();
    const settingsData = {
      current: {
        content_for_index: ['exists', 'ghost'],
        sections: {
          exists: { type: 'section', name: 'A', settings: {}, block_order: [], blocks: {} },
        },
      },
    };

    const result = validateAndFix(settingsData, theme);
    expect(result.ready).toBe(true);
    expect(settingsData.current.content_for_index).toEqual(['exists']);
  });
});