import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const DRY_RUN = process.argv.includes('--dry');

const mapSrc = fs.readFileSync('src/lib/icon-map.ts', 'utf8');
const mapBody = mapSrc.slice(mapSrc.indexOf('{'), mapSrc.lastIndexOf('}') + 1);
const ICON_MAP = new Function(`return ${mapBody}`)();

const files = execSync('git ls-files "src/**/*.tsx" "src/**/*.ts"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

let filesTouched = 0;
let usagesReplaced = 0;
const unmappedCounts = {};

const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"];?/;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(IMPORT_RE);
  if (!m) continue;

  const specifiers = m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const asMatch = s.match(/^(\S+)\s+as\s+(\S+)$/);
      if (asMatch) return { imported: asMatch[1], local: asMatch[2] };
      return { imported: s, local: s };
    });

  let body = src;
  const keptSpecifiers = [];
  let fileChanged = false;
  let usesIconComponent = false;

  for (const spec of specifiers) {
    const materialName = ICON_MAP[spec.imported];
    if (!materialName) {
      keptSpecifiers.push(spec);
      unmappedCounts[spec.imported] = (unmappedCounts[spec.imported] || 0) + 1;
      continue;
    }

    // Only rewrite JSX usages: `<Local ...` or `<Local>` or `</Local>`.
    const openRe = new RegExp(`<${spec.local}\\b`, 'g');
    const closeRe = new RegExp(`</${spec.local}>`, 'g');
    const openMatches = body.match(openRe);
    if (!openMatches) {
      // Imported but never used as JSX (e.g. only referenced as a bare
      // component value like `icon: LayoutDashboard`) - leave it alone.
      keptSpecifiers.push(spec);
      continue;
    }

    body = body.replace(openRe, `<Icon name="${materialName}"`);
    body = body.replace(closeRe, '</Icon>');
    usagesReplaced += openMatches.length;
    fileChanged = true;
    usesIconComponent = true;
  }

  if (!fileChanged) continue;

  // Rebuild the lucide-react import (or drop it if nothing is left).
  if (keptSpecifiers.length > 0) {
    const newImport = `import { ${keptSpecifiers.map((s) => (s.imported === s.local ? s.local : `${s.imported} as ${s.local}`)).join(', ')} } from 'lucide-react';`;
    body = body.replace(IMPORT_RE, newImport);
  } else {
    body = body.replace(IMPORT_RE + '\\n?', '').replace(IMPORT_RE, '');
  }

  // Add the Icon import if not already present.
  if (usesIconComponent && !/from ['"]@\/components\/ui\/icon['"]/.test(body)) {
    const lines = body.split('\n');
    let insertAt = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) insertAt = i + 1;
    }
    lines.splice(insertAt, 0, `import { Icon } from '@/components/ui/icon';`);
    body = lines.join('\n');
  }

  filesTouched++;
  if (!DRY_RUN) {
    fs.writeFileSync(file, body, 'utf8');
  }
}

console.log(`Files touched: ${filesTouched}`);
console.log(`JSX usages replaced: ${usagesReplaced}`);
console.log(`Unmapped icon names left as lucide-react (bare-value or unmapped usages):`);
console.log(
  Object.entries(unmappedCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  ${k}: ${v} file(s)`)
    .join('\n')
);
