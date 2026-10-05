// PostToolUse (Edit|Write|MultiEdit): sincroniza espejos, lanza ESLint y tests relacionados,
// y recuerda pasos manuales. Los fallos salen con código 2 para que Claude los vea y corrija;
// los recordatorios van como additionalContext.
import { execSync } from "node:child_process";
import { readHookInput, relativeFilePath, projectRoot } from "./lib.mjs";

const input = readHookInput();
const rel = relativeFilePath(input);
if (!rel) process.exit(0);

const root = projectRoot(input);
const errors = [];
const notes = [];

function run(label, command) {
  try {
    execSync(command, { cwd: root, stdio: "pipe", encoding: "utf8", timeout: 100_000 });
    return true;
  } catch (err) {
    const out = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
    errors.push(`${label} falló:\n${out.slice(-4000) || err.message}`);
    return false;
  }
}

// 1. Espejo availability-core: src/lib → supabase/functions/_shared
if (rel === "src/lib/availability-core.ts") {
  if (run("sync:availability-core", "npm run --silent sync:availability-core")) {
    notes.push("Sincronizado supabase/functions/_shared/availability-core.ts; inclúyelo en el commit.");
  }
}

// 2. Espejo de consentimiento (a mano): avisar del otro lado
const consentPairs = [
  [/^src\/lib\/consent-identity\.ts$/, "supabase/functions/_shared/consentIdentity.ts"],
  [/^supabase\/functions\/_shared\/consentIdentity\.ts$/, "src/lib/consent-identity.ts"],
  [/^src\/lib\/consent-[\w-]+\.ts$/, "supabase/functions/_shared/consent.ts"],
  [/^supabase\/functions\/_shared\/consent\.ts$/, "src/lib/consent-*.ts"],
];
const pair = consentPairs.find(([re]) => re.test(rel));
if (pair) {
  notes.push(
    `${rel} tiene espejo en ${pair[1]}. Comprueba si el cambio debe replicarse allí ` +
      "(el frontend y las edge functions deben aplicar las mismas reglas de consentimiento).",
  );
}

// 3. ESLint del archivo editado
if (/^(src|supabase\/functions)\/.*\.tsx?$/.test(rel)) {
  run(`ESLint (${rel})`, `npx eslint --no-warn-ignored "${rel}"`);
}

// 4. Tests relacionados con la lógica de src/lib
if (/^src\/lib\/__tests__\/.*\.test\.ts$/.test(rel)) {
  run(`vitest (${rel})`, `npx vitest run "${rel}"`);
} else if (/^src\/lib\/.*\.ts$/.test(rel)) {
  run(`vitest related (${rel})`, `npx vitest related "${rel}" --run --passWithNoTests`);
}

// 5. Migraciones: Lovable no las aplica
if (/^supabase\/migrations\/.*\.sql$/.test(rel)) {
  notes.push(
    "Migración nueva/editada: Lovable NO la aplica sola. Aplícala con mcp__lovable__query_database " +
      "y agrupa en un único mensaje a Lovable la regeneración de types.ts (y el despliegue de funciones si toca).",
  );
}

if (errors.length) {
  process.stderr.write([...errors, ...notes].join("\n\n") + "\n");
  process.exit(2);
}
if (notes.length) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: notes.join("\n") },
    }),
  );
}
process.exit(0);
