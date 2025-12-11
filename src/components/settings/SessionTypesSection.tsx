import { useState, useEffect } from 'react';
import { Plus, X, Loader2, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useSessionTypes,
  useCreateSessionType,
  useUpdateSessionType,
  useDeleteSessionType,
  SessionType,
} from '@/hooks/useSessionTypes';

const DURATION_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 20, label: '20 min' },
  { value: 30, label: '30 min' },
  { value: 40, label: '40 min' },
  { value: 45, label: '45 min' },
  { value: 50, label: '50 min' },
  { value: 55, label: '55 min' },
  { value: 60, label: '1 hora' },
  { value: 75, label: '1 hora 15 min' },
  { value: 90, label: '1 hora 30 min' },
  { value: 120, label: '2 horas' },
  { value: 150, label: '2 horas 30 min' },
  { value: 180, label: '3 horas' },
];

const COLOR_OPTIONS = [
  { value: '#3B82F6', label: 'Azul' },
  { value: '#22C55E', label: 'Verde' },
  { value: '#F59E0B', label: 'Amarillo' },
  { value: '#EF4444', label: 'Rojo' },
  { value: '#8B5CF6', label: 'Morado' },
  { value: '#EC4899', label: 'Rosa' },
  { value: '#06B6D4', label: 'Cyan' },
  { value: '#6B7280', label: 'Gris' },
];

interface EditableSessionType extends Partial<SessionType> {
  tempId?: string;
  isNew?: boolean;
}

export function SessionTypesSection() {
  const { data: sessionTypes, isLoading } = useSessionTypes();
  const createMutation = useCreateSessionType();
  const updateMutation = useUpdateSessionType();
  const deleteMutation = useDeleteSessionType();

  const [editableTypes, setEditableTypes] = useState<EditableSessionType[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (sessionTypes) {
      setEditableTypes(sessionTypes.map(st => ({ ...st })));
    }
  }, [sessionTypes]);

  const handleChange = (index: number, field: keyof EditableSessionType, value: string | number) => {
    setEditableTypes(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setHasChanges(true);
  };

  const handleAddNew = () => {
    setEditableTypes(prev => [
      ...prev,
      {
        tempId: `new-${Date.now()}`,
        isNew: true,
        name: '',
        default_price: 60,
        commission_rate: 0,
        duration_minutes: 60,
        color: '#3B82F6',
      },
    ]);
    setHasChanges(true);
  };

  const handleDelete = (index: number) => {
    const item = editableTypes[index];
    if (item.isNew) {
      setEditableTypes(prev => prev.filter((_, i) => i !== index));
    } else if (item.id) {
      deleteMutation.mutate(item.id);
    }
    setHasChanges(true);
  };

  const handleSave = async () => {
    const promises: Promise<unknown>[] = [];

    for (const item of editableTypes) {
      if (!item.name?.trim()) continue;

      if (item.isNew) {
        promises.push(
          createMutation.mutateAsync({
            name: item.name,
            default_price: item.default_price || 60,
            commission_rate: item.commission_rate || 0,
            duration_minutes: item.duration_minutes || 60,
            color: item.color || '#3B82F6',
          })
        );
      } else if (item.id) {
        const original = sessionTypes?.find(st => st.id === item.id);
        if (original) {
          const hasChanged =
            original.name !== item.name ||
            original.default_price !== item.default_price ||
            original.commission_rate !== item.commission_rate ||
            original.duration_minutes !== item.duration_minutes ||
            original.color !== item.color;

          if (hasChanged) {
            promises.push(
              updateMutation.mutateAsync({
                id: item.id,
                name: item.name,
                default_price: item.default_price,
                commission_rate: item.commission_rate || 0,
                duration_minutes: item.duration_minutes,
                color: item.color,
              })
            );
          }
        }
      }
    }

    await Promise.all(promises);
    setHasChanges(false);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tipos de sesión & precios</CardTitle>
        <CardDescription>
          Configura los tipos de sesión disponibles con sus precios y duraciones
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Header */}
        <div className="hidden md:grid md:grid-cols-[1fr,100px,100px,140px,80px,40px] gap-4 px-2 text-sm font-medium text-muted-foreground">
          <span>Nombre</span>
          <span>Precio (€)</span>
          <span>Comisión (%)</span>
          <span>Duración</span>
          <span>Color</span>
          <span></span>
        </div>

        {/* Session Types List */}
        <div className="space-y-3">
          {editableTypes.map((item, index) => (
            <div
              key={item.id || item.tempId}
              className="grid grid-cols-1 md:grid-cols-[1fr,100px,100px,140px,80px,40px] gap-3 md:gap-4 p-3 md:p-2 rounded-lg border bg-card"
            >
              {/* Name */}
              <div className="space-y-1 md:space-y-0">
                <Label className="md:hidden text-xs text-muted-foreground">Nombre</Label>
                <Input
                  value={item.name || ''}
                  onChange={e => handleChange(index, 'name', e.target.value)}
                  placeholder="Nombre del tipo"
                  className="h-9"
                />
              </div>

              {/* Price */}
              <div className="space-y-1 md:space-y-0">
                <Label className="md:hidden text-xs text-muted-foreground">Precio (€)</Label>
                <Input
                  type="number"
                  min={0}
                  value={item.default_price || 0}
                  onChange={e => handleChange(index, 'default_price', parseFloat(e.target.value) || 0)}
                  className="h-9"
                />
              </div>

              {/* Commission */}
              <div className="space-y-1 md:space-y-0">
                <Label className="md:hidden text-xs text-muted-foreground">Comisión (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={item.commission_rate || 0}
                  onChange={e => handleChange(index, 'commission_rate', parseFloat(e.target.value) || 0)}
                  className="h-9"
                />
              </div>

              {/* Duration */}
              <div className="space-y-1 md:space-y-0">
                <Label className="md:hidden text-xs text-muted-foreground">Duración</Label>
                <Select
                  value={String(item.duration_minutes || 60)}
                  onValueChange={v => handleChange(index, 'duration_minutes', parseInt(v))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Color */}
              <div className="space-y-1 md:space-y-0">
                <Label className="md:hidden text-xs text-muted-foreground">Color</Label>
                <Select
                  value={item.color || '#3B82F6'}
                  onValueChange={v => handleChange(index, 'color', v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue>
                      <div
                        className="w-5 h-5 rounded-full"
                        style={{ backgroundColor: item.color || '#3B82F6' }}
                      />
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {COLOR_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: opt.value }}
                          />
                          <span>{opt.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Delete Button */}
              <div className="flex items-center justify-end md:justify-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(index)}
                  disabled={deleteMutation.isPending}
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Add New Button */}
        <Button variant="link" onClick={handleAddNew} className="px-0 text-primary">
          <Plus className="h-4 w-4 mr-1" />
          Añadir tipo de sesión
        </Button>

        {/* Save Button */}
        {hasChanges && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar cambios
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
