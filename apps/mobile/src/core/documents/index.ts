import { lightTheme } from '@tokens/theme';

// Shared shell for printable documents (invoices, statements, reports). Documents are plain
// HTML strings built by pure functions, so they are unit tested in Node; the device turns them
// into PDFs with expo-print. Colors and sizes come from the design tokens (always the light
// theme: documents are printed on white paper).

/** Escapes text for use in HTML. Every value a user typed goes through this. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Marker replaced on the device with @font-face rules for the bundled Noto fonts. */
export const FONT_FACE_PLACEHOLDER = '/*__DOCUMENT_FONTS__*/';

/** Font families declared by the device's @font-face rules, with system fallbacks. */
export const DOCUMENT_FONT_STACK =
  "'VL Noto Sans', 'VL Noto Sans Bengali', 'Noto Sans', 'Noto Sans Bengali', sans-serif";

export type PageFormat = 'a4' | 'thermal58' | 'thermal80';

interface PageSpec {
  /** Page width in PDF points (1/72 inch). */
  widthPt: number;
  /** Page height in points. Thermal paper is a continuous roll, so its page is very tall. */
  heightPt: number;
  /** CSS @page size. */
  cssSize: string;
  marginMm: number;
  baseFontPx: number;
}

export const PAGE_FORMATS: Readonly<Record<PageFormat, PageSpec>> = {
  a4: { widthPt: 595, heightPt: 842, cssSize: 'A4', marginMm: 14, baseFontPx: 14 },
  thermal58: { widthPt: 164, heightPt: 1400, cssSize: '58mm 500mm', marginMm: 2, baseFontPx: 10 },
  thermal80: { widthPt: 227, heightPt: 1400, cssSize: '80mm 500mm', marginMm: 3, baseFontPx: 11 },
};

interface DocumentShellOptions {
  /** BCP 47 language of the document's text, for correct shaping and screen readers. */
  lang: string;
  title: string;
  format: PageFormat;
  /** Already-escaped HTML of the document body. */
  body: string;
}

/** Wraps a document body in a complete, self-contained HTML page. */
export function documentHtml({ lang, title, format, body }: DocumentShellOptions): string {
  const page = PAGE_FORMATS[format];
  const { colors } = lightTheme;
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${FONT_FACE_PLACEHOLDER}
@page { size: ${page.cssSize}; margin: ${page.marginMm}mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: ${DOCUMENT_FONT_STACK};
  font-size: ${page.baseFontPx}px;
  line-height: 1.5;
  color: ${colors.text.primary};
  background: ${colors.bg.surface};
}
h1 { font-size: 1.6em; margin: 0; }
h2 { font-size: 1.15em; margin: 0; }
p { margin: 0; }
.muted { color: ${colors.text.secondary}; }
.row { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.right { text-align: right; }
.amount { font-variant-numeric: tabular-nums; white-space: nowrap; }
.strong { font-weight: 700; }
.section { margin-top: 1.2em; }
.rule { border: 0; border-top: 1px solid ${colors.border.default}; margin: 0.8em 0; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-weight: 600; color: ${colors.text.secondary}; }
th, td { padding: 0.35em 0.2em; border-bottom: 1px solid ${colors.border.default}; vertical-align: top; }
th.right, td.right { text-align: right; }
.paid { color: ${colors.money.paid}; }
.due { color: ${colors.money.due}; }
.badge { display: inline-block; padding: 0.1em 0.6em; border: 1px solid currentColor; border-radius: 999px; font-weight: 600; }
.logo { max-height: 64px; max-width: 160px; }
.watermark { margin-top: 1.6em; text-align: center; color: ${colors.text.secondary}; font-size: 0.85em; }
.cancelled { color: ${colors.money.cancelled}; text-decoration: line-through; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
