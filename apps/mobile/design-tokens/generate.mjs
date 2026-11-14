// Generates every platform output from tokens.json (next to this script):
//   generated/tokens.ts     → typed theme source (used by React Native and the token tests)
//   generated/tokens.css    → CSS custom properties, light + dark (used by the landing site)
//   generated/tailwind.css  → Tailwind v4 `@theme` mapped onto those custom properties
//
// MIRRORED: the design-tokens folder is duplicated in apps/web and apps/mobile, because every
// app is standalone. Keep the copies identical (tools/mirror.mjs checks this).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(resolve(root, 'tokens.json'), 'utf8'));

const HEADER =
  'AUTO-GENERATED from design-tokens/tokens.json by design-tokens/generate.mjs. Do not edit.';
const REFERENCE = /^\{([a-z]+)\.(\d+)\}$/;

/** camelCase / mixed keys → kebab-case for CSS custom property names. */
const kebab = (key) => key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const rem = (px) => (px === 0 ? '0' : `${px / 16}rem`);

/** Resolves a `{palette.step}` reference against the primitive palette. */
function resolveColor(value, path) {
  const match = REFERENCE.exec(value);
  if (!match) return value;
  const [, palette, step] = match;
  const resolved = tokens.color.primitive[palette]?.[step];
  if (!resolved) throw new Error(`Unknown color reference ${value} at ${path}`);
  return resolved;
}

function resolveScheme(scheme) {
  const out = {};
  for (const [group, entries] of Object.entries(tokens.color.semantic[scheme])) {
    out[group] = {};
    for (const [name, value] of Object.entries(entries)) {
      out[group][name] = resolveColor(value, `color.semantic.${scheme}.${group}.${name}`);
    }
  }
  return out;
}

const semantic = { light: resolveScheme('light'), dark: resolveScheme('dark') };

// Both schemes must expose exactly the same semantic tokens.
const shape = (scheme) =>
  Object.entries(semantic[scheme])
    .flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}.${name}`))
    .sort()
    .join(',');
if (shape('light') !== shape('dark')) {
  throw new Error('Light and dark themes must define the same semantic color tokens.');
}

const shadow = ({ offsetY, blur, opacity }) =>
  opacity === 0 ? 'none' : `0 ${offsetY}px ${blur}px rgb(0 0 0 / ${opacity})`;
const bezier = (points) => `cubic-bezier(${points.join(', ')})`;
const fontStack = tokens.typography.fontFamily.sans
  .map((family) => (family.includes(' ') ? `"${family}"` : family))
  .join(', ');

// ── TypeScript (React Native theme source) ────────────────────────────────────────────────
function generateTypeScript() {
  const elevation = Object.fromEntries(
    Object.entries(tokens.elevation).map(([name, e]) => [
      name,
      {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: e.offsetY },
        shadowOpacity: e.opacity,
        shadowRadius: e.blur / 2,
        elevation: e.android,
      },
    ]),
  );
  const typography = Object.fromEntries(
    Object.entries(tokens.typography.scale).map(([name, t]) => [
      name,
      {
        fontSize: t.fontSize,
        lineHeight: t.lineHeight,
        fontWeight: String(t.fontWeight),
        tabularNums: t.tabularNums === true,
        letterSpacing: t.letterSpacing ?? 0,
        uppercase: t.uppercase === true,
      },
    ]),
  );
  const constant = (name, value) =>
    `export const ${name} = ${JSON.stringify(value, null, 2)} as const;\n`;

  return [
    `// ${HEADER}`,
    '',
    constant('primitives', tokens.color.primitive),
    constant('colors', semantic),
    constant('fontFamily', {
      latin: tokens.typography.fontFamily.latin,
      bengali: tokens.typography.fontFamily.bengali,
    }),
    constant('typography', typography),
    constant('spacing', tokens.spacing),
    constant('radius', tokens.radius),
    constant('elevation', elevation),
    constant('motion', tokens.motion),
    constant('zIndex', tokens.zIndex),
    constant('size', tokens.size),
  ].join('\n');
}

// ── CSS custom properties ─────────────────────────────────────────────────────────────────
function colorDeclarations(scheme) {
  return Object.entries(semantic[scheme]).flatMap(([group, entries]) =>
    Object.entries(entries).map(
      ([name, value]) => `--vl-color-${kebab(group)}-${kebab(name)}: ${value};`,
    ),
  );
}

