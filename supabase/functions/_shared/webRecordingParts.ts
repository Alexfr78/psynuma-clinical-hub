export const WEB_RECORDING_MAX_BYTES = 24 * 1024 * 1024;
export const WEB_RECORDING_MAX_PARTS = 10000;

export function webRecordingPartName(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= WEB_RECORDING_MAX_PARTS) {
    throw new Error("Índice de parte no válido");
  }
  return String(index).padStart(6, "0");
}

export function validateWebRecordingParts(names: string[], count: number): string[] {
  if (!Number.isInteger(count) || count < 1 || count > WEB_RECORDING_MAX_PARTS || names.length !== count) {
    throw new Error("Faltan partes de la grabación o el recuento no coincide");
  }
  const ordered = [...names].sort();
  if (ordered.some((name, index) => name !== webRecordingPartName(index))) {
    throw new Error("Las partes de la grabación no son contiguas desde cero");
  }
  return ordered;
}
