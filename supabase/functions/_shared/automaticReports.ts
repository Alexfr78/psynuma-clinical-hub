/**
 * Informes automáticos tras una transcripción: por cada audiencia (clínico y paciente)
 * busca el tipo de documento por defecto del profesional o del centro y llama a
 * analyze-session-transcription como service role. Los informes nacen en borrador y la
 * puerta de consentimiento la aplica analyze-session-transcription, no este módulo.
 *
 * Lo usan process-transcription-job (grabadora de Psycma, audio compartido) y
 * sync-plaud-recordings (grabaciones de Plaud emparejadas). Nunca lanza: los errores se
 * registran y no bloquean al llamador.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { TranscriptionSegment } from "./transcriptionProvider.ts";
import type { DiarizedTurn } from "./transcriptDiarization.ts";

type ServiceClient = SupabaseClient;
type AutomaticReportAudience = "clinical" | "patient";

export interface AutomaticReportTarget {
  centerId: string;
  professionalId: string;
  sessionId: string;
}

export interface AutomaticReportOptions {
  /** Origen que queda guardado en el documento (`ai_generated_documents.transcript_source`). */
  transcriptSource?: "manual" | "plaud";
  plaudRecordingId?: string;
  /** Prefijo de los logs, para saber qué función disparó el informe. */
  logPrefix?: string;
}

export async function generateAutomaticReports(
  supabase: ServiceClient,
  target: AutomaticReportTarget,
  transcription: string,
  segments?: TranscriptionSegment[] | null,
  options: AutomaticReportOptions = {},
): Promise<void> {
  const log = options.logPrefix ?? "[automatic-reports]";
  // Con diarización se manda `segments`: analyze-session-transcription los pasa por
  // buildTranscriptFromTurns, que anonimiza las etiquetas y avisa al modelo de que la
  // atribución puede fallar. Sin ella, se manda el texto plano.
  const diarizedTurns: DiarizedTurn[] | null = segments?.length
    ? segments.filter((segment) => segment.text.trim()).map((segment) => ({
      speaker: segment.speaker ?? null,
      content: segment.text,
      startTime: segment.start,
      endTime: segment.end,
    }))
    : null;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(`${log} No se pudo generar informes automáticos: faltan secretos de Supabase.`);
    return;
  }

  // Las dos audiencias en paralelo: cada informe tarda decenas de segundos y quien llama
  // (un cron) tiene un tiempo de ejecución limitado.
  const audiences: AutomaticReportAudience[] = ["clinical", "patient"];
  await Promise.all(audiences.map(async (audience) => {
    try {
      const audienceValues = audience === "clinical" ? ["clinical", "professional"] : [audience];
      let defaultRow: { document_type_id: string; audience: string } | null = null;

      for (const audienceValue of audienceValues) {
        const { data: professionalDefault, error: professionalDefaultError } = await supabase
          .from("ai_document_defaults")
          .select("document_type_id, audience")
          .eq("center_id", target.centerId)
          .eq("professional_id", target.professionalId)
          .eq("audience", audienceValue)
          .maybeSingle();
        if (professionalDefaultError) throw professionalDefaultError;
        if (professionalDefault) {
          defaultRow = professionalDefault as { document_type_id: string; audience: string };
          break;
        }

        const { data: centerDefault, error: centerDefaultError } = await supabase
          .from("ai_document_defaults")
          .select("document_type_id, audience")
          .eq("center_id", target.centerId)
          .is("professional_id", null)
          .eq("audience", audienceValue)
          .maybeSingle();
        if (centerDefaultError) throw centerDefaultError;
        if (centerDefault) {
          defaultRow = centerDefault as { document_type_id: string; audience: string };
          break;
        }
      }

      if (!defaultRow) {
        console.log(`${log} Se omite informe automático para audience ${audience}: no hay default configurado.`);
        return;
      }

      const { data: documentType, error: documentTypeError } = await supabase
        .from("ai_document_types")
        .select("key")
        .eq("id", defaultRow.document_type_id)
        .maybeSingle();
      if (documentTypeError) throw documentTypeError;
      const documentTypeKey = (documentType as { key?: string } | null)?.key;
      if (!documentTypeKey) {
        console.log(`${log} Se omite informe automático para audience ${audience}: el default no tiene document type válido.`);
        return;
      }

      const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/analyze-session-transcription`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: target.sessionId,
          centerId: target.centerId,
          documentTypeKey,
          ...(diarizedTurns ? { segments: diarizedTurns } : { transcription }),
          transcriptSource: options.transcriptSource ?? "manual",
          ...(options.plaudRecordingId ? { plaudRecordingId: options.plaudRecordingId } : {}),
        }),
      });

      if (!response.ok) {
        const responseText = await response.text();
        console.error(`${log} Error generando informe automático para audience ${audience} (${documentTypeKey}): HTTP ${response.status} ${responseText}`);
        return;
      }

      console.log(`${log} Informe automático generado para audience ${audience}: ${documentTypeKey}.`);
    } catch (error) {
      console.error(`${log} Error no bloqueante generando informe automático para audience ${audience}:`, error);
    }
  }));
}
