/**
 * Browser-side Kajabi Encore Theme Renderer
 * 
 * Processes a theme zip in the browser using JSZip + LiquidJS.
 * Mirrors the Node.js buildTheme.ts logic but runs entirely client-side.
 */

import JSZip from 'jszip';
import { Liquid } from 'liquidjs';

// ── TYPES ──────────────────────────────────────────────────────────────────
interface ThemeFiles {
  layouts: Record<string, string>;
  templates: Record<string, string>;
  sections: Record<string, string>;
  snippets: Record<string, string>;
  assets: Record<string, string>; // text assets
  assetBlobs: Record<string, Blob>; // binary assets (images etc.)
  config: {
    settings_data: any;
    settings_schema: any;
  };
}

interface SettingsModel {
  globalSettings: Record<string, any>;
  contentFor: Record<string, string[]>;
  sections: Record<string, any>;
  linkLists: Record<string, any>;
}

interface RenderResult {
  pages: Record<string, string>;
  styles: string;
  coreCss: string;
  manifest: { pages: string[]; generatedAt: string };
  assetUrls: Record<string, string>;
  assetBlobs: Record<string, Blob>;
  themeData: {
    settings_data: any;
    settings_schema: any;
    layouts: Record<string, string>;
    templates: Record<string, string>;
    sections: Record<string, string>;
    snippets: Record<string, string>;
    assets_text: Record<string, string>;
  };
}

type ProgressCallback = (message: string) => void;

// ── SETTINGS COERCION ──────────────────────────────────────────────────────
// Keys whose string values should NOT be coerced to boolean
// because they are used in CSS class names or other string contexts.
const STRING_ONLY_KEYS = new Set(['vertical', 'horizontal', 'alignment', 'layout', 'style', 'logo_type', 'logo_text']);

function coerceSettings(obj: any, key?: string): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // Don't coerce keys that are used as CSS class fragments
    if (key && STRING_ONLY_KEYS.has(key)) return obj;
    if (obj === 'true') return true;
    if (obj === 'false') return false;
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(v => coerceSettings(v));
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = coerceSettings(v, k);
    }
    return result;
  }
  return obj;
}

// ── COLOR SCHEME CLASS ─────────────────────────────────────────────────────
function colorSchemeClass(color: string): string {
  if (!color || color === '') return 'light';
  const c = color.toLowerCase().replace(/\s/g, '');
  if (c.startsWith('rgba(') || c.startsWith('rgb(')) {
    const nums = c.match(/[\d.]+/g)?.map(Number) || [255, 255, 255];
    const lum = (nums[0] * 299 + nums[1] * 587 + nums[2] * 114) / 1000;
    if (nums.length >= 4 && nums[3] < 0.5) return 'light';
    return lum < 128 ? 'dark' : 'light';
  }
  if (c.startsWith('#')) {
    let hex = c.slice(1);
    // Expand 3-char hex (#fff -> ffffff)
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    const lum = (r * 299 + g * 587 + b * 114) / 1000;
    return lum < 128 ? 'dark' : 'light';
  }
  return 'light';
}

// ── ZIP EXTRACTION ─────────────────────────────────────────────────────────
async function extractThemeFromZip(file: File, onProgress: ProgressCallback): Promise<ThemeFiles> {
  onProgress('Reading zip file…');
  const zip = await JSZip.loadAsync(file);

  // Find the root folder (zips often have a top-level directory)
  let prefix = '';
  const entries = Object.keys(zip.files);
  
  // Detect if there's a common root folder
  const firstEntry = entries.find(e => !zip.files[e].dir);
  if (firstEntry) {
    const parts = firstEntry.split('/');
    if (parts.length > 1) {
      // Check if all entries share the same first folder
      const candidate = parts[0] + '/';
      const allSharePrefix = entries.every(e => e.startsWith(candidate) || e === candidate.slice(0, -1));
      if (allSharePrefix) prefix = candidate;
    }
  }

  const readDir = async (dirName: string): Promise<Record<string, string>> => {
    const files: Record<string, string> = {};
    const dirPath = prefix + dirName + '/';
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      if (path.startsWith(dirPath)) {
        const name = path.slice(dirPath.length);
        if (!name.includes('/')) { // only direct children
          files[name] = await entry.async('text');
        }
      }
    }
    return files;
  };

  const readBinaryDir = async (dirName: string): Promise<Record<string, Blob>> => {
    const files: Record<string, Blob> = {};
    const dirPath = prefix + dirName + '/';
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      if (path.startsWith(dirPath)) {
        const name = path.slice(dirPath.length);
        if (!name.includes('/')) {
          files[name] = await entry.async('blob');
        }
      }
    }
    return files;
  };

  onProgress('Extracting layouts…');
  const layouts = await readDir('layouts');
  
  onProgress('Extracting templates…');
  const templates = await readDir('templates');
  
  onProgress('Extracting sections…');
  const sections = await readDir('sections');
  
  onProgress('Extracting snippets…');
  const snippets = await readDir('snippets');

  onProgress('Extracting assets…');
  const assetTexts: Record<string, string> = {};
  const assetBlobs: Record<string, Blob> = {};
  const assetDir = prefix + 'assets/';
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !path.startsWith(assetDir)) continue;
    const name = path.slice(assetDir.length);
    if (name.includes('/')) continue;
    // Text assets
    if (/\.(liquid|css|scss|js|json|svg|html)$/i.test(name)) {
      assetTexts[name] = await entry.async('text');
    }
    // All assets as blobs (for images etc.)
    assetBlobs[name] = await entry.async('blob');
  }

  onProgress('Parsing config…');
  let settingsData: any = {};
  let settingsSchema: any = [];
  
  const sdPath = prefix + 'config/settings_data.json';
  const ssPath = prefix + 'config/settings_schema.json';
  
  if (zip.files[sdPath]) {
    settingsData = JSON.parse(await zip.files[sdPath].async('text'));
  }
  if (zip.files[ssPath]) {
    settingsSchema = JSON.parse(await zip.files[ssPath].async('text'));
  }

  return {
    layouts, templates, sections, snippets,
    assets: assetTexts,
    assetBlobs,
    config: { settings_data: settingsData, settings_schema: settingsSchema },
  };
}

