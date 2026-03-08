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

interface DynamicFormRendererProps {
  fields: AutoregistroField[];
  onSubmit: (values: Record<string, any>) => void;
  isSubmitting?: boolean;
}

export function DynamicFormRenderer({ fields, onSubmit, isSubmitting }: DynamicFormRendererProps) {
  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const sorted = [...fields].sort((a, b) => a.order - b.order);

  const setValue = (label: string, value: any) => {
    setValues((prev) => ({ ...prev, [label]: value }));
    setErrors((prev) => ({ ...prev, [label]: '' }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    for (const field of sorted) {
      if (field.required) {
        const v = values[field.label];
        if (v === undefined || v === null || v === '') {
          newErrors[field.label] = 'Campo obligatorio';
        }
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {sorted.map((field) => (
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
            <Select value={values[field.label] ?? ''} onValueChange={(v) => setValue(field.label, v)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                {(field.options ?? []).map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                min={0}
                max={10}
                step={1}
                value={[values[field.label] ?? 5]}
                onValueChange={([v]) => setValue(field.label, v)}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0</span>
                <span className="font-medium text-foreground">{values[field.label] ?? 5}</span>
                <span>10</span>
              </div>
            </div>
          )}

          {errors[field.label] && (
            <p className="text-xs text-destructive">{errors[field.label]}</p>
          )}
        </div>
      ))}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Enviando...' : 'Enviar registro'}
      </Button>
    </form>
  );
}
