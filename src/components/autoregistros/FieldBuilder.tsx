import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowUp, ArrowDown, Trash2, Plus, GripVertical, BarChart3 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import type { AutoregistroField } from '@/hooks/useAutoregistroTemplates';

const FIELD_TYPES = [
  { value: 'text', label: 'Texto corto' },
  { value: 'textarea', label: 'Texto largo' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Fecha' },
  { value: 'time', label: 'Hora' },
  { value: 'select', label: 'Selección' },
  { value: 'checkbox', label: 'Casilla' },
  { value: 'scale', label: 'Escala (0-10)' },
] as const;

interface FieldBuilderProps {
  fields: AutoregistroField[];
  onChange: (fields: AutoregistroField[]) => void;
}

export function FieldBuilder({ fields, onChange }: FieldBuilderProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [optionsTextMap, setOptionsTextMap] = useState<Record<number, string>>({});

  const getOptionsText = (index: number, field: AutoregistroField) => {
    if (index in optionsTextMap) return optionsTextMap[index];
    return (field.options ?? []).join(', ');
  };

  const addField = () => {
    onChange([
      ...fields,
      { label: '', type: 'text', required: false, order: fields.length },
    ]);
  };

  const updateField = (index: number, updates: Partial<AutoregistroField>) => {
    const next = fields.map((f, i) => (i === index ? { ...f, ...updates } : f));
    onChange(next);
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index).map((f, i) => ({ ...f, order: i })));
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((f, i) => ({ ...f, order: i })));
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const next = [...fields];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    onChange(next.map((f, i) => ({ ...f, order: i })));
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-3">
      {fields.map((field, index) => (
        <Card
          key={index}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDrop={(e) => handleDrop(e, index)}
          onDragEnd={handleDragEnd}
          className={`border transition-all ${
            dragIndex === index ? 'opacity-40' : ''
          } ${
            dragOverIndex === index && dragIndex !== index
              ? 'border-primary ring-1 ring-primary/30'
              : 'border-border'
          }`}
        >
          <CardContent className="p-3 space-y-3">
            <div className="flex items-center gap-2">
              <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors">
                <GripVertical className="h-5 w-5" />
              </div>
              <Input
                placeholder="Nombre del campo"
                value={field.label}
                onChange={(e) => updateField(index, { label: e.target.value })}
                className="flex-1"
              />
              <Select
                value={field.type}
                onValueChange={(v) => updateField(index, { type: v as AutoregistroField['type'], options: v === 'select' ? [] : undefined })}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {field.type === 'select' && (
              <Input
                placeholder="Opciones separadas por coma"
                value={getOptionsText(index, field)}
                onChange={(e) =>
                  setOptionsTextMap((prev) => ({ ...prev, [index]: e.target.value }))
                }
                onBlur={() => {
                  const raw = optionsTextMap[index];
                  if (raw !== undefined) {
                    updateField(index, {
                      options: raw.split(',').map((s) => s.trim()).filter(Boolean),
                    });
                    setOptionsTextMap((prev) => { const n = { ...prev }; delete n[index]; return n; });
                  }
                }}
              />
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={field.required}
                  onCheckedChange={(v) => updateField(index, { required: v })}
                  id={`req-${index}`}
                />
                <Label htmlFor={`req-${index}`} className="text-sm">Obligatorio</Label>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => moveField(index, -1)} disabled={index === 0}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => moveField(index, 1)} disabled={index === fields.length - 1}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => removeField(index)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Button variant="outline" onClick={addField} className="w-full">
        <Plus className="h-4 w-4 mr-2" /> Añadir campo
      </Button>
    </div>
  );
}