// ── SETTINGS MODEL ─────────────────────────────────────────────────────────
function buildSettingsModel(config: any): SettingsModel {
  const current = config.settings_data.current;
  const sections = current.sections || {};

  const globalSettings: Record<string, any> = {};
  for (const [k, v] of Object.entries(current)) {
    if (k !== 'sections' && !k.startsWith('content_for')) {
      globalSettings[k] = coerceSettings(v);
    }
  }

  if (!globalSettings.brand) {
    globalSettings.brand = {
      logo: '', favicon: '', accent_color: '#E8552D', primary_color: '#E8552D',
      font_family_body: 'Open Sans', font_family_heading: 'Open Sans', social: {},
    };
  }

  const contentFor: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(current)) {
    if (k.startsWith('content_for_')) {
      contentFor[k] = (v as string[]).filter(id => id && id.trim() !== '');
    }
  }

  const resolvedSections: Record<string, any> = {};
  for (const [id, sec] of Object.entries(sections) as [string, any][]) {
    const blocks: any[] = [];
    const blockOrder = sec.block_order || [];
    for (const bid of blockOrder) {
      if (!bid || !sec.blocks?.[bid]) continue;
      const blk = sec.blocks[bid];
      blocks.push({
        id: bid, type: blk.type,
        settings: coerceSettings(blk.settings || {}),
        hidden: blk.hidden === true || blk.hidden === 'true',
        name: blk.name || '',
      });
    }
    resolvedSections[id] = {
      id, type: sec.type, name: sec.name || '',
      settings: coerceSettings(sec.settings || {}),
      blocks,
      hidden: sec.hidden === true || sec.hidden === 'true',
    };
  }

  // Build link_lists: use stored link_lists from settings_data, or fall back to defaults
  const defaultLinks = [
    { name: 'About', url: '/about' },
    { name: 'Courses', url: '/store' },
    { name: 'Sales Page', url: '/sales' },
    { name: 'Newsletter', url: '/newsletter' },
    { name: 'Blog', url: '/blog' },
    { name: 'Contact', url: '/contact' },
  ];
  const storedLinkLists = config.settings_data?.current?.link_lists || {};
  const linkLists: Record<string, any> = { 'main-menu': { links: defaultLinks }, ...storedLinkLists };
  // Ensure any menu referenced by blocks exists
  for (const sec of Object.values(resolvedSections) as any[]) {
    for (const block of (sec.blocks || [])) {
      if (block.type === 'menu' || block.type === 'link_list') {
        const menuId = block.settings?.menu || block.settings?.link_list;
        if (menuId && !linkLists[menuId]) {
          linkLists[menuId] = { links: defaultLinks };
        }
      }
    }
  }

  return { globalSettings, contentFor, sections: resolvedSections, linkLists };
}

// ── LIQUID ENGINE SETUP ────────────────────────────────────────────────────
const KAJABI_CDN_BASE = 'https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/';

