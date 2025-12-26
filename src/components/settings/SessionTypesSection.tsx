import { useState, useEffect } from 'react';
import { Plus, X, Loader2, Save, AlertCircle, Info, ChevronUp, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  useSessionTypes,
  useCreateSessionType,
  useUpdateSessionType,
  useDeleteSessionType,
  useReorderSessionTypes,
  SessionType,
} from '@/hooks/useSessionTypes';
import {
  validateProductForAEAT,
  hasBlockingErrors,
  TAX_TREATMENT_OPTIONS,
  EXEMPTION_CODE_OPTIONS,
  NON_SUBJECT_CODE_OPTIONS,
  VAT_RATE_OPTIONS,
  type TaxTreatment,
  type ExemptionCode,
  type NonSubjectCode,
} from '@/lib/verifactu-validation';

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
  const reorderMutation = useReorderSessionTypes();

  const [editableTypes, setEditableTypes] = useState<EditableSessionType[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [expandedFiscal, setExpandedFiscal] = useState<string | null>(null);

  useEffect(() => {
    if (sessionTypes && !isInitialized) {
      setEditableTypes(sessionTypes.map(st => ({ ...st })));
      setIsInitialized(true);
    }
  }, [sessionTypes, isInitialized]);

  const handleChange = (index: number, field: keyof EditableSessionType, value: string | number | null) => {
    setEditableTypes(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      
      // Auto-adjust related fields when tax_treatment changes
      if (field === 'tax_treatment') {
        const treatment = value as TaxTreatment;
        if (treatment === 'EXENTA') {
          updated[index].vat_rate = 0;
          updated[index].exemption_code = updated[index].exemption_code || 'E1';
          updated[index].non_subject_code = null;
        } else if (treatment === 'NO_SUJETA') {
          updated[index].vat_rate = 0;
          updated[index].exemption_code = null;
          updated[index].non_subject_code = updated[index].non_subject_code || 'N1';
        } else if (treatment === 'S1') {
          updated[index].vat_rate = updated[index].vat_rate && updated[index].vat_rate > 0 ? updated[index].vat_rate : 21;
          updated[index].exemption_code = null;
          updated[index].non_subject_code = null;
        } else if (treatment === 'S2') {
          updated[index].vat_rate = 0;
          updated[index].exemption_code = null;
          updated[index].non_subject_code = null;
        }
      }
      
      return updated;
    });
    setHasChanges(true);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setEditableTypes(prev => {
      const updated = [...prev];
      [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
      return updated;
    });
    setHasChanges(true);
  };

  const handleMoveDown = (index: number) => {
    if (index === editableTypes.length - 1) return;
    setEditableTypes(prev => {
      const updated = [...prev];
      [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
      return updated;
    });
    setHasChanges(true);
  };

  const handleAddNew = () => {
    const newId = `new-${Date.now()}`;
    setEditableTypes(prev => [
      ...prev,
      {
        tempId: newId,
        isNew: true,
        name: '',
        default_price: 60,
        commission_rate: 0,
        duration_minutes: 60,
        color: '#3B82F6',
        tax_treatment: 'EXENTA',
        vat_rate: 0,
        exemption_code: 'E1',
        non_subject_code: null,
        vat_regime_key: '01',
      },
    ]);
    setExpandedFiscal(newId);
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
    const existingIds: string[] = [];

    for (const item of editableTypes) {
      if (!item.name?.trim()) continue;

      // Validate fiscal configuration
      const issues = validateProductForAEAT({
        name: item.name,
        tax_treatment: item.tax_treatment || 'EXENTA',
        vat_rate: item.vat_rate ?? 0,
        exemption_code: item.exemption_code as ExemptionCode,
        non_subject_code: item.non_subject_code as NonSubjectCode,
        vat_regime_key: item.vat_regime_key,
      });

      if (hasBlockingErrors(issues)) {
        continue; // Skip items with errors
      }

      if (item.isNew) {
        promises.push(
          createMutation.mutateAsync({
            name: item.name,
            default_price: item.default_price || 60,
            commission_rate: item.commission_rate || 0,
            duration_minutes: item.duration_minutes || 60,
            color: item.color || '#3B82F6',
            tax_treatment: item.tax_treatment || 'EXENTA',
            vat_rate: item.vat_rate ?? 0,
            exemption_code: item.exemption_code as ExemptionCode,
            non_subject_code: item.non_subject_code as NonSubjectCode,
            vat_regime_key: item.vat_regime_key || '01',
          })
        );
      } else if (item.id) {
        existingIds.push(item.id);
        const original = sessionTypes?.find(st => st.id === item.id);
        if (original) {
          const hasChanged =
            original.name !== item.name ||
            Number(original.default_price) !== Number(item.default_price) ||
            Number(original.commission_rate || 0) !== Number(item.commission_rate || 0) ||
            Number(original.duration_minutes) !== Number(item.duration_minutes) ||
            original.color !== item.color ||
            original.tax_treatment !== item.tax_treatment ||
            Number(original.vat_rate || 0) !== Number(item.vat_rate || 0) ||
            original.exemption_code !== item.exemption_code ||
            original.non_subject_code !== item.non_subject_code;

          if (hasChanged) {
            promises.push(
              updateMutation.mutateAsync({
                id: item.id,
                name: item.name,
                default_price: Number(item.default_price),
                commission_rate: Number(item.commission_rate || 0),
                duration_minutes: Number(item.duration_minutes),
                color: item.color,
                tax_treatment: item.tax_treatment || 'EXENTA',
                vat_rate: item.vat_rate ?? 0,
                exemption_code: item.exemption_code as ExemptionCode,
                non_subject_code: item.non_subject_code as NonSubjectCode,
                vat_regime_key: item.vat_regime_key || '01',
              })
            );
          }
        }
      }
    }

    await Promise.all(promises);

    // Reorder existing items (after creates/updates complete)
    if (existingIds.length > 0) {
      await reorderMutation.mutateAsync(existingIds);
    }

    setIsInitialized(false);
    setHasChanges(false);
  };

  const getValidationIssues = (item: EditableSessionType) => {
    if (!item.name?.trim()) return [];
    return validateProductForAEAT({
      name: item.name,
      tax_treatment: item.tax_treatment || 'EXENTA',
      vat_rate: item.vat_rate ?? 0,
      exemption_code: item.exemption_code as ExemptionCode,
      non_subject_code: item.non_subject_code as NonSubjectCode,
      vat_regime_key: item.vat_regime_key,
    });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending || reorderMutation.isPending;

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
          Configura los tipos de sesión disponibles con sus precios, duraciones y tratamiento fiscal para Verifactu. 
          Usa las flechas ↑↓ para cambiar el orden de visualización.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Header */}
        <div className="hidden md:grid md:grid-cols-[60px,1fr,100px,100px,140px,80px,40px] gap-4 px-2 text-sm font-medium text-muted-foreground">
          <span>Orden</span>
          <span>Nombre</span>
          <span>Precio (€)</span>
          <span>Comisión (%)</span>
          <span>Duración</span>
          <span>Color</span>
          <span></span>
        </div>

        {/* Session Types List */}
        <div className="space-y-3">
          {editableTypes.map((item, index) => {
            const itemId = item.id || item.tempId || `item-${index}`;
            const issues = getValidationIssues(item);
            const hasErrors = hasBlockingErrors(issues);
            const isExpanded = expandedFiscal === itemId;

            return (
              <div
                key={itemId}
                className={`rounded-lg border bg-card ${hasErrors ? 'border-destructive/50' : ''}`}
              >
                {/* Main row */}
                <div className="grid grid-cols-1 md:grid-cols-[60px,1fr,100px,100px,140px,80px,40px] gap-3 md:gap-4 p-3 md:p-2">
                  {/* Order controls */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="h-7 w-7"
                      title="Subir"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === editableTypes.length - 1}
                      className="h-7 w-7"
                      title="Bajar"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>

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

                {/* Fiscal configuration collapsible */}
                <Collapsible open={isExpanded} onOpenChange={(open) => setExpandedFiscal(open ? itemId : null)}>
                  <div className="px-3 pb-2 md:px-2">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
                        <Info className="h-3 w-3 mr-1" />
                        Configuración fiscal {hasErrors && <AlertCircle className="h-3 w-3 ml-1 text-destructive" />}
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  
                  <CollapsibleContent>
                    <div className="px-3 pb-3 md:px-2 space-y-3 border-t pt-3">
                      {/* Validation alerts */}
                      {issues.length > 0 && (
                        <Alert variant={hasErrors ? "destructive" : "default"} className="py-2">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-xs space-y-1">
                            {issues.map((issue, i) => (
                              <div key={i}>
                                {issue.severity === "error" ? "❌" : "⚠️"} {issue.message}
                                {issue.hint && <span className="opacity-70"> — {issue.hint}</span>}
                              </div>
                            ))}
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        {/* Tax Treatment */}
                        <div className="space-y-1">
                          <Label className="text-xs">Tratamiento fiscal</Label>
                          <Select
                            value={item.tax_treatment || 'EXENTA'}
                            onValueChange={v => handleChange(index, 'tax_treatment', v)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TAX_TREATMENT_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  <div className="flex flex-col">
                                    <span>{opt.label}</span>
                                    <span className="text-xs text-muted-foreground">{opt.description}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* VAT Rate - only for S1 */}
                        {item.tax_treatment === 'S1' && (
                          <div className="space-y-1">
                            <Label className="text-xs">Tipo IVA (%)</Label>
                            <Select
                              value={String(item.vat_rate ?? 21)}
                              onValueChange={v => handleChange(index, 'vat_rate', parseInt(v))}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {VAT_RATE_OPTIONS.map(opt => (
                                  <SelectItem key={opt.value} value={String(opt.value)}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Exemption Code - only for EXENTA */}
                        {item.tax_treatment === 'EXENTA' && (
                          <div className="space-y-1">
                            <Label className="text-xs">Código exención</Label>
                            <Select
                              value={item.exemption_code || 'E1'}
                              onValueChange={v => handleChange(index, 'exemption_code', v)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {EXEMPTION_CODE_OPTIONS.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    <div className="flex flex-col">
                                      <span>{opt.label}</span>
                                      <span className="text-xs text-muted-foreground max-w-[250px] truncate">{opt.description}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Non-Subject Code - only for NO_SUJETA */}
                        {item.tax_treatment === 'NO_SUJETA' && (
                          <div className="space-y-1">
                            <Label className="text-xs">Código no sujeción</Label>
                            <Select
                              value={item.non_subject_code || 'N1'}
                              onValueChange={v => handleChange(index, 'non_subject_code', v)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {NON_SUBJECT_CODE_OPTIONS.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    <div className="flex flex-col">
                                      <span>{opt.label}</span>
                                      <span className="text-xs text-muted-foreground max-w-[250px] truncate">{opt.description}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            );
          })}
        </div>

        {/* Add new button */}
        <Button
          variant="outline"
          onClick={handleAddNew}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Añadir nuevo tipo de sesión
        </Button>

        {/* Save button */}
        {hasChanges && (
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Guardar cambios
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
