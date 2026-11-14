import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { AppState, Platform, Share } from 'react-native';

import { FONT_FACE_PLACEHOLDER, PAGE_FORMATS, type PageFormat } from '@/core/documents';

// Device services used by features: the OS share sheet, PDF creation and printing. Everything
// here works offline. Sharing always goes through the share sheet: the user picks the app
// (WhatsApp, Messenger, SMS, email) and sends it themselves (AGENTS.md §1 rule 6).

/** Opens the share sheet with a text message, e.g. a payment reminder. */
export async function shareText(message: string): Promise<void> {
  await Share.share({ message });
}

/** Opens the share sheet with a file, e.g. an invoice PDF. */
export async function shareFile(uri: string, mimeType: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available');
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: title });
}

// The Noto fonts are bundled with the app, so PDFs look the same on every phone, including
// Bengali text, without downloading anything.
/* eslint-disable @typescript-eslint/no-require-imports -- Metro bundles assets via require() */
const DOCUMENT_FONTS = [
  {
    family: 'VL Noto Sans',
    weight: 400,
    module: require('@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf'),
  },
  {
    family: 'VL Noto Sans',
    weight: 700,
    module: require('@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf'),
  },
  {
    family: 'VL Noto Sans Bengali',
    weight: 400,
    module: require('@expo-google-fonts/noto-sans-bengali/400Regular/NotoSansBengali_400Regular.ttf'),
  },
  {
    family: 'VL Noto Sans Bengali',
    weight: 700,
    module: require('@expo-google-fonts/noto-sans-bengali/700Bold/NotoSansBengali_700Bold.ttf'),
  },
] as const;
/* eslint-enable @typescript-eslint/no-require-imports */

let fontCss: Promise<string> | undefined;

async function loadFontCss(): Promise<string> {
  const rules = await Promise.all(
    DOCUMENT_FONTS.map(async ({ family, weight, module }) => {
      const asset = await Asset.fromModule(module).downloadAsync();
      if (!asset.localUri) return '';
      const base64 = await new File(asset.localUri).base64();
      return `@font-face { font-family: '${family}'; font-weight: ${weight}; src: url(data:font/ttf;base64,${base64}) format('truetype'); }`;
    }),
  );
  return rules.join('\n');
}

/** Inserts the bundled fonts into a document. Falls back to system fonts if they cannot load. */
async function withFonts(html: string): Promise<string> {
  fontCss ??= loadFontCss().catch(() => '');
  return html.replace(FONT_FACE_PLACEHOLDER, await fontCss);
}

function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_');
}

/** Renders a document to a PDF file in the cache directory and returns its URI. */
export async function htmlToPdf(
  html: string,
  fileName: string,
  format: PageFormat,
): Promise<string> {
  const page = PAGE_FORMATS[format];
  const { uri } = await Print.printToFileAsync({
    html: await withFonts(html),
    width: page.widthPt,
    height: page.heightPt,
  });
  const target = new File(Paths.cache, `${safeFileName(fileName)}.pdf`);
  if (target.exists) target.delete();
  await new File(uri).move(target);
  return target.uri;
}

/** Sends a document to the system print dialog (Wi-Fi and USB printers). */
export async function printHtml(html: string): Promise<void> {
  await Print.printAsync({ html: await withFonts(html) });
}

/** Writes text to a file in the cache directory (CSV exports) and returns its URI. */
export async function writeCacheFile(fileName: string, content: string): Promise<string> {
  const target = new File(Paths.cache, safeFileName(fileName));
  if (target.exists) target.delete();
  target.create();
  await target.write(content);
  return target.uri;
}

/** Writes binary content to a file in the cache directory (encrypted backups) and returns its URI. */
export async function writeCacheBytes(fileName: string, content: Uint8Array): Promise<string> {
  const target = new File(Paths.cache, safeFileName(fileName));
  if (target.exists) target.delete();
  target.create();
  await target.write(content);
  return target.uri;
}

/**
 * Downloads a URL into the cache and returns its bytes (encrypted cloud backups). Uses the
 * native downloader, which handles binary content reliably on every React Native version.
 */
export async function downloadBytes(
  url: string,
  headers: Record<string, string>,
): Promise<Uint8Array> {
  const target = new File(Paths.cache, `download-${Date.now()}.bin`);
  try {
    const file = await File.downloadFileAsync(url, target, { headers });
    return await file.bytes();
  } finally {
    if (target.exists) target.delete();
  }
}

/** Reads a file the user picked (e.g. a backup to restore) as bytes. */
export function readFileBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}

/** The operating system, as the API's device registration names it. */
export function devicePlatform(): 'android' | 'ios' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

export type AppLifecycleState = 'active' | 'background' | 'inactive';

export function getCurrentAppState(): AppLifecycleState {
  const current = AppState.currentState;
  return current === 'background' || current === 'inactive' ? current : 'active';
}

export function onAppStateChange(listener: (state: AppLifecycleState) => void): () => void {
  const subscription = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active' || nextState === 'background' || nextState === 'inactive') {
      listener(nextState);
    }
  });
  return () => {
    subscription.remove();
  };
}
