import JSZip from 'jszip';
import type { KajabiThemeData, KajabiSection } from '@/types';

export async function loadKajabiThemeFromZip(zipData: ArrayBuffer): Promise<KajabiThemeData> {
  const zip = await JSZip.loadAsync(zipData);
  const files: Record<string, string> = {};
  const assets: Record<string, ArrayBuffer> = {};
  let settingsData: any = { current: {} };
  let rootPrefix = '';

  const entries = Object.entries(zip.files);
  
  // Detect root folder prefix (e.g. "theme-export/")
  for (const [path] of entries) {
    const parts = path.split('/');
    if (parts.length > 1 && !['config', 'layouts', 'templates', 'sections', 'snippets', 'assets', 'locales'].includes(parts[0])) {
      rootPrefix = parts[0] + '/';
      break;
    }
  }
  
  for (const [path, file] of entries) {
    if (file.dir) continue;
    
    // Normalize path - strip root prefix if present
    const normalizedPath = rootPrefix && path.startsWith(rootPrefix) 
      ? path.slice(rootPrefix.length) 
      : path;
    
    if (normalizedPath === 'config/settings_data.json') {
      const content = await file.async('string');
      try {
        settingsData = JSON.parse(content);
      } catch {
        console.warn('Failed to parse settings_data.json');
      }
    } else if (isTextFile(normalizedPath)) {
      files[normalizedPath] = await file.async('string');
    } else {
      assets[normalizedPath] = await file.async('arraybuffer');
    }
  }

  return { settingsData, files, assets, rootPrefix };
}

function isTextFile(path: string): boolean {
  const textExtensions = ['.liquid', '.json', '.css', '.scss', '.js', '.html', '.txt', '.svg', '.md'];
  return textExtensions.some(ext => path.toLowerCase().endsWith(ext));
}

export function getThemeSections(theme: KajabiThemeData): Record<string, KajabiSection> {
  return theme.settingsData.current?.sections || {};
}

export function getContentForPage(theme: KajabiThemeData, page: string): string[] {
  const key = page === 'index' ? 'content_for_index' : `content_for_${page}`;
  return theme.settingsData.current?.[key] || [];
}

export function getThemeGlobalSettings(theme: KajabiThemeData): Record<string, any> {
  const current = { ...theme.settingsData.current };
  const exclude = ['sections', 'link_lists'];
  const globals: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(current)) {
    if (!exclude.includes(key) && !key.startsWith('content_for_')) {
      globals[key] = value;
    }
  }
  
  return globals;
}

export function getThemeLinkLists(theme: KajabiThemeData): Record<string, any> {
  return theme.settingsData.current?.link_lists || {};
}

export function getThemeFileList(theme: KajabiThemeData): string[] {
  return [
    ...Object.keys(theme.files),
    ...Object.keys(theme.assets),
  ].sort();
}