function createEngine(theme: ThemeFiles, model: SettingsModel, assetUrlMap: Record<string, string>) {

  // Custom file system for browser (reads from in-memory theme files)
  const fileSystem = {
    resolve: (root: string, file: string, ext: string) => {
      const name = file.endsWith(ext) ? file : file + ext;
      return name;
    },
    readFile: async (file: string) => {
      const name = typeof file === 'string' ? file : String(file);
      const cleanName = name.endsWith('.liquid') ? name : name + '.liquid';
      // Search snippets first, then sections, then layouts
      if (theme.snippets[cleanName]) return theme.snippets[cleanName];
      if (theme.sections[cleanName]) return theme.sections[cleanName];
      if (theme.layouts[cleanName]) return theme.layouts[cleanName];
      console.warn(`[LiquidFS] File not found: ${cleanName}`);
      return '';
    },
    readFileSync: (file: string) => {
      const name = typeof file === 'string' ? file : String(file);
      const cleanName = name.endsWith('.liquid') ? name : name + '.liquid';
      if (theme.snippets[cleanName]) return theme.snippets[cleanName];
      if (theme.sections[cleanName]) return theme.sections[cleanName];
      if (theme.layouts[cleanName]) return theme.layouts[cleanName];
      return '';
    },
    existsSync: () => true, // Always return true; readFile returns '' for missing files
    exists: async () => true,
    contains: async () => true,
  };

  const engine = new Liquid({
    fs: fileSystem as any,
    root: ['.'],
    extname: '.liquid',
    strictFilters: false,
    strictVariables: false,
    jsTruthy: true,
    globals: {
      settings: model.globalSettings,
      current_site: {
        locale: 'en', title: 'Kajabi Site',
        url: '',
        find_event: {}, find_video: {}, find_form: {},
        link_lists: model.linkLists,
        brand: model.globalSettings.brand || {},
        'display_powered_by_link?': false,
        blog: {
          posts_published: [
            { title: 'Hiring Top Talent for Agencies', url: '/blog/post-1', image_url: KAJABI_CDN_BASE + 'file-uploads/blogs/default/images/placeholder.png', image_alt_text: '', content: '<p>Lorem ipsum dolor sit amet.</p>', created_at: '2024-02-20T00:00:00Z', tags: [], id: '1' },
            { title: '10 Tips for Scaling Your Agency', url: '/blog/post-2', image_url: KAJABI_CDN_BASE + 'file-uploads/blogs/default/images/placeholder.png', image_alt_text: '', content: '<p>Lorem ipsum dolor sit amet.</p>', created_at: '2024-02-20T00:00:00Z', tags: [], id: '2' },
            { title: '15 Top Industry Secrets for 2024', url: '/blog/post-3', image_url: KAJABI_CDN_BASE + 'file-uploads/blogs/default/images/placeholder.png', image_alt_text: '', content: '<p>Lorem ipsum dolor sit amet.</p>', created_at: '2024-02-20T00:00:00Z', tags: [], id: '3' },
          ],
        },
      },
      current_site_user: null,
      editor: false,
      page_title: '', page_description: '', canonical_url: '/',
      page_image_url: '', alert_messages: {}, powered_by_link: '',
      page: { title: 'Page Title', content: '<p>Page content goes here.</p>' },
      sales_page: { title: 'Sales Page', body: '', video: null, thumbnail_url: '' },
      products: [], blog_post: null, newsletter: null, newsletter_post: null,
      search: { results: [], query: '' },
      announcements: [], members: [],
    },
  });

  // ── FILTERS ──────────────────────────────────────────────────────────
  engine.registerFilter('color_scheme_class', (color: any) => colorSchemeClass(String(color || '')));
  engine.registerFilter('settings_id', (...args: any[]) => `settings-${args[0] || 'unknown'}`);

  engine.registerFilter('image_picker_url', (value: any, fallback: string) => {
    const v = String(value || '').trim();
    if (v) {
      // If it's a file-uploads path, resolve to CDN URL
      if (v.startsWith('file-uploads/')) return KAJABI_CDN_BASE + v;
      // If it's already a full URL, return as-is
      if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('//')) return v;
      // Could be a local asset name
      if (assetUrlMap[v]) return assetUrlMap[v];
      // Try treating as a Kajabi CDN path
      if (v.includes('/')) return KAJABI_CDN_BASE + v;
      return v;
    }
    const fb = fallback || 'placeholder.png';
    return assetUrlMap[fb] || `/theme-assets/${fb}`;
  });

  engine.registerFilter('image_tag', function(url: any, ...args: any[]) {
    const hash: Record<string, string> = {};
    for (const arg of args) {
      if (Array.isArray(arg) && arg.length === 2) hash[arg[0]] = arg[1];
    }
    const cls = hash.class || '';
    const alt = hash.alt || '';
    const kjbId = hash.kjb_settings_id || '';
    const kjbAttr = kjbId ? ` kjb-settings-id="${kjbId}"` : '';
    // Only resolve through asset map if URL is a simple local filename (no slashes, no protocol)
    let resolvedUrl = url;
    if (typeof url === 'string' && !url.includes('/') && !url.startsWith('http')) {
      if (assetUrlMap[url]) resolvedUrl = assetUrlMap[url];
    }
    return `<img src="${resolvedUrl}" class="${cls}" alt="${alt}" loading="lazy"${kjbAttr} />`;
  });

  engine.registerFilter('stylesheet_tag', (url: any) => `<link rel="stylesheet" href="${url}" />`);
  engine.registerFilter('script_tag', (url: any) => `<script src="${url}"><\/script>`);
  engine.registerFilter('async_style_link', (url: any) => {
    if (!url) return '';
    return `<link rel="stylesheet" href="${url}" media="print" onload="this.media='all'" /><noscript><link rel="stylesheet" href="${url}" /></noscript>`;
  });

  engine.registerFilter('asset_url', (filename: any) => {
    const name = String(filename || '');
    if (name === 'styles.css') return ''; // injected via <style> tag
    return assetUrlMap[name] || `/theme-assets/${name}`;
  });

  engine.registerFilter('kajabi_asset_url', (filename: any) => {
    const name = String(filename || '');
    if (name === 'core.css') return 'https://kajabi-app-assets.kajabi-cdn.com/assets/core-3e99bed14a4d3d654c459fe8ee5f12e4191e09d069df9a953619d17b0bfec996.css';
    if (name === 'encore_core.js') return 'https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js';
    return assetUrlMap[name] || `/theme-assets/${name}`;
  });

  engine.registerFilter('google_fonts_url', (fonts: any) => {
    if (!fonts || (Array.isArray(fonts) && fonts.length === 0)) return '';
    const fontList = Array.isArray(fonts) ? fonts : [fonts];
    const validFonts = fontList.filter((f: string) => f && f.trim() !== '');
    if (validFonts.length === 0) return 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&display=swap';
    const families = validFonts.map((f: string) => `family=${f.trim().replace(/ /g, '+')}:wght@400;700`).join('&');
    return `https://fonts.googleapis.com/css2?${families}&display=swap`;
  });

  engine.registerFilter('to_array', (val: any) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') return val.split(',').map((s: string) => s.trim()).filter(Boolean);
    return [val];
  });

  engine.registerFilter('member_login_link', (text: any) => `<a href="/login">${text}</a>`);
  engine.registerFilter('member_logout_link', (text: any) => `<a href="/logout">${text}</a>`);
  engine.registerFilter('member_settings_link', (text: any) => `<a href="/settings">${text}</a>`);
  engine.registerFilter('avatar_url', () => assetUrlMap['placeholder.png'] || '/theme-assets/placeholder.png');
  engine.registerFilter('display_price', (price: any) => `$${price || '0.00'}`);
  engine.registerFilter('wistia_video', () => '<div class="wistia-placeholder">Video Player</div>');
  engine.registerFilter('wistia_audio', () => '<div class="wistia-placeholder">Audio Player</div>');
  engine.registerFilter('external_widget', () => '<div class="widget-placeholder">Widget</div>');
  engine.registerFilter('coaching_scheduling_widget', () => '<div class="widget-placeholder">Scheduling Widget</div>');
  engine.registerFilter('embedded_checkout', () => '<div class="checkout-placeholder">Checkout</div>');
  engine.registerFilter('embedded_checkout_column_min_width', () => '');
  engine.registerFilter('newsletter_post_comments_section', () => '');
  engine.registerFilter('cart', () => '<button class="cart-button"><i class="fas fa-shopping-cart"></i></button>');
  engine.registerFilter('form_input', () => '<div class="form-group"><input class="form-control" type="text" placeholder="Field" /></div>');
  engine.registerFilter('pluralize', (count: any, singular: string, plural: string) => Number(count) === 1 ? singular : plural);
  engine.registerFilter('t', (key: any) => String(key));
  engine.registerFilter('truncate_html', (html: any, len: number) => {
    const text = String(html || '').replace(/<[^>]+>/g, '');
    if (text.length <= len) return html;
    return text.slice(0, len) + '…';
  });
  engine.registerFilter('url_encode', (val: any) => encodeURIComponent(String(val || '')));
  engine.registerFilter('sort', (arr: any, key?: string) => {
    if (!Array.isArray(arr)) return arr;
    const sorted = [...arr];
    if (key) sorted.sort((a, b) => String(a?.[key] || '').localeCompare(String(b?.[key] || '')));
    else sorted.sort();
    return sorted;
  });
  engine.registerFilter('at_least', (val: any, min: any) => Math.max(Number(val) || 0, Number(min) || 0));
  engine.registerFilter('at_most', (val: any, max: any) => Math.min(Number(val) || 0, Number(max) || 0));

  // ── TAGS ──────────────────────────────────────────────────────────────

  // Schema tag - parse but don't output
  engine.registerTag('schema', {
    parse(tagToken: any, remainTokens: any[]) {
      this.content = '';
      let depth = 1;
      const stream = this.liquid.parser.parseStream(remainTokens);
      stream.on('tag:endschema', () => { depth--; if (depth <= 0) stream.stop(); });
      stream.on('token', (token: any) => { this.content += token.getText?.() || ''; });
      stream.start();
    },
    * render() { return ''; }
  } as any);

  // Element tag
  engine.registerTag('element', {
    parse(tagToken: any, remainTokens: any[]) {
      this.templates = [];
      const stream = this.liquid.parser.parseStream(remainTokens);
      stream.on('tag:endelement', () => stream.stop());
      stream.on('template', (tpl: any) => this.templates.push(tpl));
      stream.start();
    },
    * render(ctx: any, emitter: any) {
      yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
    }
  } as any);

  engine.registerTag('block_attributes', { parse() {}, * render() { return ''; } } as any);
  engine.registerTag('element_attributes', { parse(t: any) { this.args = t.args; }, * render() { return ''; } } as any);

  engine.registerTag('csrf_meta_tags', {
    parse() {},
    * render(_ctx: any, emitter: any) {
      emitter.write('<meta name="csrf-param" content="authenticity_token" />\n<meta name="csrf-token" content="placeholder-token" />');
    }
  } as any);

  engine.registerTag('content_for_header', { parse() {}, * render() { return ''; } } as any);

  engine.registerTag('layout', {
    parse(tagToken: any) { this.layoutName = tagToken.args.replace(/["']/g, '').trim(); },
    * render() { return ''; }
  } as any);

  // Section tag
  engine.registerTag('section', {
    parse(tagToken: any) { this.sectionName = tagToken.args.replace(/["']/g, '').trim(); },
    * render(ctx: any, emitter: any) {
      const name = this.sectionName;
      yield renderSectionBrowser(engine, name, model.sections[name], model, emitter, ctx, theme);
    }
  } as any);

  // content_for_index
  engine.registerTag('content_for_index', {
    parse() {},
    * render(ctx: any, emitter: any) {
      const ids = model.contentFor['content_for_index'] || [];
      for (const id of ids) {
        const sec = model.sections[id];
        if (!sec || sec.hidden === true) continue;
        yield renderSectionBrowser(engine, id, sec, model, emitter, ctx, theme);
      }
    }
  } as any);

  // dynamic_sections_for
  engine.registerTag('dynamic_sections_for', {
    parse(tagToken: any) { this.templateName = tagToken.args.replace(/["']/g, '').trim(); },
    * render(ctx: any, emitter: any) {
      const key = `content_for_${this.templateName}`;
      const ids = model.contentFor[key] || [];
      for (const id of ids) {
        const sec = model.sections[id];
        if (!sec || sec.hidden === true) continue;
        yield renderSectionBrowser(engine, id, sec, model, emitter, ctx, theme);
      }
    }
  } as any);

  // form tag
  engine.registerTag('form', {
    parse(tagToken: any, remainTokens: any[]) {
      this.formVar = tagToken.args.trim();
      this.templates = [];
      const stream = this.liquid.parser.parseStream(remainTokens);
      stream.on('tag:endform', () => stream.stop());
      stream.on('template', (tpl: any) => this.templates.push(tpl));
      stream.start();
    },
    * render(ctx: any, emitter: any) {
      emitter.write('<form method="post" action="#">');
      yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
      emitter.write('</form>');
    }
  } as any);

  // paginate tag
  engine.registerTag('paginate', {
    parse(tagToken: any, remainTokens: any[]) {
      this.args = tagToken.args;
      this.templates = [];
      const stream = this.liquid.parser.parseStream(remainTokens);
      stream.on('tag:endpaginate', () => stream.stop());
      stream.on('template', (tpl: any) => this.templates.push(tpl));
      stream.start();
    },
    * render(ctx: any, emitter: any) {
      ctx.push({ paginate: { pages: 1, current_page: 1, items: 0 } });
      yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
      ctx.pop();
    }
  } as any);

  return engine;
}

// ── SECTION RENDERER ───────────────────────────────────────────────────────
async function renderSectionBrowser(
  engine: Liquid, sectionId: string, section: any, model: SettingsModel,
  emitter: any, parentCtx: any, theme: ThemeFiles
) {
  if (!section) return;
  const sectionType = section.type;
  const templateFile = `${sectionType}.liquid`;
  
  if (!theme.sections[templateFile]) {
    console.warn(`Section template not found: ${templateFile}`);
    return;
  }

  const template = theme.sections[templateFile];
  const visibleBlocks = (section.blocks || []).filter((b: any) => !b.hidden);
  const sectionCtx = {
    section: {
      id: sectionId, type: sectionType, name: section.name,
      settings: section.settings || {}, blocks: visibleBlocks,
    },
    settings: model.globalSettings,
  };

  emitter.write(`<div id="section-${sectionId}" class="kajabi-section" data-section-type="${sectionType}">`);
  try {
    const scope = { ...parentCtx.getAll(), ...sectionCtx };
    const rendered = await engine.parseAndRender(template, scope);
    emitter.write(rendered);
  } catch (err: any) {
    console.warn(`Error rendering section ${sectionId} (${sectionType}):`, err.message);
    emitter.write(`<!-- Error rendering section ${sectionId}: ${err.message} -->`);
  }
  emitter.write('</div>');
}

// ── CORE CSS SHIM ──────────────────────────────────────────────────────────
const CORE_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
img { max-width: 100%; height: auto; }
a { color: inherit; text-decoration: none; }
.hidden { display: none !important; }
.row { display: flex; flex-direction: row; flex-wrap: wrap; }
@media (max-width: 767px) { [class*="col-"] { flex: 0 0 100%; max-width: 100%; } }
.media { display: flex; align-items: center; }
.media__body { flex: 1; }
.align-items-start { align-items: flex-start; }
.align-items-center { align-items: center; }
.align-items-end { align-items: flex-end; }
.align-items-stretch { align-items: stretch; }
.justify-content-left { justify-content: flex-start; }
.justify-content-center { justify-content: center; }
.justify-content-right { justify-content: flex-end; }
.text-left { text-align: left; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.hidden--desktop { }
@media (max-width: 767px) { .hidden--mobile { display: none !important; } }
@media (min-width: 768px) { .hidden--desktop { display: none !important; } }
.section { position: relative; overflow: hidden; background-size: cover; background-position: center; }
.sizer { position: relative; z-index: 1; padding: 40px 0; }
.sizer--full { min-height: 100vh; display: flex; align-items: center; }
.sizer--full .container { width: 100%; }
.section__overlay { position: absolute; width: 100%; height: 100%; left: 0; top: 0; pointer-events: none; }
.block { position: relative; }
.block-break { flex-basis: 100%; height: 0; }
.background-dark { color: #fff; }
.background-dark h1,.background-dark h2,.background-dark h3,.background-dark h4,.background-dark h5,.background-dark h6 { color: #fff; }
.btn { display: inline-block; padding: 12px 24px; font-weight: 600; text-align: center; cursor: pointer; border: 2px solid transparent; transition: all 0.3s ease; text-decoration: none; }
.btn--small { padding: 8px 16px; font-size: 14px; }
.btn--medium { padding: 12px 24px; font-size: 16px; }
.btn--large { padding: 16px 32px; font-size: 18px; }
.btn--auto { width: auto; }
.btn--full { width: 100%; }
.btn--solid { }
.btn--outline { background: transparent !important; }
.header { position: relative; z-index: 100; }
.header--overlay { position: absolute; width: 100%; top: 0; left: 0; z-index: 100; }
.header--fixed { position: fixed; top: 0; left: 0; width: 100%; z-index: 1000; }
.header__container { display: flex; align-items: center; padding: 15px 40px; }
.header__block { padding: 0 10px; }
.stretch { flex: 1; }
.hamburger { cursor: pointer; padding: 10px; display: none; }
@media (max-width: 767px) { .hamburger { display: block; } .header__content--desktop .header__switch-content { display: none; } .header__content--desktop .header__block--logo { display: block; } .header.hamburger--open .header__content--mobile { display: block; } }
.hamburger__slices { width: 25px; height: 20px; position: relative; }
.hamburger__slice { position: absolute; height: 2px; width: 100%; background-color: #333; left: 0; transition: all 0.3s; }
.logo { display: inline-flex; align-items: center; }
.logo__image { display: block; }
.logo__text { font-size: 24px; font-weight: 700; margin: 0; }
.link-list { display: flex; flex-wrap: wrap; align-items: center; }
.link-list--column, .link-list--true { flex-direction: column; align-items: stretch; }
.link-list--column .link-list__links, .link-list--true .link-list__links { flex-direction: column; }
.link-list--row, .link-list--false { flex-direction: row; }
.link-list--row .link-list__links, .link-list--false .link-list__links { flex-direction: row; flex-wrap: wrap; }
.link-list__links { display: flex; flex-wrap: wrap; }
.link-list__link { padding: 5px 10px; display: block; }
.link-list__title { margin-bottom: 10px; }
.link-list--desktop-left { text-align: left; }
.link-list--desktop-center { text-align: center; }
.link-list--desktop-right { text-align: right; }
.footer .link-list__link { padding: 3px 0; }
/* Override theme's forced footer link-list layout so block settings take effect */
.footer .link-list.link-list--false, .footer .link-list.link-list--row { display: flex; flex-direction: row; flex-wrap: wrap; }
.footer .link-list.link-list--false .link-list__links, .footer .link-list.link-list--row .link-list__links { flex-direction: row; flex-wrap: wrap; }
.footer .link-list.link-list--true, .footer .link-list.link-list--column { display: flex; flex-direction: column; }
.footer .link-list.link-list--true .link-list__links, .footer .link-list.link-list--column .link-list__links { flex-direction: column; }
.footer--stacked .link-list.link-list--false, .footer--stacked .link-list.link-list--row { display: flex; flex-direction: row; flex-wrap: wrap; }
.footer--stacked .link-list.link-list--false .link-list__links, .footer--stacked .link-list.link-list--row .link-list__links { flex-direction: row; flex-wrap: wrap; }
.dropdown { position: relative; }
.dropdown__trigger { cursor: pointer; display: flex; align-items: center; gap: 5px; }
.dropdown__menu { display: none; position: absolute; top: 100%; min-width: 180px; background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 100; padding: 8px 0; }
.dropdown:hover .dropdown__menu { display: block; }
.dropdown__item { display: block; }
.dropdown__item a { display: block; padding: 8px 16px; }
.footer { padding: 30px 0; }
.footer__container { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.footer--stacked .footer__container { flex-direction: column; align-items: center; }
.footer__block { padding: 10px; }
.copyright { font-size: 14px; opacity: 0.7; }
.feature { text-align: inherit; }
.feature__image { display: block; margin: 0 auto 20px; border-radius: 100px; }
.image { position: relative; overflow: hidden; }
.image__image { display: block; width: 100%; }
.wistia-placeholder { background: #000; color: #fff; padding: 60px 20px; text-align: center; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; }
.form-group { margin-bottom: 15px; }
.form-control { display: block; width: 100%; padding: 10px 15px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px; }
.modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 10000; background: rgba(0,0,0,0.5); }
.modal--open { display: flex; align-items: center; justify-content: center; }
.modal__content { position: relative; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto; padding: 40px; background: #fff; }
.close-x { position: absolute; top: 15px; right: 15px; cursor: pointer; z-index: 1; }
.accordion { margin-bottom: 10px; }
.accordion-title { display: flex; cursor: pointer; padding: 15px 0; border-bottom: 1px solid #eee; }
.accordion-body { padding: 15px 0; }
.cart-button { background: none; border: none; cursor: pointer; font-size: 18px; color: inherit; }
.login { padding: 60px 0; }
/* Card styles */
.card { display: block; text-decoration: none; color: inherit; overflow: hidden; }
.card__image { display: block; width: 100%; height: auto; }
.card__body { padding: 16px 0; }
.card__title { margin: 0 0 8px; }
.card__text { margin: 0; font-size: 14px; opacity: 0.7; }
.card__footer { margin-top: 12px; font-size: 13px; }
.card__button { margin-top: 12px; }
/* Blog listing */
.blog-listing { margin-bottom: 30px; }
.blog-listing__media img { width: 100%; display: block; }
.blog-listing__title { display: block; margin-bottom: 8px; font-weight: 700; }
.blog-listing__date { font-size: 14px; opacity: 0.7; }
.blog-listing__content { margin: 10px 0; }
.blog-listing__more { font-weight: 600; }
/* Box shadow color variant */
.box-shadow-color { box-shadow: 0 0 10px 0 rgba(0,0,0,0.08); }
@media (max-width: 767px) { .header__container { padding: 10px 15px; } .footer__container { flex-direction: column; text-align: center; gap: 15px; } }
@keyframes spin { to { transform: rotate(360deg); } }
`;

// ── RE-RENDER FROM IN-MEMORY DATA ──────────────────────────────────────────
/**
 * Re-render a single page from already-loaded theme data (no zip needed).
 * Used for live preview in the builder when settings change.
 */
export async function renderPageFromData(
  themeData: {
    settings_data: any;
    settings_schema?: any;
    layouts: Record<string, string>;
    templates: Record<string, string>;
    sections: Record<string, string>;
    snippets: Record<string, string>;
    assets_text: Record<string, string>;
  },
  pageName: string,
  assetUrls?: Record<string, string>,
): Promise<{ html: string; styles: string; coreCss: string }> {
  const theme: ThemeFiles = {
    layouts: themeData.layouts,
    templates: themeData.templates,
    sections: themeData.sections,
    snippets: themeData.snippets,
    assets: themeData.assets_text,
    assetBlobs: {},
    config: {
      settings_data: themeData.settings_data,
      settings_schema: themeData.settings_schema || [],
    },
  };

  const model = buildSettingsModel(theme.config);
  const assetUrlMap = assetUrls || {};
  const engine = createEngine(theme, model, assetUrlMap);

  // Compile styles
  let styles = '';
  const scssLiquid = theme.assets['styles.scss.liquid'];
  if (scssLiquid) {
    try {
      styles = await engine.parseAndRender(scssLiquid, { settings: model.globalSettings });
    } catch (e) {
      console.warn('Style compilation error:', e);
    }
  }

  // Render the requested page
  const templateFile = `${pageName}.liquid`;
  const templateContent = theme.templates[templateFile];
  if (!templateContent) {
    return { html: `<div style="padding:40px;color:#999">Template "${pageName}" not found</div>`, styles, coreCss: CORE_CSS };
  }

  try {
    let layoutName = 'theme';
    const layoutMatch = templateContent.match(/\{%\s*layout\s+["'](\w+)["']\s*%\}/);
    if (layoutMatch) layoutName = layoutMatch[1];

    const contentHtml = await engine.parseAndRender(templateContent, {
      settings: model.globalSettings,
    });

    const layoutFile = `${layoutName}.liquid`;
    const layoutContent = theme.layouts[layoutFile];
    if (layoutContent) {
      const titles: Record<string, string> = {
        index: 'Home', page: 'Page', store: 'Store', sales_page: 'Sales Page',
        login: 'Login', '404': 'Not Found', blog: 'Blog', about: 'About', contact: 'Contact',
      };
      const html = await engine.parseAndRender(layoutContent, {
        content_for_layout: contentHtml,
        settings: model.globalSettings,
        page_title: titles[pageName] || pageName,
      });
      return { html, styles, coreCss: CORE_CSS };
    }
    return { html: contentHtml, styles, coreCss: CORE_CSS };
  } catch (err: any) {
    console.error(`Error rendering ${pageName}:`, err);
    return { html: `<div style="padding:40px;color:red"><h2>Error rendering ${pageName}</h2><pre>${err.message}</pre></div>`, styles, coreCss: CORE_CSS };
  }
}

// ── MAIN EXPORT ────────────────────────────────────────────────────────────
export async function processThemeZip(file: File, onProgress: ProgressCallback): Promise<RenderResult> {
  const theme = await extractThemeFromZip(file, onProgress);

  onProgress('Building settings model…');
  const model = buildSettingsModel(theme.config);

  // Create blob URLs for binary assets
  onProgress('Processing assets…');
  const assetUrlMap: Record<string, string> = {};
  for (const [name, blob] of Object.entries(theme.assetBlobs)) {
    assetUrlMap[name] = URL.createObjectURL(blob);
  }

  onProgress('Initializing Liquid engine…');
  const engine = createEngine(theme, model, assetUrlMap);

  // Compile styles
  onProgress('Compiling styles…');
  let styles = '';
  const scssLiquid = theme.assets['styles.scss.liquid'];
  if (scssLiquid) {
    styles = await engine.parseAndRender(scssLiquid, { settings: model.globalSettings });
  }

  // Render templates
  const templateNames = Object.keys(theme.templates)
    .filter(n => n.endsWith('.liquid'))
    .map(n => n.replace('.liquid', ''));

  const pages: Record<string, string> = {};

  for (const name of templateNames) {
    onProgress(`Rendering ${name}…`);
    try {
      const templateContent = theme.templates[`${name}.liquid`];
      if (!templateContent) continue;

      let layoutName = 'theme';
      const layoutMatch = templateContent.match(/\{%\s*layout\s+["'](\w+)["']\s*%\}/);
      if (layoutMatch) layoutName = layoutMatch[1];

      const contentHtml = await engine.parseAndRender(templateContent, {
        settings: model.globalSettings,
      });

      const layoutFile = `${layoutName}.liquid`;
      const layoutContent = theme.layouts[layoutFile];
      if (layoutContent) {
        const titles: Record<string, string> = {
          index: 'Home', page: 'Page', store: 'Store', sales_page: 'Sales Page',
          login: 'Login', '404': 'Not Found', blog: 'Blog', about: 'About', contact: 'Contact',
        };
        pages[name] = await engine.parseAndRender(layoutContent, {
          content_for_layout: contentHtml,
          settings: model.globalSettings,
          page_title: titles[name] || name,
        });
      } else {
        pages[name] = contentHtml;
      }
    } catch (err: any) {
      console.error(`Error rendering ${name}:`, err);
      pages[name] = `<div style="padding:40px;color:red"><h2>Error rendering ${name}</h2><pre>${err.message}</pre></div>`;
    }
  }

  const manifest = {
    pages: templateNames,
    generatedAt: new Date().toISOString(),
  };

  onProgress('Complete!');

  return {
    pages, styles, coreCss: CORE_CSS, manifest, assetUrls: assetUrlMap, assetBlobs: theme.assetBlobs,
    themeData: {
      settings_data: theme.config.settings_data,
      settings_schema: theme.config.settings_schema,
      layouts: theme.layouts,
      templates: theme.templates,
      sections: theme.sections,
      snippets: theme.snippets,
      assets_text: theme.assets,
    },
  };
}
