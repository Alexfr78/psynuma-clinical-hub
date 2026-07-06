import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Database } from '@/integrations/supabase/types';
import {
  CancellationPolicyRules,
  cancellationPolicyLinesToList,
  cancellationPolicyReasonsToLines,
  normalizeCancellationPolicyRules,
  useActiveCancellationPolicy,
} from '@/hooks/useCancellationPolicy';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

type RefundOption = 'refund' | 'voucher';

const DEFAULT_RULES: CancellationPolicyRules = {
  cancellation_window_hours: 24,
  late_cancel_penalty_percentage: 50,
  no_show_percentage: 100,
  unjustified_free_cancellations: 1,
  allow_justified_cancellations: true,
  refund_mode: 'review',
  refund_options: ['refund', 'voucher'],
};

function buildPolicyText({
  name,
  rules,
  validReasons,
  penaltyConcept,
  voucherValidityDays,
  professionalName,
}: {
  name: string;
  rules: CancellationPolicyRules;
  validReasons: string;
  penaltyConcept: string;
  voucherValidityDays: number;
  professionalName: string;
}) {
  const reasons = cancellationPolicyLinesToList(validReasons);
  const formattedReasons = reasons.length > 0
    ? reasons.map((reason) => `* ${reason}`).join('\n')
    : '* Causa justificada aceptada por el profesional.';

  return `# ${name}

Yo, [nombre y apellidos], declaro haber sido informado/a de la política de cancelación, modificación e inasistencia a citas del centro profesional de ${professionalName}.

## 1. Cancelación o modificación de la cita

La cita podrá cancelarse o modificarse sin penalización siempre que se comunique con al menos ${rules.cancellation_window_hours} horas de antelación respecto a la hora prevista para la sesión.

Se entiende por modificación cualquier cambio de día, hora, formato de la sesión o cualquier otra variación que afecte a la cita previamente acordada.

## 2. Cancelación o modificación fuera de plazo

Cuando la cancelación o modificación se comunique con menos de ${rules.cancellation_window_hours} horas de antelación, podrá aplicarse un cargo equivalente al ${rules.late_cancel_penalty_percentage}% del importe de la sesión.

El concepto de dicho cargo será:

"${penaltyConcept}".

## 3. Inasistencia sin aviso o aviso insuficiente

En caso de inasistencia a la sesión sin aviso previo, podrá aplicarse un cargo equivalente al ${rules.no_show_percentage}% del importe de la sesión.

También podrá considerarse inasistencia, a efectos de esta política, la cancelación comunicada con una antelación insuficiente para reorganizar la agenda profesional, especialmente cuando el aviso se produzca en los minutos inmediatamente anteriores al inicio de la sesión o una vez alcanzada la hora prevista.

Se considerará inasistencia sin aviso o aviso insuficiente cuando la persona:

* No acuda a la cita presencial.
* No se conecte a la sesión online.
* Avise en un momento tan próximo al inicio de la sesión que impida ofrecer ese espacio a otra persona.
* Comunique la cancelación una vez iniciada la franja horaria reservada para la sesión.

En estos casos, podrá aplicarse un cargo equivalente al ${rules.no_show_percentage}% del importe de la sesión, salvo que exista una causa justificada aceptada por el profesional.

## 4. Cancelaciones sin justificar

Se permitirá ${rules.unjustified_free_cancellations} cancelación sin justificar sin aplicación de penalización, siempre que el profesional considere que no existe un uso reiterado o abusivo de esta excepción.

A partir de dicha cancelación, podrán aplicarse las condiciones generales recogidas en esta política.

## 5. Cancelaciones justificadas

Las cancelaciones justificadas podrán ser revisadas por el profesional antes de aplicar cualquier cargo.

Podrán considerarse motivos válidos, entre otros:

${formattedReasons}

La aceptación final de la justificación quedará sujeta a la valoración del profesional, atendiendo a las circunstancias concretas de cada caso.

## 6. Sesiones abonadas previamente

Si la sesión hubiera sido abonada con anterioridad y procediera algún tipo de compensación, el centro podrá ofrecer, según corresponda:

* Devolución del importe.
* Reprogramación de la cita.
* Vale para una sesión futura.

Los vales generados tendrán una caducidad de ${voucherValidityDays} días desde la fecha de emisión.

## 7. Aplicación de la política

La aplicación final de esta política quedará sujeta a la revisión del profesional cuando corresponda, especialmente en situaciones justificadas, imprevistos relevantes o circunstancias excepcionales.

El objetivo de esta política es garantizar una adecuada organización de la agenda profesional, respetar el tiempo reservado para cada paciente y facilitar un uso responsable de las citas disponibles.

Profesional: ${professionalName}

Fecha: ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}

Firma del/de la paciente:

Firma del profesional:`;
}

