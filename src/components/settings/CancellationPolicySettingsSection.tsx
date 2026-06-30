import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

type RefundMode = 'automatic' | 'review';
type RefundOption = 'refund' | 'voucher';

interface CancellationPolicyRules {
  cancellation_window_hours: number;
  late_cancel_penalty_percentage: number;
  no_show_percentage: number;
  unjustified_free_cancellations: number;
  allow_justified_cancellations: boolean;
  refund_mode: RefundMode;
  refund_options: RefundOption[];
}

interface CancellationPolicyVersion {
  id: string;
  center_id: string;
  name: string;
  version_number: number;
  is_active: boolean;
  rules: CancellationPolicyRules | Record<string, unknown>;
  valid_reasons: string[] | unknown;
  penalty_invoice_concept: string;
  rectification_reason: string;
  voucher_validity_days: number;
}

const DEFAULT_RULES: CancellationPolicyRules = {
  cancellation_window_hours: 24,
  late_cancel_penalty_percentage: 100,
  no_show_percentage: 100,
  unjustified_free_cancellations: 0,
  allow_justified_cancellations: true,
  refund_mode: 'review',
  refund_options: ['refund', 'voucher'],
};

function normalizeRules(value: CancellationPolicyVersion['rules'] | null | undefined): CancellationPolicyRules {
  const raw = (value || {}) as Partial<CancellationPolicyRules>;
  return {
    cancellation_window_hours: Number(raw.cancellation_window_hours ?? DEFAULT_RULES.cancellation_window_hours),
    late_cancel_penalty_percentage: Number(raw.late_cancel_penalty_percentage ?? DEFAULT_RULES.late_cancel_penalty_percentage),
    no_show_percentage: Number(raw.no_show_percentage ?? DEFAULT_RULES.no_show_percentage),
    unjustified_free_cancellations: Number(raw.unjustified_free_cancellations ?? DEFAULT_RULES.unjustified_free_cancellations),
    allow_justified_cancellations: raw.allow_justified_cancellations ?? DEFAULT_RULES.allow_justified_cancellations,
    refund_mode: raw.refund_mode === 'automatic' ? 'automatic' : 'review',
    refund_options: Array.isArray(raw.refund_options) && raw.refund_options.length > 0
      ? raw.refund_options.filter((option): option is RefundOption => option === 'refund' || option === 'voucher')
      : DEFAULT_RULES.refund_options,
  };
}

function linesToList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function listToLines(value: unknown): string {
  return Array.isArray(value) ? value.filter(Boolean).join('\n') : '';
}

export function CancellationPolicySettingsSection() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const centerId = profile?.center_id;

  const [name, setName] = useState('Política de cancelación');
  const [rules, setRules] = useState<CancellationPolicyRules>(DEFAULT_RULES);
  const [validReasons, setValidReasons] = useState('Enfermedad o urgencia médica\nFuerza mayor familiar\nCausa justificada aceptada por el profesional');
  const [penaltyConcept, setPenaltyConcept] = useState('Cancelación fuera de plazo según política aceptada');
  const [rectificationReason, setRectificationReason] = useState('Devolución por cancelación de cita');
  const [voucherValidityDays, setVoucherValidityDays] = useState(365);

  const { data: activePolicy, isLoading } = useQuery({
    queryKey: ['active-cancellation-policy', centerId],
    queryFn: async () => {
      if (!centerId) return null;
      const { data, error } = await supabase
        .from('cancellation_policy_versions')
        .select('*')
        .eq('center_id', centerId)
        .eq('is_active', true)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as CancellationPolicyVersion | null;
    },
    enabled: !!centerId,
  });

  useEffect(() => {
    if (!activePolicy) return;
    setName(activePolicy.name || 'Política de cancelación');
    setRules(normalizeRules(activePolicy.rules));
    setValidReasons(listToLines(activePolicy.valid_reasons));
    setPenaltyConcept(activePolicy.penalty_invoice_concept || 'Cancelación fuera de plazo según política aceptada');
    setRectificationReason(activePolicy.rectification_reason || 'Devolución por cancelación de cita');
    setVoucherValidityDays(activePolicy.voucher_validity_days || 365);
  }, [activePolicy]);

  const previewText = useMemo(() => {
    const reasons = linesToList(validReasons);
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
          valid_reasons: linesToList(validReasons),
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
                  <Label>Texto generado</Label>
                  <Textarea value={previewText} readOnly rows={6} className="bg-muted/50" />
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
