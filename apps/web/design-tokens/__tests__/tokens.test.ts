import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { contrastRatio, darkTheme, getTheme, lightTheme, type Theme } from '../theme';

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#0B7347', '#FFFFFF')).toBe(contrastRatio('#FFFFFF', '#0B7347'));
  });

  it('rejects non-hex colors', () => {
    expect(() => contrastRatio('rgb(0,0,0)', '#FFFFFF')).toThrow(/#RRGGBB/);
  });
});

describe.each<[string, Theme]>([
  ['light', lightTheme],
  ['dark', darkTheme],
])('%s theme accessibility (WCAG AA)', (_name, theme) => {
  const { bg, text, action, status, money, confidence, border } = theme.colors;
  const surfaces = { canvas: bg.canvas, surface: bg.surface, raised: bg.raised };

  it.each(Object.entries(surfaces))('text is readable on bg.%s', (_surface, background) => {
    expect(contrastRatio(text.primary, background)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(text.secondary, background)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(text.link, background)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('action labels are readable on action backgrounds', () => {
    expect(contrastRatio(text.onAction, action.primary)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(text.onAction, action.primaryPressed)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(Object.entries(surfaces))(
    'status and money colors are readable on bg.%s',
    (_surface, background) => {
      for (const color of [
        status.success,
        status.warning,
        status.danger,
        status.info,
        money.paid,
        money.due,
        money.cancelled,
        confidence.low,
      ]) {
        expect(contrastRatio(color, background)).toBeGreaterThanOrEqual(AA_TEXT);
      }
    },
  );

  it('status colors are readable on their tinted backgrounds', () => {
    expect(contrastRatio(status.success, status.successBg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(status.warning, status.warningBg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(status.danger, status.dangerBg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(status.info, status.infoBg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(confidence.low, confidence.lowBg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('focus and strong borders are visible against surfaces', () => {
    for (const background of Object.values(surfaces)) {
      expect(contrastRatio(border.focus, background)).toBeGreaterThanOrEqual(AA_NON_TEXT);
      expect(contrastRatio(border.strong, background)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });
});

describe('theme shape', () => {
  it('exposes the same semantic tokens in light and dark', () => {
    const keys = (theme: Theme) =>
      Object.entries(theme.colors).flatMap(([group, entries]) =>
        Object.keys(entries).map((name) => `${group}.${name}`),
      );
    expect(keys(darkTheme)).toEqual(keys(lightTheme));
  });

  it('includes every semantic token required by the design system', () => {
    const required = {
      bg: ['canvas', 'surface', 'raised'],
      text: ['primary', 'secondary', 'inverse'],
      border: ['default'],
      action: ['primary', 'primaryPressed'],
      status: ['success', 'warning', 'danger', 'info'],
      money: ['paid', 'due', 'cancelled'],
      confidence: ['low'],
    } as const;
    for (const [group, names] of Object.entries(required)) {
      expect(Object.keys(lightTheme.colors[group as keyof typeof required])).toEqual(
        expect.arrayContaining([...names]),
      );
    }
  });

  it('uses the 4-point spacing scale', () => {
    expect(Object.values(lightTheme.spacing)).toEqual([0, 4, 8, 12, 16, 24, 32, 48, 64]);
  });

  it('keeps body text at 16 or larger and touch targets at 48', () => {
    expect(lightTheme.typography.body.fontSize).toBeGreaterThanOrEqual(16);
    expect(lightTheme.size.touchTarget).toBeGreaterThanOrEqual(48);
  });

  it('keeps motion durations between 150 and 250 ms', () => {
    for (const duration of Object.values(lightTheme.motion.duration)) {
      expect(duration).toBeGreaterThanOrEqual(150);
      expect(duration).toBeLessThanOrEqual(250);
    }
  });

  it('renders amounts with tabular figures', () => {
    expect(lightTheme.typography.amount.tabularNums).toBe(true);
  });

  it('getTheme returns the matching scheme', () => {
    expect(getTheme('light')).toBe(lightTheme);
    expect(getTheme('dark')).toBe(darkTheme);
  });
});

describe('generated stylesheets', () => {
  const dist = resolve(__dirname, '../generated');
  const css = readFileSync(resolve(dist, 'tokens.css'), 'utf8');
  const tailwind = readFileSync(resolve(dist, 'tailwind.css'), 'utf8');

  it('emits every semantic color as a CSS custom property', () => {
    expect(css).toContain(`--vl-color-bg-canvas: ${lightTheme.colors.bg.canvas};`);
    expect(css).toContain(`--vl-color-bg-canvas: ${darkTheme.colors.bg.canvas};`);
    expect(css).toContain(
      `--vl-color-action-primary-pressed: ${lightTheme.colors.action.primaryPressed};`,
    );
  });

  it('supports OS dark mode, an explicit override and reduced motion', () => {
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(":root[data-theme='dark']");
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('maps Tailwind colors onto the custom properties and drops the default palette', () => {
    expect(tailwind).toContain('--color-*: initial;');
    expect(tailwind).toContain('--color-money-due: var(--vl-color-money-due);');
    expect(tailwind).toContain('--text-body: 1rem;');
    expect(tailwind).toContain('--radius-md: 0.625rem;');
  });
});
