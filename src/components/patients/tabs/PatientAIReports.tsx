import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { useCenter } from '@/hooks/useCenter';
import { Icon } from '@/components/ui/icon';
import { checkPatientConsent, type ConsentCheckResult } from '@/lib/consent-verification';
import { consentSendBlockReason } from '@/lib/consent-block-messages';
import { useAIDocuments } from '@/hooks/useAIDocuments';
import { effectiveMarkdown } from '@/lib/ai-documents';
import { createPatientReportLink, buildPatientReportNotice, PATIENT_REPORT_EMAIL_SUBJECT } from '@/lib/patient-report-links';
import type { AiGeneratedDocumentWithType } from '@/types/ai-documents';

interface PatientAIReportsProps {
  patientId: string;
}

interface SessionMeta {
  id: string;
  session_date: string;
  session_type: string | null;
}

/**
 * Con reprocesado puede haber varias generaciones del mismo `document_type.key` dentro de un
 * mismo grupo (misma sesión, o a nivel de contacto) — cada generación es una fila nueva en
 * `ai_generated_documents`, ninguna se borra (CONTRACT-2 §3.1). `docs` llega ya ordenado desc
 * por `generated_at` (ver las consultas en `useAIDocuments`), así que basta con marcar la
 * primera aparición de cada `key` como la vigente. `showVersionBadge` solo se activa cuando de
 * verdad hay más de una del mismo tipo, para no meter ruido visual en el caso normal.
 */
function withRecencyInfo(docs: AiGeneratedDocumentWithType[]) {
  const countByKey = new Map<string, number>();
  for (const doc of docs) {
    countByKey.set(doc.document_type.key, (countByKey.get(doc.document_type.key) ?? 0) + 1);
  }
  const seenKeys = new Set<string>();
  return docs.map((doc) => {
    const isLatestOfType = !seenKeys.has(doc.document_type.key);
    seenKeys.add(doc.document_type.key);
    return { doc, isLatestOfType, showVersionBadge: (countByKey.get(doc.document_type.key) ?? 0) > 1 };
  });
}