export function CancellationPolicySettingsSection() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const centerId = profile?.center_id;
  const professionalName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'el profesional';

  const [name, setName] = useState('Política de cancelación');
  const [rules, setRules] = useState<CancellationPolicyRules>(DEFAULT_RULES);
  const [validReasons, setValidReasons] = useState('Enfermedad o urgencia médica\nFuerza mayor familiar\nCausa justificada aceptada por el profesional');
  const [penaltyConcept, setPenaltyConcept] = useState('Cancelación fuera de plazo según política aceptada');
  const [rectificationReason, setRectificationReason] = useState('Devolución por cancelación de cita');
  const [voucherValidityDays, setVoucherValidityDays] = useState(365);
  const [policyText, setPolicyText] = useState(() => buildPolicyText({
    name: 'Política de cancelación, modificación e inasistencia a citas',
    rules: DEFAULT_RULES,
    validReasons: 'Enfermedad o urgencia médica\nFuerza mayor familiar\nCausa justificada aceptada por el profesional',
    penaltyConcept: 'Cancelación o modificación fuera de plazo según política aceptada',
    voucherValidityDays: 365,
    professionalName,
  }));

  const { data: activePolicy, isLoading } = useActiveCancellationPolicy();

  useEffect(() => {
    if (!activePolicy) return;
    setName(activePolicy.name || 'Política de cancelación');
    setRules(normalizeCancellationPolicyRules(activePolicy.rules));
    setValidReasons(cancellationPolicyReasonsToLines(activePolicy.valid_reasons));
    setPenaltyConcept(activePolicy.penalty_invoice_concept || 'Cancelación fuera de plazo según política aceptada');
    setRectificationReason(activePolicy.rectification_reason || 'Devolución por cancelación de cita');
    setVoucherValidityDays(activePolicy.voucher_validity_days || 365);
    setPolicyText(activePolicy.policy_text || buildPolicyText({
      name: activePolicy.name || 'Política de cancelación, modificación e inasistencia a citas',
      rules: normalizeCancellationPolicyRules(activePolicy.rules),
      validReasons: cancellationPolicyReasonsToLines(activePolicy.valid_reasons),
      penaltyConcept: activePolicy.penalty_invoice_concept || 'Cancelación o modificación fuera de plazo según política aceptada',
      voucherValidityDays: activePolicy.voucher_validity_days || 365,
      professionalName,
    }));
  }, [activePolicy, professionalName]);

  const previewText = useMemo(() => {
    const reasons = cancellationPolicyLinesToList(validReasons);
    const refundText = rules.refund_options.includes('refund') && rules.refund_options.includes('voucher')
      ? 'devolución o vale'
      : rules.refund_options.includes('refund')
        ? 'devolución'
        : 'vale';

    return [
      `${name}`,
      '',
      `La cita puede cancelarse sin penalización hasta ${rules.cancellation_window_hours} horas antes de la sesión.`,
      `Si la cancelación se realiza fuera de plazo, podrá aplicarse un cargo del ${rules.late_cancel_penalty_percentage}% del importe de la sesión.`,
      `La inasistencia sin aviso podrá aplicar un cargo del ${rules.no_show_percentage}% del importe de la sesión.`,
      rules.unjustified_free_cancellations > 0
        ? `Se permite ${rules.unjustified_free_cancellations} cancelación sin justificar según el criterio del centro.`
        : 'No se contempla una cancelación sin justificar gratuita salvo decisión expresa del profesional.',
      rules.allow_justified_cancellations
        ? 'Las cancelaciones justificadas podrán revisarse y aceptarse sin penalización.'
        : 'No se contemplan excepciones justificadas de forma automática.',
      reasons.length > 0 ? `Motivos que pueden considerarse válidos: ${reasons.join(', ')}.` : '',
      `Si la sesión ya estaba pagada y procede compensación, el centro podrá ofrecer ${refundText}.`,
      `Los vales generados tendrán una caducidad de ${voucherValidityDays} días.`,
    ].filter(Boolean).join('\n');
  }, [name, rules, validReasons, voucherValidityDays]);

  const savePolicy = useMutation({
    mutationFn: async () => {
      if (!centerId) throw new Error('No hay centro configurado');

      const { data: latest } = await supabase
        .from('cancellation_policy_versions')
        .select('version_number')
        .eq('center_id', centerId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      await supabase
        .from('cancellation_policy_versions')
        .update({ is_active: false })
        .eq('center_id', centerId)
        .eq('is_active', true);

      const nextVersion = Number(latest?.version_number || 0) + 1;
      const { error } = await supabase
        .from('cancellation_policy_versions')
        .insert({
          center_id: centerId,
          name,
          version_number: nextVersion,
          is_active: true,
          rules,
          policy_text: policyText,
          valid_reasons: cancellationPolicyLinesToList(validReasons),
          penalty_invoice_concept: penaltyConcept,
          rectification_reason: rectificationReason,
          voucher_validity_days: voucherValidityDays,
          created_by: profile?.id || null,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-cancellation-policy', centerId] });
      toast.success('Política de cancelación guardada');
    },
    onError: (error) => {
      toast.error('No se pudo guardar la política', {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const toggleRefundOption = (option: RefundOption, checked: boolean) => {
    setRules((current) => {
      const next = checked
        ? Array.from(new Set([...current.refund_options, option]))
        : current.refund_options.filter((item) => item !== option);
      return { ...current, refund_options: next.length > 0 ? next : [option] };
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Política de cancelación
              </CardTitle>
              <CardDescription>
                Define la política activa que se enviará para firma y se aplicará a futuras cancelaciones.
              </CardDescription>
            </div>
            <Badge variant="outline">
              {activePolicy ? `Versión activa ${activePolicy.version_number}` : 'Sin versión activa'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando política...
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="policy-name">Nombre</Label>
                  <Input id="policy-name" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voucher-validity">Caducidad del vale</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="voucher-validity"
                      type="number"
                      min={1}
                      max={3650}
                      value={voucherValidityDays}
                      onChange={(event) => setVoucherValidityDays(Number(event.target.value) || 365)}
                      className="w-28"
                    />
                    <span className="text-sm text-muted-foreground">días</span>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="window-hours">Plazo sin penalización</Label>
                  <Input
                    id="window-hours"
                    type="number"
                    min={0}
                    max={720}
                    value={rules.cancellation_window_hours}
                    onChange={(event) => setRules({ ...rules, cancellation_window_hours: Number(event.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="late-percent">Fuera de plazo</Label>
                  <Input
                    id="late-percent"
                    type="number"
                    min={0}
                    max={100}
                    value={rules.late_cancel_penalty_percentage}
                    onChange={(event) => setRules({ ...rules, late_cancel_penalty_percentage: Number(event.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="noshow-percent">No asistencia</Label>
                  <Input
                    id="noshow-percent"
                    type="number"
                    min={0}
                    max={100}
                    value={rules.no_show_percentage}
                    onChange={(event) => setRules({ ...rules, no_show_percentage: Number(event.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="free-cancellations">Cancelaciones sin justificar</Label>
                  <Input
                    id="free-cancellations"
                    type="number"
                    min={0}
                    max={20}
                    value={rules.unjustified_free_cancellations}
                    onChange={(event) => setRules({ ...rules, unjustified_free_cancellations: Number(event.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label>Permitir cancelaciones justificadas</Label>
                    <p className="text-xs text-muted-foreground">El profesional podrá aceptarlas o rechazarlas.</p>
                  </div>
                  <Switch
                    checked={rules.allow_justified_cancellations}
                    onCheckedChange={(checked) => setRules({ ...rules, allow_justified_cancellations: checked })}
                  />
                </div>
                <div className="rounded-lg border p-4 space-y-3">
                  <Label>Compensación si ya estaba pagada</Label>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={rules.refund_options.includes('refund')}
                        onChange={(event) => toggleRefundOption('refund', event.target.checked)}
                      />
                      Devolución
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={rules.refund_options.includes('voucher')}
                        onChange={(event) => toggleRefundOption('voucher', event.target.checked)}
                      />
                      Vale
                    </label>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">Modo automático</span>
                    <Switch
                      checked={rules.refund_mode === 'automatic'}
                      onCheckedChange={(checked) => setRules({ ...rules, refund_mode: checked ? 'automatic' : 'review' })}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="valid-reasons">Motivos válidos</Label>
                  <Textarea
                    id="valid-reasons"
                    value={validReasons}
                    onChange={(event) => setValidReasons(event.target.value)}
                    rows={6}
                    placeholder="Un motivo por línea"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="policy-text">Texto de la política firmable</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPolicyText(buildPolicyText({
                        name,
                        rules,
                        validReasons,
                        penaltyConcept,
                        voucherValidityDays,
                        professionalName,
                      }))}
                    >
                      Regenerar
                    </Button>
                  </div>
                  <Textarea
                    id="policy-text"
                    value={policyText}
                    onChange={(event) => setPolicyText(event.target.value)}
                    rows={18}
                    placeholder="Texto que se enviará al paciente para firma"
                  />
                  <p className="text-xs text-muted-foreground">
                    Este texto queda guardado en la nueva versión y será el contenido firmado por el paciente.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="penalty-concept">Concepto de cargo</Label>
                  <Input
                    id="penalty-concept"
                    value={penaltyConcept}
                    onChange={(event) => setPenaltyConcept(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rectification-reason">Motivo de rectificativa</Label>
                  <Input
                    id="rectification-reason"
                    value={rectificationReason}
                    onChange={(event) => setRectificationReason(event.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => savePolicy.mutate()} disabled={savePolicy.isPending || !name.trim()}>
                  {savePolicy.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Guardar nueva versión
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
