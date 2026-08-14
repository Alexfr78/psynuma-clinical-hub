import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { AutoregistroField } from '@/hooks/useAutoregistroTemplates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, X, Clock, Activity } from 'lucide-react';

interface AlertCondition {
  field: string;
  operator: string;
  value: string;
  field_type?: string;
}

interface AlertRule {
  id: string;
  template_id: string;
  center_id: string;
  name: string;
  is_active: boolean;
  rule_type: 'condition' | 'frequency';
  conditions: AlertCondition[];
  logic_operator: 'AND' | 'OR';
  consecutive_count: number;
  severity: 'warning' | 'critical';
  frequency_threshold: number | null;
  frequency_window_hours: number | null;
  frequency_condition_field: string | null;
  frequency_condition_operator: string | null;
  frequency_condition_value: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  templateId: string;
  fields: AutoregistroField[];
}

const NUMERIC_OPERATORS = [
  { value: 'lt', label: 'Menor que (<)' },
  { value: 'lte', label: 'Menor o igual (≤)' },
  { value: 'gt', label: 'Mayor que (>)' },
  { value: 'gte', label: 'Mayor o igual (≥)' },
  { value: 'eq', label: 'Igual a (=)' },
  { value: 'neq', label: 'Distinto de (≠)' },
];

const SELECT_OPERATORS = [
  { value: 'eq', label: 'Igual a' },
  { value: 'neq', label: 'Distinto de' },
  { value: 'contains', label: 'Contiene' },
];

const EMPTY_CONDITION: AlertCondition = { field: '', operator: '', value: '' };

