// Keeps duplicated code identical across the standalone apps.
//
// Every app (apps/api, apps/web, apps/mobile) is standalone: it depends on nothing outside its
// own folder and can be copied out and built alone. Code that several apps need is therefore
// duplicated, and this script is the guard against the copies drifting apart while the apps
// still live in one repository. It has no dependencies and belongs to no app.
//
//   node tools/mirror.mjs check                 exit 1 if any mirrored folder differs
//   node tools/mirror.mjs sync <group> <from>   copy one app's version over the others
//                                               e.g. node tools/mirror.mjs sync shared apps/api
//
// If the apps are ever split into separate repositories, delete this file; the copies then
// evolve independently and the sync contracts must be kept compatible by hand.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Mirrored folders. `importExtension` is what relative imports must end with in that app:
 * the API is native ESM (NodeNext) and needs `.js`; bundled apps use extensionless imports.
 */
const GROUPS = {
  shared: {
    description: 'Money, IDs, formatters, Zod schemas and sync contracts',
    copies: [
      { app: 'apps/api', dir: 'apps/api/src/shared', importExtension: '.js' },
      { app: 'apps/mobile', dir: 'apps/mobile/src/shared', importExtension: '' },
      { app: 'apps/web', dir: 'apps/web/src/shared', importExtension: '' },
    ],
    ignore: [],
  },
  parser: {
    description: 'Voice text → DraftInvoice parser and its language packs (tested in apps/mobile)',
    copies: [
      { app: 'apps/mobile', dir: 'apps/mobile/src/parser', importExtension: '' },
      { app: 'apps/web', dir: 'apps/web/src/parser', importExtension: '' },
    ],
    ignore: ['__tests__', 'fixtures'],
  },
  'design-tokens': {
    description: 'Design token source, generator, theme and token tests',
    copies: [
      { app: 'apps/web', dir: 'apps/web/design-tokens', importExtension: '' },
      { app: 'apps/mobile', dir: 'apps/mobile/design-tokens', importExtension: '' },
    ],
    ignore: ['generated'],
  },
};

const RELATIVE_SPECIFIER = /(\bfrom\s+['"])(\.{1,2}\/[^'"]*)(['"])/g;

function listFiles(root, ignore, base = root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(root, entry.name);
      if (ignore.includes(entry.name)) return [];
      return entry.isDirectory() ? listFiles(path, ignore, base) : [relative(base, path)];
    })
    .map((file) => file.split('\\').join('/'))
    .sort();
}

/** Text with everything that may legitimately differ between copies removed. */
function normalize(text) {
  return text
    .replace(RELATIVE_SPECIFIER, (_match, open, specifier, close) => `${open}${specifier.replace(/\.js$/, '')}${close}`)
    .replace(/\s+/g, '') // formatting (line wrapping) may differ once import paths change length
    .replace(/,([}\])])/g, '$1'); // …and so may trailing commas
}

/** Rewrites relative imports for the target app's module system. */
function withImportExtension(text, importExtension) {
  return text.replace(RELATIVE_SPECIFIER, (_match, open, specifier, close) => {
    const bare = specifier.replace(/\.js$/, '');
    return `${open}${bare}${importExtension}${close}`;
  });
}

function check() {
  let problems = 0;
  for (const [name, group] of Object.entries(GROUPS)) {
    const present = group.copies.filter((copy) => existsSync(join(repoRoot, copy.dir)));
    if (present.length < 2) {
      console.log(`- ${name}: only ${present.length} copy exists so far; nothing to compare`);
      continue;
    }
    const [reference, ...others] = present;
    const referenceFiles = listFiles(join(repoRoot, reference.dir), group.ignore);
    for (const other of others) {
      const otherFiles = listFiles(join(repoRoot, other.dir), group.ignore);
      const all = [...new Set([...referenceFiles, ...otherFiles])].sort();
      const differing = all.filter((file) => {
        const a = join(repoRoot, reference.dir, file);
        const b = join(repoRoot, other.dir, file);
        if (!existsSync(a) || !existsSync(b)) return true;
        return normalize(readFileSync(a, 'utf8')) !== normalize(readFileSync(b, 'utf8'));
      });
      if (differing.length === 0) {
        console.log(`✓ ${name}: ${reference.dir} and ${other.dir} match (${all.length} files)`);
      } else {
        problems += differing.length;
        console.error(`✗ ${name}: ${reference.dir} and ${other.dir} differ in:`);
        for (const file of differing) console.error(`    ${file}`);
        console.error(`  Fix: node tools/mirror.mjs sync ${name} <app that has the right version>`);
      }
    }
  }
  if (problems > 0) process.exit(1);
}

function sync(groupName, fromApp) {
  const group = GROUPS[groupName];
  if (!group) throw new Error(`Unknown group "${groupName}". Known: ${Object.keys(GROUPS).join(', ')}`);
  const source = group.copies.find((copy) => copy.app === fromApp);
  if (!source) {
    throw new Error(`"${fromApp}" has no copy of ${groupName}. Known: ${group.copies.map((c) => c.app).join(', ')}`);
  }
  const sourceRoot = join(repoRoot, source.dir);
  const files = listFiles(sourceRoot, group.ignore);
  if (files.length === 0) throw new Error(`${source.dir} is empty or missing`);

  for (const target of group.copies.filter((copy) => copy !== source)) {
    if (!existsSync(join(repoRoot, target.app))) {
      console.log(`- skipped ${target.app} (app does not exist yet)`);
      continue;
    }
    const targetRoot = join(repoRoot, target.dir);
    // Remove files that no longer exist in the source, but keep ignored (generated) output.
    for (const stale of listFiles(targetRoot, group.ignore).filter((file) => !files.includes(file))) {
      rmSync(join(targetRoot, stale));
    }
    for (const file of files) {
      const destination = join(targetRoot, file);
      mkdirSync(dirname(destination), { recursive: true });
      if (/\.(ts|tsx|mts|mjs)$/.test(file)) {
        const text = readFileSync(join(sourceRoot, file), 'utf8');
        writeFileSync(destination, withImportExtension(text, target.importExtension), 'utf8');
      } else {
        cpSync(join(sourceRoot, file), destination);
      }
    }
    console.log(`✓ copied ${files.length} files: ${source.dir} → ${target.dir}`);
    console.log(`  Run that app's formatter afterwards (pnpm format in ${target.app}).`);
  }
}

const [command, ...args] = process.argv.slice(2);
if (command === 'check') check();
else if (command === 'sync' && args.length === 2) sync(args[0], args[1]);
else {
  console.error('Usage: node tools/mirror.mjs check | sync <group> <from-app>');
  process.exit(2);
}
