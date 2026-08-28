import fs from 'node:fs';

const files = fs.readFileSync('design-import/broken-files.txt', 'utf8').split('\n').filter(Boolean);

for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const iconLineIdx = lines.findIndex((l) => l.trim() === `import { Icon } from '@/components/ui/icon';`);
  if (iconLineIdx === -1) {
    console.log(`SKIP (no icon import line found): ${file}`);
    continue;
  }
  // Confirm it's misplaced: previous line should be `import {` (open, no closing brace)
  const prevLine = lines[iconLineIdx - 1];
  if (!/^import \{\s*$/.test(prevLine)) {
    console.log(`SKIP (doesn't look misplaced): ${file}`);
    continue;
  }
  // Remove the icon import line from its current spot
  lines.splice(iconLineIdx, 1);
  // Find the end of the multi-line import block that started at iconLineIdx-1
  // (now at the same index since we removed a line before it... recompute)
  const blockStart = iconLineIdx - 1;
  let blockEnd = -1;
  for (let i = blockStart; i < lines.length; i++) {
    if (/from\s+['"][^'"]+['"];?\s*$/.test(lines[i])) {
      blockEnd = i;
      break;
    }
  }
  if (blockEnd === -1) {
    console.log(`FAIL (couldn't find block end): ${file}`);
    continue;
  }
  lines.splice(blockEnd + 1, 0, `import { Icon } from '@/components/ui/icon';`);
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  console.log(`FIXED: ${file}`);
}