export default function AlertRulesBuilder({ templateId, fields }: Props) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [ruleType, setRuleType] = useState<'condition' | 'frequency'>('condition');
  const [logicOperator, setLogicOperator] = useState<'AND' | 'OR'>('OR');
  const [severity, setSeverity] = useState<'warning' | 'critical'>('warning');
  const [consecutiveCount, setConsecutiveCount] = useState(1);
  const [conditions, setConditions] = useState<AlertCondition[]>([]);
  // Frequency state
  const [freqThreshold, setFreqThreshold] = useState(3);
  const [freqWindowHours, setFreqWindowHours] = useState(24);
  const [freqCondField, setFreqCondField] = useState('');
  const [freqCondOperator, setFreqCondOperator] = useState('');
  const [freqCondValue, setFreqCondValue] = useState('');

  const eligibleFields = fields.filter(f =>
    ['scale', 'number', 'select', 'emotion_cards'].includes(f.type)
  );

  const getFieldByLabel = (label: string) => eligibleFields.find(f => f.label === label);

  // Query
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['alert-rules', templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('autoregistro_alert_rules')
        .select('*')
        .eq('template_id', templateId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AlertRule[];
    },
  });

  // Toggle active
  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('autoregistro_alert_rules')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-rules', templateId] }),
    onError: () => toast.error('Error al cambiar el estado'),
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('autoregistro_alert_rules')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules', templateId] });
      toast.success('Regla eliminada');
    },
    onError: () => toast.error('Error al eliminar la regla'),
  });

  // Save (create/edit)
  const saveMutation = useMutation({
    mutationFn: async () => {
      const basePayload = {
        template_id: templateId,
        center_id: profile!.center_id!,
        name,
        severity,
        rule_type: ruleType,
      };

      const payload = ruleType === 'frequency'
        ? {
            ...basePayload,
            logic_operator: 'OR',
            consecutive_count: 1,
            conditions: [] as any,
            frequency_threshold: freqThreshold,
            frequency_window_hours: freqWindowHours,
            frequency_condition_field: freqCondField || null,
            frequency_condition_operator: freqCondOperator || null,
            frequency_condition_value: freqCondValue || null,
          }
        : {
            ...basePayload,
            logic_operator: logicOperator,
            consecutive_count: consecutiveCount,
            conditions: conditions.map(c => ({
              ...c,
              field_type: eligibleFields.find(f => f.label === c.field)?.type || 'text',
            })) as any,
            frequency_threshold: null,
            frequency_window_hours: null,
            frequency_condition_field: null,
            frequency_condition_operator: null,
            frequency_condition_value: null,
          };

      if (editingRule) {
        const { error } = await supabase
          .from('autoregistro_alert_rules')
          .update(payload)
          .eq('id', editingRule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('autoregistro_alert_rules')
          .insert(payload);
        if (error) throw error;
      }

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules', templateId] });
      toast.success(editingRule ? 'Regla actualizada' : 'Regla creada');
      closeDialog();
    },
    onError: () => toast.error('Error al guardar la regla'),
  });

  function openCreate() {
    setEditingRule(null);
    setName('');
    setRuleType('condition');
    setLogicOperator('OR');
    setSeverity('warning');
    setConsecutiveCount(1);
    setConditions([]);
    setFreqThreshold(3);
    setFreqWindowHours(24);
    setFreqCondField('');
    setFreqCondOperator('');
    setFreqCondValue('');
    setDialogOpen(true);
  }

  function openEdit(rule: AlertRule) {
    setEditingRule(rule);
    setName(rule.name);
    setRuleType(rule.rule_type || 'condition');
    setLogicOperator(rule.logic_operator);
    setSeverity(rule.severity);
    setConsecutiveCount(rule.consecutive_count);
    setConditions(Array.isArray(rule.conditions) ? rule.conditions : []);
    setFreqThreshold(rule.frequency_threshold ?? 3);
    setFreqWindowHours(rule.frequency_window_hours ?? 24);
    setFreqCondField(rule.frequency_condition_field ?? '');
    setFreqCondOperator(rule.frequency_condition_operator ?? '');
    setFreqCondValue(rule.frequency_condition_value ?? '');
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingRule(null);
  }

  function updateCondition(idx: number, patch: Partial<AlertCondition>) {
    setConditions(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      const updated = { ...c, ...patch };
      // Reset operator/value when field changes
      if (patch.field && patch.field !== c.field) {
        updated.operator = '';
        updated.value = '';
      }
      return updated;
    }));
  }

  function removeCondition(idx: number) {
    setConditions(prev => prev.filter((_, i) => i !== idx));
  }

  const isConditionComplete = (c: AlertCondition) => c.field && c.operator && c.value !== '';
  const canSaveCondition = conditions.length > 0 && conditions.every(isConditionComplete);
  const canSaveFrequency = freqThreshold >= 1 && freqWindowHours >= 1;
  const canSave = name.trim() && (ruleType === 'condition' ? canSaveCondition : canSaveFrequency);

  function getOperatorsForField(fieldLabel: string) {
    const f = getFieldByLabel(fieldLabel);
    if (!f) return NUMERIC_OPERATORS;
    if (f.type === 'select' || f.type === 'emotion_cards') return SELECT_OPERATORS;
    return NUMERIC_OPERATORS;
  }

  function renderValueInput(condition: AlertCondition, idx: number) {
    const f = getFieldByLabel(condition.field);
    if (f?.type === 'emotion_cards' && (f as any).emotionOptions && (f as any).emotionOptions.length > 0) {
      const emotionOptions = (f as any).emotionOptions as { label: string; value?: string; imageUrl?: string }[];
      return (
        <Select value={String(condition.value)} onValueChange={v => updateCondition(idx, { value: v })}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Seleccionar emoción" />
          </SelectTrigger>
          <SelectContent>
            {emotionOptions.map(opt => {
              const val = opt.value?.trim() || opt.label;
              return (
                <SelectItem key={val} value={val}>
                  {opt.label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      );
    }
    if (f?.type === 'select' && f.options && f.options.length > 0) {
      return (
        <Select value={condition.value} onValueChange={v => updateCondition(idx, { value: v })}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Valor" />
          </SelectTrigger>
          <SelectContent>
            {f.options.map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        type={f?.type === 'scale' || f?.type === 'number' ? 'number' : 'text'}
        placeholder="Valor"
        className="w-[120px]"
        value={condition.value}
        onChange={e => updateCondition(idx, { value: e.target.value })}
      />
    );
  }

  function renderFreqValueInput() {
    const f = getFieldByLabel(freqCondField);
    if (f?.type === 'emotion_cards' && (f as any).emotionOptions && (f as any).emotionOptions.length > 0) {
      const emotionOptions = (f as any).emotionOptions as { label: string; value?: string }[];
      return (
        <Select value={freqCondValue} onValueChange={v => setFreqCondValue(v)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Seleccionar emoción" />
          </SelectTrigger>
          <SelectContent>
            {emotionOptions.map(opt => {
              const val = opt.value?.trim() || opt.label;
              return <SelectItem key={val} value={val}>{opt.label}</SelectItem>;
            })}
          </SelectContent>
        </Select>
      );
    }
    if (f?.type === 'select' && f.options && f.options.length > 0) {
      return (
        <Select value={freqCondValue} onValueChange={v => setFreqCondValue(v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Valor" />
          </SelectTrigger>
          <SelectContent>
            {f.options.map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        type={f?.type === 'scale' || f?.type === 'number' ? 'number' : 'text'}
        placeholder="Valor"
        className="w-[120px]"
        value={freqCondValue}
        onChange={e => setFreqCondValue(e.target.value)}
      />
    );
  }

  if (isLoading) return null;

  return (
    <div className="space-y-3">
      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin alertas configuradas para esta plantilla.</p>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div key={rule.id} className="flex items-center gap-3 rounded-lg border p-3">
              <Switch
                checked={rule.is_active}
                onCheckedChange={checked => toggleMutation.mutate({ id: rule.id, is_active: checked })}
              />
              <span className="flex-1 text-sm font-medium truncate">{rule.name}</span>
              {rule.rule_type === 'frequency' ? (
                <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50">
                  <Clock className="h-3 w-3 mr-1" />
                  {rule.frequency_threshold}+ en {rule.frequency_window_hours}h
                </Badge>
              ) : rule.consecutive_count > 1 ? (
                <Badge variant="outline" className="text-muted-foreground">
                  ×{rule.consecutive_count} consecutivos
                </Badge>
              ) : null}
              <Badge variant={rule.severity === 'critical' ? 'destructive' : 'secondary'}
                className={rule.severity === 'warning' ? 'bg-amber-100 text-amber-800 hover:bg-amber-100' : ''}>
                {rule.severity === 'critical' ? 'Crítico' : 'Aviso'}
              </Badge>
              <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar regla?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Se eliminará la regla "{rule.name}" y no se podrá recuperar.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMutation.mutate(rule.id)}>
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" size="sm" onClick={openCreate}>
        <Plus className="h-4 w-4 mr-1" /> Nueva regla
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Editar regla' : 'Nueva regla de alerta'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Name */}
            <div className="space-y-1">
              <div className="text-sm font-medium">Nombre de la regla</div>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Ansiedad alta persistente" />
            </div>

            {/* Rule type */}
            <div className="space-y-1">
              <div className="text-sm font-medium">Tipo de regla</div>
              <Select value={ruleType} onValueChange={v => setRuleType(v as 'condition' | 'frequency')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="condition">
                    <span className="flex items-center gap-2"><Activity className="h-4 w-4" /> Condición sobre valores</span>
                  </SelectItem>
                  <SelectItem value="frequency">
                    <span className="flex items-center gap-2"><Clock className="h-4 w-4" /> Frecuencia de registros</span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {ruleType === 'condition'
                  ? 'Se evalúa el valor de los campos en cada registro.'
                  : 'Se dispara cuando el paciente envía muchos registros en poco tiempo. Útil para consumo, craving, crisis, etc.'}
              </p>
            </div>

            {/* Severity */}
            <div className="space-y-1">
              <div className="text-sm font-medium">Severidad</div>
              <Select value={severity} onValueChange={v => setSeverity(v as 'warning' | 'critical')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warning">Aviso</SelectItem>
                  <SelectItem value="critical">Crítico</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {ruleType === 'frequency' ? (
              <>
                {/* Frequency threshold and window */}
                <div className="space-y-1">
                  <div className="text-sm font-medium">Umbral de frecuencia</div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={freqThreshold}
                      onChange={e => setFreqThreshold(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-[100px]"
                    />
                    <span className="text-sm text-muted-foreground">registros en las últimas</span>
                    <Input
                      type="number"
                      min={1}
                      value={freqWindowHours}
                      onChange={e => setFreqWindowHours(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-[100px]"
                    />
                    <span className="text-sm text-muted-foreground">horas</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    La alerta se disparará cuando el paciente haya enviado al menos {freqThreshold} registro{freqThreshold !== 1 ? 's' : ''} en las últimas {freqWindowHours} hora{freqWindowHours !== 1 ? 's' : ''}.
                  </p>
                </div>

                {/* Optional frequency filter */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Filtro opcional</div>
                  <p className="text-xs text-muted-foreground">
                    Solo contar registros donde un campo cumpla una condición. Déjalo vacío para contar todos los registros.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={freqCondField || '__none__'} onValueChange={v => { const val = v === '__none__' ? '' : v; setFreqCondField(val); setFreqCondOperator(''); setFreqCondValue(''); }}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Campo (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin filtro</SelectItem>
                        {eligibleFields.map(f => (
                          <SelectItem key={f.label} value={f.label}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {freqCondField && (
                      <>
                        <Select value={freqCondOperator} onValueChange={v => setFreqCondOperator(v)}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Operador" />
                          </SelectTrigger>
                          <SelectContent>
                            {getOperatorsForField(freqCondField).map(op => (
                              <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {renderFreqValueInput()}
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Logic operator */}
                <div className="space-y-1">
                  <div className="text-sm font-medium">Lógica de condiciones</div>
                  <Select value={logicOperator} onValueChange={v => setLogicOperator(v as 'AND' | 'OR')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OR">Cualquiera de estas condiciones (OR)</SelectItem>
                      <SelectItem value="AND">Todas estas condiciones (AND)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Consecutive count */}
                <div className="space-y-1">
                  <div className="text-sm font-medium">Registros consecutivos necesarios</div>
                  <Input
                    type="number"
                    min={1}
                    value={consecutiveCount}
                    onChange={e => setConsecutiveCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-[120px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Con valor 1 la alerta se dispara en cuanto se cumpla la condición. Con valor 3, el paciente debe haber enviado 3 registros seguidos que cumplan la regla.
                  </p>
                </div>

                {/* Conditions */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Condiciones</div>
                  {conditions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Añade al menos una condición.</p>
                  ) : (
                    conditions.map((cond, idx) => (
                      <div key={idx} className="flex items-center gap-2 flex-wrap">
                        {/* Field select */}
                        <Select value={cond.field} onValueChange={v => updateCondition(idx, { field: v })}>
                          <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="Campo" />
                          </SelectTrigger>
                          <SelectContent>
                            {eligibleFields.map(f => (
                              <SelectItem key={f.label} value={f.label}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Operator */}
                        <Select value={cond.operator} onValueChange={v => updateCondition(idx, { operator: v })}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Operador" />
                          </SelectTrigger>
                          <SelectContent>
                            {getOperatorsForField(cond.field).map(op => (
                              <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Value */}
                        {renderValueInput(cond, idx)}

                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeCondition(idx)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                  <Button variant="outline" size="sm" onClick={() => setConditions(prev => [...prev, { ...EMPTY_CONDITION }])}>
                    <Plus className="h-4 w-4 mr-1" /> Añadir condición
                  </Button>
                </div>
              </>
            )}

            {/* Save */}
            <Button
              className="w-full"
              disabled={!canSave || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? 'Guardando…' : 'Guardar regla'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