function block(selector, declarations, indent = '') {
  const body = declarations.map((line) => `${indent}  ${line}`).join('\n');
  return `${indent}${selector} {\n${body}\n${indent}}`;
}

function generateCss() {
  const staticDeclarations = [
    `--vl-font-sans: ${fontStack};`,
    ...Object.entries(tokens.spacing).map(([name, px]) => `--vl-space-${name}: ${rem(px)};`),
    ...Object.entries(tokens.radius).map(
      ([name, px]) => `--vl-radius-${name}: ${name === 'full' ? `${px}px` : rem(px)};`,
    ),
    ...Object.entries(tokens.elevation).map(([name, e]) => `--vl-shadow-${name}: ${shadow(e)};`),
    ...Object.entries(tokens.motion.duration).map(
      ([name, ms]) => `--vl-duration-${name}: ${ms}ms;`,
    ),
    ...Object.entries(tokens.motion.easing).map(
      ([name, points]) => `--vl-ease-${name}: ${bezier(points)};`,
    ),
    ...Object.entries(tokens.zIndex).map(([name, z]) => `--vl-z-${name}: ${z};`),
    `--vl-size-touch-target: ${rem(tokens.size.touchTarget)};`,
  ];

  return [
    `/* ${HEADER} */`,
    block(':root', ['color-scheme: light;', ...colorDeclarations('light'), ...staticDeclarations]),
    '',
    '/* Dark theme: follows the OS unless the page pins a theme with data-theme. */',
    `@media (prefers-color-scheme: dark) {\n${block(
      ":root:not([data-theme='light'])",
      ['color-scheme: dark;', ...colorDeclarations('dark')],
      '  ',
    )}\n}`,
    block(":root[data-theme='dark']", ['color-scheme: dark;', ...colorDeclarations('dark')]),
    '',
    '/* Durations collapse when the user asks for reduced motion. */',
    `@media (prefers-reduced-motion: reduce) {\n${block(
      ':root',
      Object.keys(tokens.motion.duration).map((name) => `--vl-duration-${name}: 0ms;`),
      '  ',
    )}\n}`,
    '',
  ].join('\n');
}

// ── Tailwind v4 theme ─────────────────────────────────────────────────────────────────────
function generateTailwind() {
  const colorTheme = Object.entries(semantic.light).flatMap(([group, entries]) =>
    Object.keys(entries).map((name) => {
      const id = `${kebab(group)}-${kebab(name)}`;
      return `--color-${id}: var(--vl-color-${id});`;
    }),
  );

  const textTheme = Object.entries(tokens.typography.scale).flatMap(([name, t]) => [
    `--text-${kebab(name)}: ${rem(t.fontSize)};`,
    `--text-${kebab(name)}--line-height: ${rem(t.lineHeight)};`,
    `--text-${kebab(name)}--font-weight: ${t.fontWeight};`,
    ...(t.letterSpacing ? [`--text-${kebab(name)}--letter-spacing: ${rem(t.letterSpacing)};`] : []),
  ]);

  return [
    `/* ${HEADER} */`,
    '/* Import after `@import "tailwindcss"`. Removes the default palette, type scale, radii and',
    '   shadows so only design tokens are available as utilities. */',
    block('@theme', [
      '--color-*: initial;',
      '--text-*: initial;',
      '--radius-*: initial;',
      '--shadow-*: initial;',
      '--ease-*: initial;',
      '--spacing: 0.25rem;',
      ...textTheme,
      ...Object.entries(tokens.radius).map(
        ([name, px]) => `--radius-${name}: ${name === 'full' ? `${px}px` : rem(px)};`,
      ),
      ...Object.entries(tokens.elevation).map(([name, e]) => `--shadow-${name}: ${shadow(e)};`),
      ...Object.entries(tokens.motion.easing).map(
        ([name, points]) => `--ease-${name}: ${bezier(points)};`,
      ),
    ]),
    '',
    block('@theme inline', [
      '--color-transparent: transparent;',
      '--color-current: currentColor;',
      ...colorTheme,
      '--font-sans: var(--vl-font-sans);',
    ]),
    '',
  ].join('\n');
}

function write(relativePath, content) {
  const target = resolve(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
}

write('generated/tokens.ts', generateTypeScript());
write('generated/tokens.css', generateCss());
write('generated/tailwind.css', generateTailwind());
