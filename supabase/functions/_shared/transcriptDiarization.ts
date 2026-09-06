// Construcción de una transcripción en texto plano a partir de turnos ya
// diarizados (p. ej. los que produce Plaud), para que analyze-session-
// transcription pueda tratarlos con el mismo pipeline de prompts que una
// transcripción manual sin hablantes.
//
// Dos decisiones deliberadas, explicadas porque alguien tendrá que
// defenderlas:
//
// 1) NUNCA se reenvía la etiqueta de hablante original al modelo. Plaud
//    entrega los turnos como "Speaker 1" / "Speaker 2" casi siempre, pero en
//    grabaciones reales se ha visto que a veces mete el nombre real del
//    terapeuta en su lugar. En vez de intentar detectar "esto parece un
//    nombre propio" (heurística frágil y con falsos negativos), simplemente
//    no existe ningún camino por el que la etiqueta cruda llegue al prompt:
//    cada etiqueta distinta que aparece en el archivo se sustituye por un
//    identificador genérico y secuencial ("Hablante 1", "Hablante 2", ...)
//    asignado por orden de primera aparición. Da igual lo que dijera la
//    etiqueta original — nunca se usa su texto.
//
// 2) NO se intenta inferir aquí qué "Hablante N" es el paciente y cuál el
//    terapeuta. La diarización de Plaud es inconsistente (verificado sobre
//    grabaciones reales: tres comportamientos distintos en tres archivos, y
//    en uno faltaba por completo), así que mapear "Hablante 1 => TERAPEUTA"
//    de forma fija sería asumir una regla que ya sabemos que no se cumple
//    siempre. Atribuir mal un turno es peor que no atribuirlo: quien hace esa
//    inferencia — con prudencia, a partir del contenido de cada turno, nunca
//    de la etiqueta — es el modelo, que ya tiene la instrucción de sustituir
//    nombres por PACIENTE/TERAPEUTA en SYSTEM_PROMPT. Lo único que añadimos
//    aquí es la pista de turno-a-turno (quién habla en cada línea) más una
//    nota explícita de que esa pista puede ser incompleta o estar mal
//    etiquetada, para que el modelo no la trate como un hecho fiable.

export interface DiarizedTurn {
  // Etiqueta cruda tal y como la entrega el proveedor de diarización
  // (Plaud u otro). Puede ser "Speaker 1", un nombre real, null o "".
  // Nunca se propaga tal cual — ver buildTranscriptFromTurns.
  speaker?: string | null;
  content: string;
  // Campos opcionales de temporización, aceptados para poder pasar
  // directamente objetos con la forma de TranscriptSegment
  // (src/lib/plaud-segmentation.ts) sin transformarlos antes. No se usan en
  // la reconstrucción del texto.
  startTime?: number;
  endTime?: number;
}

export interface DiarizationBuildResult {
  transcript: string;
  // Número de hablantes distintos detectados (0 si ningún turno traía
  // etiqueta de hablante).
  distinctSpeakers: number;
  hasDiarization: boolean;
}

const UNLABELED_SPEAKER = "Hablante (sin identificar)";

const DIARIZATION_CAVEAT_NOTE = `[NOTA SOBRE ETIQUETAS DE HABLANTE — LEE ESTO ANTES DE INTERPRETAR LA TRANSCRIPCIÓN]
Esta transcripción incluye etiquetas de hablante ("Hablante 1", "Hablante 2", ...) generadas automáticamente por un sistema de diarización externo. Ya han sido anonimizadas antes de llegar a ti: si el sistema de origen usaba un nombre real o un identificador propio, aquí solo ves una etiqueta genérica sin ningún valor identificativo.
Ten en cuenta que esta diarización es poco fiable:
- Puede fallar o faltar por completo en tramos del archivo.
- Puede asignar un turno suelto al hablante equivocado en mitad de un bloque dominado por otro.
- No hay ninguna garantía de que "Hablante 1" sea siempre la misma persona a lo largo de todo el documento, ni de que corresponda de forma fija a un rol (paciente o terapeuta).
Por tanto:
- Usa el CONTENIDO de cada turno — nunca la etiqueta por sí sola — como base principal para decidir si corresponde al PACIENTE o al TERAPEUTA, exactamente igual que harías ante una transcripción sin diarizar.
- La etiqueta puede servirte como pista débil de continuidad dentro de un mismo bloque temático corto, pero nunca como prueba de identidad o de rol.
- Si la atribución de un turno concreto no resulta razonablemente clara a partir de lo que dice, es preferible no forzarla — deja constancia de la ambigüedad en vez de asignarlo con rotundidad a PACIENTE o a TERAPEUTA.
[FIN DE LA NOTA]

`;

/**
 * Reconstruye una transcripción en texto plano a partir de turnos diarizados,
 * anonimizando toda etiqueta de hablante y anteponiendo, cuando hay
 * diarización real, la nota de cautela que el modelo debe leer antes de
 * intentar atribuir turnos a PACIENTE/TERAPEUTA.
 */
export function buildTranscriptFromTurns(turns: DiarizedTurn[]): DiarizationBuildResult {
  const speakerLabels = new Map<string, string>(); // etiqueta cruda -> "Hablante N"
  let nextSpeakerNumber = 1;
  let anyLabeled = false;

  const lines: string[] = [];

  for (const turn of turns) {
    if (!turn || typeof turn.content !== "string") continue;
    const content = turn.content.trim();
    if (!content) continue;

    const rawSpeaker = typeof turn.speaker === "string" ? turn.speaker.trim() : "";

    let label: string;
    if (!rawSpeaker) {
      label = UNLABELED_SPEAKER;
    } else {
      anyLabeled = true;
      let mapped = speakerLabels.get(rawSpeaker);
      if (!mapped) {
        mapped = `Hablante ${nextSpeakerNumber}`;
        nextSpeakerNumber += 1;
        speakerLabels.set(rawSpeaker, mapped);
      }
      label = mapped;
    }

    lines.push(`${label}: ${content}`);
  }

  const hasDiarization = anyLabeled && speakerLabels.size > 0;
  const body = lines.join("\n");
  const transcript = hasDiarization ? `${DIARIZATION_CAVEAT_NOTE}${body}` : body;

  return {
    transcript,
    distinctSpeakers: speakerLabels.size,
    hasDiarization,
  };
}
