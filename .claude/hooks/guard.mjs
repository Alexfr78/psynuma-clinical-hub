// PreToolUse (Edit|Write|MultiEdit): bloquea ediciones en archivos que no se tocan a mano.
// Salir con código 2 cancela la edición y le pasa el motivo (stderr) a Claude.
import { readHookInput, relativeFilePath } from "./lib.mjs";

const input = readHookInput();
const rel = relativeFilePath(input);
if (!rel) process.exit(0);

const name = rel.split("/").pop();

const rules = [
  {
    match: () => name === ".env" || name.startsWith(".env."),
    reason: "Los archivos .env contienen claves. Pide al usuario que lo edite él.",
  },
  {
    match: () => rel === "src/integrations/supabase/types.ts",
    reason:
      "types.ts lo regenera Lovable a partir del esquema; un cambio a mano se pierde. " +
      "Aplica la migración y pide a Lovable que regenere los tipos.",
  },
  {
    match: () => rel === "supabase/functions/_shared/availability-core.ts",
    reason:
      "Es una copia AUTO-GENERATED. Edita src/lib/availability-core.ts; " +
      "el hook de PostToolUse sincroniza la copia solo.",
  },
  {
    match: () => ["package-lock.json", "bun.lock", "bun.lockb"].includes(rel),
    reason: "Los lockfiles no se editan a mano; usa npm install / npm uninstall.",
  },
];

const hit = rules.find((r) => r.match());
if (hit) {
  process.stderr.write(`Edición bloqueada en ${rel}: ${hit.reason}\n`);
  process.exit(2);
}
process.exit(0);
