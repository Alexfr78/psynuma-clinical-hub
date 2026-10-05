// Utilidades compartidas por los hooks de Claude Code de este repo.
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

export function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

export function projectRoot(input) {
  return resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
}

// Ruta del archivo tocado, relativa a la raíz y con barras "/".
// Devuelve null si no hay ruta o si cae fuera del proyecto.
export function relativeFilePath(input) {
  const filePath = input?.tool_input?.file_path;
  if (!filePath) return null;
  const root = projectRoot(input);
  const rel = relative(root, resolve(root, filePath)).replace(/\\/g, "/");
  if (rel.startsWith("../") || rel === "..") return null;
  return rel;
}
