import { useState } from 'react';
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
import { ArrowUp, ArrowDown, Trash2, Plus, GripVertical, BarChart3, Upload, ImageIcon, X } from 'lucide-react';
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
  { value: 'scale', label: 'Escala' },
  { value: 'emotion_cards', label: 'Cartas emocionales' },
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

  const handleDragStart = (index: number) => setDragIndex(index);

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
                onValueChange={(v) => {
                  const typeUpdates: Partial<AutoregistroField> = {
                    type: v as AutoregistroField['type'],
                    options: v === 'select' ? [] : undefined,
                  };
                  if (v !== 'select') {
                    typeUpdates.allowCustomValue = undefined;
                    typeUpdates.customValueLabel = undefined;
                    typeUpdates.customValuePlaceholder = undefined;
                  }
                  if (v !== 'scale') {
                    typeUpdates.min = undefined;
                    typeUpdates.max = undefined;
                    typeUpdates.step = undefined;
                    typeUpdates.defaultValue = undefined;
                    typeUpdates.minLabel = undefined;
                    typeUpdates.maxLabel = undefined;
                  }
                  if (v !== 'emotion_cards') {
                    typeUpdates.emotionOptions = undefined;
                    typeUpdates.allowDeselect = undefined;
                  } else {
                    typeUpdates.emotionOptions = [];
                  }
                  updateField(index, typeUpdates);
                }}
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

            {/* Select options */}
            {field.type === 'select' && (
              <div className="space-y-2">
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
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!field.allowCustomValue}
                    onCheckedChange={(v) => updateField(index, { allowCustomValue: v })}
                    id={`custom-${index}`}
                  />
                  <Label htmlFor={`custom-${index}`} className="text-sm">Permitir respuesta libre ("Otra")</Label>
                </div>
                {field.allowCustomValue && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Etiqueta (ej: Otra creencia)"
                      value={field.customValueLabel ?? ''}
                      onChange={(e) => updateField(index, { customValueLabel: e.target.value || undefined })}
                    />
                    <Input
                      placeholder="Placeholder del input"
                      value={field.customValuePlaceholder ?? ''}
                      onChange={(e) => updateField(index, { customValuePlaceholder: e.target.value || undefined })}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Scale config */}
            {field.type === 'scale' && (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Mínimo</Label>
                    <Input
                      type="number"
                      value={field.min ?? 0}
                      onChange={(e) => updateField(index, { min: e.target.value !== '' ? Number(e.target.value) : undefined })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Máximo</Label>
                    <Input
                      type="number"
                      value={field.max ?? 10}
                      onChange={(e) => updateField(index, { max: e.target.value !== '' ? Number(e.target.value) : undefined })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Paso</Label>
                    <Input
                      type="number"
                      value={field.step ?? 1}
                      min={0.1}
                      onChange={(e) => updateField(index, { step: e.target.value !== '' ? Number(e.target.value) : undefined })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Por defecto</Label>
                    <Input
                      type="number"
                      value={field.defaultValue ?? Math.round(((field.min ?? 0) + (field.max ?? 10)) / 2)}
                      onChange={(e) => updateField(index, { defaultValue: e.target.value !== '' ? Number(e.target.value) : undefined })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Etiqueta mínima (ej: Nada)"
                    value={field.minLabel ?? ''}
                    onChange={(e) => updateField(index, { minLabel: e.target.value || undefined })}
                  />
                  <Input
                    placeholder="Etiqueta máxima (ej: Mucho)"
                    value={field.maxLabel ?? ''}
                    onChange={(e) => updateField(index, { maxLabel: e.target.value || undefined })}
                  />
                </div>
              </div>
            )}

            {/* Emotion cards config */}
            {field.type === 'emotion_cards' && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Opciones de emociones</Label>
                {(field.emotionOptions ?? []).map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <Input
                      placeholder="Nombre emoción"
                      value={opt.label}
                      onChange={(e) => {
                        const next = [...(field.emotionOptions ?? [])];
                        next[oi] = { ...next[oi], label: e.target.value };
                        updateField(index, { emotionOptions: next });
                      }}
                      className="flex-1"
                    />
                    <Input
                      placeholder="URL imagen"
                      value={opt.imageUrl}
                      onChange={(e) => {
                        const next = [...(field.emotionOptions ?? [])];
                        next[oi] = { ...next[oi], imageUrl: e.target.value };
                        updateField(index, { emotionOptions: next });
                      }}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const next = (field.emotionOptions ?? []).filter((_, i) => i !== oi);
                        updateField(index, { emotionOptions: next });
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = [...(field.emotionOptions ?? []), { label: '', imageUrl: '' }];
                    updateField(index, { emotionOptions: next });
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" /> Añadir emoción
                </Button>
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    checked={!!field.allowDeselect}
                    onCheckedChange={(v) => updateField(index, { allowDeselect: v })}
                    id={`deselect-${index}`}
                  />
                  <Label htmlFor={`deselect-${index}`} className="text-sm">Permitir deseleccionar</Label>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={field.required}
                    onCheckedChange={(v) => updateField(index, { required: v })}
                    id={`req-${index}`}
                  />
                  <Label htmlFor={`req-${index}`} className="text-sm">Obligatorio</Label>
                </div>
                {(field.type === 'number' || field.type === 'scale') && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={field.showInChart !== false}
                            onCheckedChange={(v) => updateField(index, { showInChart: v })}
                            id={`chart-${index}`}
                          />
                          <Label htmlFor={`chart-${index}`} className="text-sm flex items-center gap-1">
                            <BarChart3 className="h-3.5 w-3.5" />
                            Gráfica
                          </Label>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Incluir en la gráfica de evolución</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
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