export function PatientAIReports({ patientId }: PatientAIReportsProps) {
  const { centerId } = useCenter();
  const [sendingId, setSendingId] = useState<string | null>(null);

  // Consent is per-patient (not per-session), so a single check up front
  // covers every report listed below. This is client-side UX only — the
  // real, fail-closed enforcement happens server-side in send-notification
  // (see isClinicalReportNotification there), which never trusts the client.
  const { data: consentResults, isLoading: isConsentLoading } = useQuery({
    queryKey: ['patient-consent-status', patientId, 'channel_whatsapp', 'channel_email'],
    queryFn: async () => {
      const [whatsapp, email] = await Promise.all([
        checkPatientConsent(supabase, patientId, 'channel_whatsapp'),
        checkPatientConsent(supabase, patientId, 'channel_email'),
      ]);
      return { channel_whatsapp: whatsapp, channel_email: email } as Record<'channel_whatsapp' | 'channel_email', ConsentCheckResult>;
    },
    enabled: !!patientId,
    staleTime: 30_000,
  });

  const whatsappBlockReason = consentSendBlockReason('whatsapp', consentResults?.channel_whatsapp);
  const emailBlockReason = consentSendBlockReason('email', consentResults?.channel_email);

  const { data: patientContact } = useQuery({
    queryKey: ['patient-ai-reports-contact', patientId],
    queryFn: async () => {
      const { data, error } = await supabase.from('patients').select('phone, email, first_name').eq('id', patientId).maybeSingle();
      if (error) throw error;
      return data as { phone: string | null; email: string | null; first_name: string | null } | null;
    },
    enabled: !!patientId,
  });

  // Fuente de verdad: `ai_generated_documents`, no las columnas espejo de `sessions`. Antes
  // esta pestaña filtraba por `ai_summary_clinical not null`, lo que ocultaba sesiones que
  // solo tuvieran informe de paciente (o cualquier otro tipo de documento) generado. Ahora
  // se listan todos los documentos del paciente, de cualquier tipo, agrupados por sesión.
  const aiDocs = useAIDocuments({ patientId, scope: 'multi_session' });
  const evolutionTemplate = aiDocs.templates.find((t) => t.key === 'evolution_report');

  const sessionIds = useMemo(
    () => Array.from(new Set(aiDocs.documents.filter((d) => d.session_id).map((d) => d.session_id as string))),
    [aiDocs.documents],
  );

  const { data: sessionsMeta } = useQuery({
    queryKey: ['patient-ai-reports-sessions', patientId, sessionIds],
    queryFn: async () => {
      if (sessionIds.length === 0) return [] as SessionMeta[];
      const { data, error } = await supabase
        .from('sessions')
        .select('id, session_date, session_type')
        .in('id', sessionIds);
      if (error) throw error;
      return (data ?? []) as SessionMeta[];
    },
    enabled: sessionIds.length > 0,
  });

  const sessionMetaById = useMemo(() => {
    const map = new Map<string, SessionMeta>();
    for (const s of sessionsMeta ?? []) map.set(s.id, s);
    return map;
  }, [sessionsMeta]);

  const { sessionGroups, patientLevelDocs } = useMemo(() => {
    const bySession = new Map<string, AiGeneratedDocumentWithType[]>();
    const patientLevel: AiGeneratedDocumentWithType[] = [];

    for (const doc of aiDocs.documents) {
      // `base_extraction` (audience 'internal') es solo un paso intermedio para el
      // servidor — nunca se pensó para que lo viera el profesional directamente, igual que
      // en `TranscriptionAnalysisDialog.tsx`.
      if (doc.document_type.audience === 'internal') continue;

      if (!doc.session_id) {
        patientLevel.push(doc);
        continue;
      }
      const list = bySession.get(doc.session_id) ?? [];
      list.push(doc);
      bySession.set(doc.session_id, list);
    }

    const groups = Array.from(bySession.entries())
      .map(([sessionId, docs]) => ({ sessionId, docs, meta: sessionMetaById.get(sessionId) ?? null }))
      .sort((a, b) => {
        const dateA = a.meta?.session_date ?? '';
        const dateB = b.meta?.session_date ?? '';
        return dateB.localeCompare(dateA);
      });

    return { sessionGroups: groups, patientLevelDocs: patientLevel };
  }, [aiDocs.documents, sessionMetaById]);

  const handleSend = async (doc: AiGeneratedDocumentWithType, channel: 'whatsapp' | 'email') => {
    if (!centerId) return;
    const recipient = channel === 'whatsapp' ? patientContact?.phone : patientContact?.email;
    if (!recipient) return;

    // Client-side defense in depth — send-notification enforces this for
    // real and fails closed regardless of what happens here.
    const blockReason = channel === 'whatsapp' ? whatsappBlockReason : emailBlockReason;
    if (blockReason) {
      toast.error(blockReason);
      return;
    }

    setSendingId(doc.id);
    try {
      // El informe ya no viaja en el mensaje: se guarda como foto en
      // patient_report_links y solo se manda un aviso con el enlace. Ver
      // src/lib/patient-report-links.ts para la justificación completa.
      const { url } = await createPatientReportLink(supabase, {
        centerId,
        patientId,
        sessionId: doc.session_id,
        aiGeneratedDocumentId: doc.id,
        title: doc.document_type.label,
        contentMarkdown: effectiveMarkdown(doc),
      });
      const noticeMessage = buildPatientReportNotice(url, patientContact?.first_name);

      const { data: notification } = await supabase
        .from('notifications')
        .insert({
          center_id: centerId,
          session_id: doc.session_id,
          patient_id: patientId,
          type: channel,
          recipient,
          // Asunto neutro: debe poder leerse en una notificación de pantalla
          // de bloqueo sin revelar que es terapia, el motivo o un diagnóstico.
          subject: PATIENT_REPORT_EMAIL_SUBJECT,
          // Explicit purpose marker on every channel — this is the primary
          // signal send-notification's consent gate relies on to recognize
          // a clinical AI report delivery. Set here regardless of channel so
          // sending via WhatsApp cannot bypass the gate the way it used to
          // when only the email path set `subject`.
          purpose: 'clinical_report',
          message: noticeMessage,
          status: 'pending',
        })
        .select('id')
        .single();

      if (notification) {
        const { data: sendResult, error: sendError } = await supabase.functions.invoke('send-notification', {
          body: { notificationId: notification.id },
        });

        const resultItem = sendResult?.results?.[0];
        if (sendError || sendResult?.ok === false || resultItem?.ok === false) {
          toast.error(resultItem?.error || 'No se pudo enviar el informe. Revisa el consentimiento del contacto.');
          return;
        }

        toast.success(`Informe enviado por ${channel === 'whatsapp' ? 'WhatsApp' : 'email'}`);
      }
    } catch {
      toast.error('Error al enviar el informe');
    } finally {
      setSendingId(null);
    }
  };

  const handleGenerateEvolution = async () => {
    try {
      await aiDocs.generate('evolution_report');
      toast.success('Informe de evolución generado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al generar el informe de evolución');
    }
  };

  if (aiDocs.isLoadingDocuments) {
    return (
      <div className="flex items-center justify-center py-12">
        <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasAnyDocs = sessionGroups.length > 0 || patientLevelDocs.length > 0;

  return (
    <div className="space-y-4">
      {evolutionTemplate && (
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3">
          <div>
            <p className="text-sm font-medium">Informe de evolución</p>
            <p className="text-xs text-muted-foreground">
              Genera un informe a partir de los documentos ya generados de este contacto.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerateEvolution}
            disabled={aiDocs.isGenerating || sessionGroups.length === 0}
          >
            {aiDocs.isGenerating ? (
              <Icon name="progress_activity" className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Icon name="auto_awesome" className="h-3 w-3 mr-1" />
            )}
            Generar
          </Button>
        </div>
      )}

      {!hasAnyDocs ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <Icon name="psychology" className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 font-display text-lg font-semibold">Sin informes IA</h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Los informes se generan desde el detalle de cada sesión → "Analizar transcripción".
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {patientLevelDocs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Documentos del contacto
              </p>
              {withRecencyInfo(patientLevelDocs).map(({ doc, isLatestOfType, showVersionBadge }) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  isLatestOfType={isLatestOfType}
                  showVersionBadge={showVersionBadge}
                  onSend={handleSend}
                  sending={sendingId === doc.id}
                  isConsentLoading={isConsentLoading}
                  whatsappBlockReason={whatsappBlockReason}
                  emailBlockReason={emailBlockReason}
                  hasPhone={!!patientContact?.phone}
                  hasEmail={!!patientContact?.email}
                />
              ))}
            </div>
          )}

          {sessionGroups.map(({ sessionId, docs, meta }) => (
            <Collapsible key={sessionId}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <Icon name="psychology" className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">
                        {meta ? format(new Date(meta.session_date), "d 'de' MMMM 'de' yyyy", { locale: es }) : 'Sesión'}
                      </p>
                      {meta?.session_type && (
                        <p className="text-xs text-muted-foreground capitalize">{meta.session_type}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {docs.map((doc) => (
                      <Badge key={doc.id} variant="outline" className="text-xs">
                        {doc.document_type.label}
                      </Badge>
                    ))}
                    <Icon name="expand_more" className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 pb-3 space-y-3">
                {withRecencyInfo(docs).map(({ doc, isLatestOfType, showVersionBadge }) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    isLatestOfType={isLatestOfType}
                    showVersionBadge={showVersionBadge}
                    onSend={handleSend}
                    sending={sendingId === doc.id}
                    isConsentLoading={isConsentLoading}
                    whatsappBlockReason={whatsappBlockReason}
                    emailBlockReason={emailBlockReason}
                    hasPhone={!!patientContact?.phone}
                    hasEmail={!!patientContact?.email}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentCard({
  doc,
  isLatestOfType,
  showVersionBadge,
  onSend,
  sending,
  isConsentLoading,
  whatsappBlockReason,
  emailBlockReason,
  hasPhone,
  hasEmail,
}: {
  doc: AiGeneratedDocumentWithType;
  /** Si es la generación más reciente de este `document_type.key` dentro del grupo. */
  isLatestOfType: boolean;
  /** Solo `true` cuando de verdad hay más de una generación del mismo tipo en el grupo —
   *  evita mostrar "Más reciente" cuando no hace falta distinguir nada. */
  showVersionBadge: boolean;
  onSend: (doc: AiGeneratedDocumentWithType, channel: 'whatsapp' | 'email') => void;
  sending: boolean;
  isConsentLoading: boolean;
  whatsappBlockReason: string | null;
  emailBlockReason: string | null;
  hasPhone: boolean;
  hasEmail: boolean;
}) {
  // El envío al paciente se limita al documento que espeja `ai_summary_patient` — el resto
  // (informe clínico, notas SOAP, evolución...) no está pensado para mandarse tal cual.
  const canSend = doc.document_type.mirror_column === 'ai_summary_patient';

  return (
    <div className="space-y-1 mt-1">
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Icon name={doc.document_type.audience === 'patient' ? 'person' : 'description'} className="h-3 w-3" />
        {doc.document_type.label}
        <span className="font-normal">
          · {format(new Date(doc.generated_at), "d MMM yyyy, HH:mm", { locale: es })}
        </span>
        {showVersionBadge && (
          isLatestOfType ? (
            <Badge variant="outline" className="text-[10px]">Más reciente</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">Versión anterior</Badge>
          )
        )}
      </p>
      <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
        {effectiveMarkdown(doc) || 'Sin contenido.'}
      </div>
      {canSend && (
        <>
          <div className="flex flex-wrap gap-2">
            {hasPhone && (
              <Button
                size="sm"
                variant="outline"
                disabled={sending || isConsentLoading || !!whatsappBlockReason}
                title={whatsappBlockReason || undefined}
                onClick={() => onSend(doc, 'whatsapp')}
              >
                {sending ? <Icon name="progress_activity" className="h-3 w-3 mr-1 animate-spin" /> : <Icon name="call" className="h-3 w-3 mr-1" />}
                WhatsApp
              </Button>
            )}
            {hasEmail && (
              <Button
                size="sm"
                variant="outline"
                disabled={sending || isConsentLoading || !!emailBlockReason}
                title={emailBlockReason || undefined}
                onClick={() => onSend(doc, 'email')}
              >
                {sending ? <Icon name="progress_activity" className="h-3 w-3 mr-1 animate-spin" /> : <Icon name="mail" className="h-3 w-3 mr-1" />}
                Email
              </Button>
            )}
          </div>
          {(whatsappBlockReason || emailBlockReason) && (
            <div className="space-y-1">
              {whatsappBlockReason && (
                <p className="text-xs text-muted-foreground">
                  <Icon name="lock" className="h-3 w-3 mr-1 inline align-text-bottom" />
                  {whatsappBlockReason}
                </p>
              )}
              {emailBlockReason && (
                <p className="text-xs text-muted-foreground">
                  <Icon name="lock" className="h-3 w-3 mr-1 inline align-text-bottom" />
                  {emailBlockReason}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
