import fs from 'node:fs';
import { execSync } from 'node:child_process';

let tscOut;
try {
  tscOut = execSync('npx tsc -p tsconfig.app.json --noEmit', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).toString();
} catch (e) {
  tscOut = (e.stdout || '').toString();
}

const errRe = /^(.+?)\(\d+,\d+\): error TS2304: Cannot find name '(\w+)'\.$|^(.+?)\(\d+,\d+\): error TS2552: Cannot find name '(\w+)'\./gm;

const byFile = new Map();
let m;
while ((m = errRe.exec(tscOut))) {
  const file = m[1] || m[3];
  const name = m[2] || m[4];
  if (!byFile.has(file)) byFile.set(file, new Set());
  byFile.get(file).add(name);
}

const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"];?/;

for (const [file, names] of byFile) {
  let body = fs.readFileSync(file, 'utf8');
  const existing = body.match(IMPORT_RE);
  if (existing) {
    const current = existing[1].split(',').map((s) => s.trim()).filter(Boolean);
    const merged = Array.from(new Set([...current, ...names]));
    body = body.replace(IMPORT_RE, `import { ${merged.join(', ')} } from 'lucide-react';`);
  } else {
    // Insert a fresh lucide-react import after the last import line
    const lines = body.split('\n');
    let insertAt = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) insertAt = i + 1;
    }
    lines.splice(insertAt, 0, `import { ${Array.from(names).join(', ')} } from 'lucide-react';`);
    body = lines.join('\n');
  }
  fs.writeFileSync(file, body, 'utf8');
  console.log(`Fixed ${file}: ${Array.from(names).join(', ')}`);
}
