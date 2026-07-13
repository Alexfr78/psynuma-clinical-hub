import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AutoregistroField } from '@/hooks/useAutoregistroTemplates';
import { normalizeAutoregistroFields, getScaleMin, getScaleMax, getScaleStep, getScaleDefault } from '@/lib/autoregistro-fields';
import { EmotionCardsField } from './EmotionCardsField';

const CUSTOM_VALUE_KEY = '__custom__';

interface DynamicFormRendererProps {
  fields: AutoregistroField[];
  onSubmit: (values: Record<string, any>) => void;
  isSubmitting?: boolean;
  initialValues?: Record<string, any>;
}

export function DynamicFormRenderer({ fields, onSubmit, isSubmitting, initialValues }: DynamicFormRendererProps) {
  const normalizedFields = normalizeAutoregistroFields(fields);

  const [values, setValues] = useState<Record<string, any>>(() => {
    const defaults: Record<string, any> = {};
    for (const field of normalizedFields) {
      if (field.type === 'date') defaults[field.label] = new Date().toISOString().slice(0, 10);
      if (field.type === 'time') defaults[field.label] = new Date().toTimeString().slice(0, 5);
      if (field.type === 'scale') defaults[field.label] = getScaleDefault(field);
    }
    // Overlay any initial values (e.g. when editing an existing entry)
    if (initialValues) {
      for (const field of normalizedFields) {
        if (initialValues[field.label] !== undefined) {
          // For custom-value selects: if the saved value isn't in options, mark as custom
          if (field.type === 'select' && field.allowCustomValue) {
            const opts = (field.options ?? []).filter(Boolean);
            if (!opts.includes(initialValues[field.label])) {
              defaults[field.label] = CUSTOM_VALUE_KEY;
              continue; // customTexts handled below
            }
          }
          defaults[field.label] = initialValues[field.label];
        }
      }
    }
    return defaults;
  });

  const [customTexts, setCustomTexts] = useState<Record<string, string>>(() => {
    if (!initialValues) return {};
    const ct: Record<string, string> = {};
    for (const field of normalizeAutoregistroFields(fields)) {
      if (field.type === 'select' && field.allowCustomValue && initialValues[field.label] !== undefined) {
        const opts = (field.options ?? []).filter(Boolean);
        if (!opts.includes(initialValues[field.label])) {
          ct[field.label] = String(initialValues[field.label]);
        }
      }
    }
    return ct;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const sorted = [...normalizedFields].sort((a, b) => a.order - b.order);

  const setValue = (label: string, value: any) => {
    setValues((prev) => ({ ...prev, [label]: value }));
    setErrors((prev) => ({ ...prev, [label]: '' }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    const finalValues: Record<string, any> = { ...values };

    for (const field of sorted) {
      // Resolve custom select values
      if (field.type === 'select' && field.allowCustomValue && values[field.label] === CUSTOM_VALUE_KEY) {
        const customText = (customTexts[field.label] ?? '').trim();
        if (field.required && !customText) {
          newErrors[field.label] = 'Escribe un valor personalizado';
          continue;
        }
        finalValues[field.label] = customText || '';
      }

      if (field.required) {
        const v = finalValues[field.label];
        if (v === undefined || v === null || v === '') {
          newErrors[field.label] = 'Campo obligatorio';
        }
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    onSubmit(finalValues);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {sorted.map((field) => {
        const selectOptions = (field.options ?? []).filter(Boolean);
        const scaleMin = getScaleMin(field);
        const scaleMax = getScaleMax(field);
        const scaleStep = getScaleStep(field);
        const isCustomSelected = field.allowCustomValue && values[field.label] === CUSTOM_VALUE_KEY;

        return (
          <div key={field.label} className="space-y-1.5">
            <Label className="text-sm font-medium">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>

            {field.type === 'text' && (
              <Input
                value={values[field.label] ?? ''}
                onChange={(e) => setValue(field.label, e.target.value)}
              />
            )}

            {field.type === 'textarea' && (
              <Textarea
                value={values[field.label] ?? ''}
                onChange={(e) => setValue(field.label, e.target.value)}
                rows={3}
              />
            )}

            {field.type === 'number' && (
              <Input
                type="number"
                value={values[field.label] ?? ''}
                onChange={(e) => setValue(field.label, e.target.value ? Number(e.target.value) : '')}
              />
            )}

            {field.type === 'date' && (
              <Input
                type="date"
                value={values[field.label] ?? ''}
                onChange={(e) => setValue(field.label, e.target.value)}
              />
            )}

            {field.type === 'time' && (
              <Input
                type="time"
                value={values[field.label] ?? ''}
                onChange={(e) => setValue(field.label, e.target.value)}
              />
            )}

            {field.type === 'select' && (
              selectOptions.length > 0 || field.allowCustomValue ? (
                <div className="space-y-2">
                  <Select
                    value={values[field.label] ?? ''}
                    onValueChange={(v) => {
                      setValue(field.label, v);
                      if (v !== CUSTOM_VALUE_KEY) {
                        setCustomTexts((prev) => { const n = { ...prev }; delete n[field.label]; return n; });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {selectOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                      {field.allowCustomValue && (
                        <SelectItem value={CUSTOM_VALUE_KEY}>Otra…</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {isCustomSelected && (
                    <div className="space-y-1">
                      {field.customValueLabel && (
                        <Label className="text-xs text-muted-foreground">{field.customValueLabel}</Label>
                      )}
                      <Input
                        placeholder={field.customValuePlaceholder ?? 'Escribe tu respuesta'}
                        value={customTexts[field.label] ?? ''}
                        onChange={(e) => {
                          setCustomTexts((prev) => ({ ...prev, [field.label]: e.target.value }));
                          setErrors((prev) => ({ ...prev, [field.label]: '' }));
                        }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  Este campo no tiene opciones configuradas todavía.
                </div>
              )
            )}

            {field.type === 'checkbox' && (
              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  checked={!!values[field.label]}
                  onCheckedChange={(v) => setValue(field.label, !!v)}
                />
                <span className="text-sm text-muted-foreground">Sí</span>
              </div>
            )}

            {field.type === 'scale' && (
              <div className="space-y-2 pt-1">
                <Slider
                  min={scaleMin}
                  max={scaleMax}
                  step={scaleStep}
                  value={[values[field.label] ?? getScaleDefault(field)]}
                  onValueChange={([v]) => setValue(field.label, v)}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => setValue(field.label, scaleMin)}
                    className="rounded px-1 py-0.5 text-left transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {field.minLabel || scaleMin}
                  </button>
                  <span className="font-medium text-foreground">{values[field.label] ?? getScaleDefault(field)}</span>
                  <button
                    type="button"
                    onClick={() => setValue(field.label, scaleMax)}
                    className="rounded px-1 py-0.5 text-right transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {field.maxLabel || scaleMax}
                  </button>
                </div>
              </div>
            )}

            {field.type === 'emotion_cards' && (
              <EmotionCardsField
                options={field.emotionOptions ?? []}
                value={values[field.label]}
                onChange={(v) => setValue(field.label, v)}
                allowDeselect={field.allowDeselect}
              />
            )}
            {errors[field.label] && (
              <p className="text-xs text-destructive">{errors[field.label]}</p>
            )}
          </div>
        );
      })}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Enviando...' : 'Enviar registro'}
      </Button>
    </form>
  );
}
