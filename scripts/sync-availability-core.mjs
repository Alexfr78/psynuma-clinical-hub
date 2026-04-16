// Sincroniza src/lib/availability-core.ts → supabase/functions/_shared/availability-core.ts
// con cabecera AUTO-GENERATED. Ejecutar antes de `supabase functions deploy`.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "src/lib/availability-core.ts");
const dst = resolve(root, "supabase/functions/_shared/availability-core.ts");

const header =
  "// AUTO-GENERATED — DO NOT EDIT DIRECTLY.\n" +
  "// Copiado desde src/lib/availability-core.ts mediante `npm run sync:availability-core`.\n" +
  "// Fuente de verdad: src/lib/availability-core.ts\n\n";

const body = readFileSync(src, "utf8");
writeFileSync(dst, header + body, "utf8");
console.log(`synced ${src} → ${dst}`);
