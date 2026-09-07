import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useProfessionals } from '@/hooks/usePatients';
import { useSessionTypes } from '@/hooks/useSessionTypes';
import { parseSections } from '@/lib/ai-documents';
import {
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_LAYER1_PROMPT,
  DEFAULT_LAYER2_PROMPT,
  DEFAULT_LAYER3_PROMPT,
} from '@/lib/defaultPrompts';
import {
  useAIDocumentTypes,
  usePromptVersions,
  useCreatePromptVersion,
  usePublishPromptVersion,
  useCreateDocumentType,
  useUpdateDocumentType,
  useSetDocumentTypeActive,
  useDuplicateSystemDocumentType,
  type ResolvedPromptVersion,
  type PromptVersionScope,
} from '@/hooks/useAIDocumentTemplates';
import type { AiDocumentType, AiDocumentAudience, AiDocumentScope } from '@/types/ai-documents';

/**
 * Catálogo de plantillas de documentos clínicos generados con IA. Sustituye al bloque
 * "Prompts personalizados" (4 textarea fijos) que antes vivía en `AISettingsSection`.
 *
 * Cada plantilla (`ai_document_type`) tiene un historial de versiones de prompt
 * (`ai_prompt_version`), con ámbito de centro, profesional o tipo de sesión. Las
 * versiones publicadas son inmutables: editar significa crear una versión nueva.
 */

const AUDIENCE_LABELS: Record<AiDocumentAudience, string> = {
  professional: 'Profesional',
  patient: 'Paciente',
  internal: 'Interno',
  third_party: 'Terceros',
};

const SCOPE_LABELS: Record<AiDocumentScope, string> = {
  session: 'Sesión',
  multi_session: 'Multi-sesión',
  patient: 'Histórico del paciente',
};

/**
 * Solo las tres plantillas heredadas del sistema de "3 capas" tienen un prompt por
 * defecto conocido en el cliente. Las plantillas nuevas (SOAP, primera consulta...)
 * no tienen equivalente en `defaultPrompts.ts`, así que para ellas no se ofrece botón
 * de "restaurar por defecto".
 */
const DEFAULT_USER_PROMPT_BY_KEY: Record<string, string> = {
  base_extraction: DEFAULT_LAYER1_PROMPT,
  clinical_report: DEFAULT_LAYER2_PROMPT,
  patient_report: DEFAULT_LAYER3_PROMPT,
};

function formatDate(iso: string): string {
  try {
    return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

export function AIDocumentTemplatesSection() {
  const { isAdmin } = useAuth();
  const { data: documentTypes = [], isLoading } = useAIDocumentTypes();
  const [selected, setSelected] = useState<AiDocumentType | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Mantiene sincronizado el diálogo de detalle con los datos frescos tras una mutación
  // (activar/desactivar, editar), sin depender de una referencia obsoleta del array.
  const selectedFresh = useMemo(
    () => (selected ? documentTypes.find((dt) => dt.id === selected.id) ?? selected : null),
    [selected, documentTypes]
  );

  const nextSortOrder = useMemo(
    () => documentTypes.reduce((max, dt) => Math.max(max, dt.sort_order), 0) + 10,
    [documentTypes]
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Icon name="description" className="h-5 w-5" />
            Plantillas de documentos
          </CardTitle>
          <CardDescription>
            Catálogo de documentos clínicos generados con IA. Cada uno tiene su propio historial
            de versiones de prompt, con ámbito de centro, de un profesional concreto o de un tipo
            de sesión concreto.
          </CardDescription>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Icon name="add" className="mr-2 h-4 w-4" />
            Nueva plantilla
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : documentTypes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay plantillas disponibles todavía.
          </p>
        ) : (
          <div className="space-y-2">
            {documentTypes.map((dt) => (
              <button
                key={dt.id}
                type="button"
                onClick={() => setSelected(dt)}
                className={cn(
                  'flex w-full items-start justify-between gap-3 rounded-lg border p-4 text-left transition-colors hover:border-primary/50',
                  !dt.is_active && 'opacity-60'
                )}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{dt.label}</span>
                    <Badge variant={dt.center_id ? 'secondary' : 'outline'}>
                      {dt.center_id ? 'Centro' : 'Sistema'}
                    </Badge>
                    <Badge variant="outline">{AUDIENCE_LABELS[dt.audience]}</Badge>
                    <Badge variant="outline">{SCOPE_LABELS[dt.scope]}</Badge>
                    {!dt.is_active && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inactiva
                      </Badge>
                    )}
                  </div>
                  {dt.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{dt.description}</p>
                  )}
                </div>
                <Icon name="chevron_right" className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </CardContent>

      {selectedFresh && (
        <DocumentTypeDetailDialog
          documentType={selectedFresh}
          open={!!selected}
          onOpenChange={(open) => !open && setSelected(null)}
        />
      )}

      <DocumentTypeFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        nextSortOrder={nextSortOrder}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Detalle de una plantilla: secciones, dependencias e historial de versiones
// ---------------------------------------------------------------------------

interface DocumentTypeDetailDialogProps {
  documentType: AiDocumentType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DocumentTypeDetailDialog({ documentType, open, onOpenChange }: DocumentTypeDetailDialogProps) {
  const { isAdmin } = useAuth();
  const [mode, setMode] = useState<'view' | 'new-version' | 'edit-type'>('view');
  const { versions, isLoading: versionsLoading } = usePromptVersions(documentType.id);
  const setActive = useSetDocumentTypeActive();
  const duplicate = useDuplicateSystemDocumentType();

  const sections = parseSections(documentType.sections);
  const isSystemTemplate = documentType.center_id === null;
  const canManageMetadata = isAdmin && !isSystemTemplate;

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) setMode('view');
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{documentType.label}</DialogTitle>
            <Badge variant={isSystemTemplate ? 'outline' : 'secondary'}>
              {isSystemTemplate ? 'Sistema' : 'Centro'}
            </Badge>
            <Badge variant="outline">{AUDIENCE_LABELS[documentType.audience]}</Badge>
            <Badge variant="outline">{SCOPE_LABELS[documentType.scope]}</Badge>
          </div>
          {documentType.description && (
            <DialogDescription>{documentType.description}</DialogDescription>
          )}
        </DialogHeader>

        {mode === 'view' && (
          <div className="space-y-5">
            {isSystemTemplate ? (
              isAdmin && (
                <Alert>
                  <Icon name="info" className="h-4 w-4" />
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Plantilla de sistema, compartida por todos los centros. Para personalizarla,
                      duplícala como plantilla propia del centro.
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => duplicate.mutate(documentType)}
                      disabled={duplicate.isPending}
                    >
                      <Icon name="content_copy" className="mr-2 h-4 w-4" />
                      Duplicar para el centro
                    </Button>
                  </AlertDescription>
                </Alert>
              )
            ) : (
              canManageMetadata && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`dt-active-${documentType.id}`}
                      checked={documentType.is_active}
                      disabled={setActive.isPending}
                      onCheckedChange={(checked) =>
                        setActive.mutate({ id: documentType.id, isActive: checked })
                      }
                    />
                    <Label htmlFor={`dt-active-${documentType.id}`} className="cursor-pointer text-sm">
                      {documentType.is_active ? 'Activa' : 'Inactiva'}
                    </Label>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setMode('edit-type')}>
                    <Icon name="edit" className="mr-2 h-4 w-4" />
                    Editar datos de la plantilla
                  </Button>
                </div>
              )
            )}

            {documentType.requires.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Depende de</p>
                <div className="flex flex-wrap gap-1.5">
                  {documentType.requires.map((key) => (
                    <Badge key={key} variant="outline">
                      {key}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Secciones que genera ({sections.length})
              </p>
              {sections.length === 0 ? (
                <p className="text-xs text-muted-foreground">Esta plantilla no declara secciones todavía.</p>
              ) : (
                <div className="space-y-1">
                  {sections.map((s) => (
                    <div
                      key={s.key}
                      className="flex items-center justify-between gap-2 rounded border px-3 py-1.5 text-sm"
                    >
                      <span>{s.label}</span>
                      <div className="flex gap-1">
                        {s.required && (
                          <Badge variant="outline" className="text-[10px]">
                            Obligatoria
                          </Badge>
                        )}
                        {s.shareable && (
                          <Badge variant="outline" className="text-[10px]">
                            Compartible
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Versiones del prompt</p>
              <Button size="sm" onClick={() => setMode('new-version')}>
                <Icon name="add" className="mr-2 h-4 w-4" />
                Nueva versión
              </Button>
            </div>

            {versionsLoading ? (
              <div className="flex justify-center py-6">
                <Icon name="progress_activity" className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay ninguna versión de prompt para esta plantilla en tu centro.
              </p>
            ) : (
              <div className="space-y-2">
                {versions.map((v) => (
                  <PromptVersionRow key={v.id} version={v} documentTypeId={documentType.id} />
                ))}
              </div>
            )}
          </div>
        )}

        {mode === 'new-version' && (
          <NewVersionForm
            documentType={documentType}
            onDone={() => setMode('view')}
            onCancel={() => setMode('view')}
          />
        )}

        {mode === 'edit-type' && (
          <DocumentTypeFormDialog.Inline
            documentType={documentType}
            onDone={() => setMode('view')}
            onCancel={() => setMode('view')}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Fila de una versión, con su prompt colapsado y el botón de publicar
// ---------------------------------------------------------------------------

function PromptVersionRow({
  version,
  documentTypeId,
}: {
  version: ResolvedPromptVersion;
  documentTypeId: string;
}) {
  const { isAdmin, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const publish = usePublishPromptVersion();

  const canPublish = isAdmin || version.professional_id === profile?.id;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 p-3 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm">v{version.version}</span>
          <Badge variant={version.is_published ? 'default' : 'outline'}>
            {version.is_published ? 'Publicada' : 'Borrador'}
          </Badge>
          <span className="text-xs text-muted-foreground">{version.scopeLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{formatDate(version.created_at)}</span>
          <Icon name="expand_more" className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t p-3">
        {version.system_prompt && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Prompt del sistema</p>
            <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">{version.system_prompt}</pre>
          </div>
        )}
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Prompt de usuario</p>
          <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">{version.user_prompt}</pre>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {version.model && <span>Modelo: {version.model}</span>}
          {version.temperature != null && <span>Temperatura: {version.temperature}</span>}
        </div>
        {!version.is_published && (
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!canPublish || publish.isPending}
              onClick={() => publish.mutate({ id: version.id, documentTypeId })}
            >
              <Icon name="publish" className="mr-2 h-4 w-4" />
              Publicar esta versión
            </Button>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Formulario para crear una versión nueva (nunca se edita una publicada)
// ---------------------------------------------------------------------------

function NewVersionForm({
  documentType,
  onDone,
  onCancel,
}: {
  documentType: AiDocumentType;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { isAdmin, profile } = useAuth();
  const { data: professionals = [] } = useProfessionals();
  const { data: sessionTypes = [] } = useSessionTypes();
  const createVersion = useCreatePromptVersion();

  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState('');
  const [scopeKind, setScopeKind] = useState<'center' | 'professional' | 'session_type'>('center');
  const [scopeProfessionalId, setScopeProfessionalId] = useState('');
  const [scopeSessionTypeId, setScopeSessionTypeId] = useState('');

  const hasDefault = documentType.key in DEFAULT_USER_PROMPT_BY_KEY;

  const handleRestoreDefault = () => {
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    setUserPrompt(DEFAULT_USER_PROMPT_BY_KEY[documentType.key] ?? '');
  };

  const buildScope = (): PromptVersionScope | null => {
    if (!isAdmin) {
      if (!profile?.id) return null;
      return { kind: 'professional', professionalId: profile.id };
    }
    if (scopeKind === 'professional') {
      if (!scopeProfessionalId) return null;
      return { kind: 'professional', professionalId: scopeProfessionalId };
    }
    if (scopeKind === 'session_type') {
      if (!scopeSessionTypeId) return null;
      return { kind: 'session_type', sessionTypeId: scopeSessionTypeId };
    }
    return { kind: 'center' };
  };

  const handleSubmit = async () => {
    if (!userPrompt.trim()) return;
    const scope = buildScope();
    if (!scope) return;

    const parsedTemperature = temperature.trim() === '' ? null : Number(temperature);

    await createVersion.mutateAsync({
      documentTypeId: documentType.id,
      systemPrompt: systemPrompt.trim() || null,
      userPrompt: userPrompt.trim(),
      model: model.trim() || null,
      temperature: parsedTemperature != null && !Number.isNaN(parsedTemperature) ? parsedTemperature : null,
      scope,
    });
    onDone();
  };

  return (
    <div className="space-y-4">
      <Alert>
        <Icon name="lock" className="h-4 w-4" />
        <AlertDescription>
          Las versiones publicadas son inmutables: esto crea una versión nueva en borrador, que no
          afecta a las generaciones en curso hasta que la publiques.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label>Ámbito de la versión</Label>
        {!isAdmin ? (
          <p className="text-sm text-muted-foreground">
            Solo puedes crear versiones atadas a ti mismo: se usarán únicamente en tus propias
            generaciones de este documento.
          </p>
        ) : (
          <RadioGroup value={scopeKind} onValueChange={(v) => setScopeKind(v as typeof scopeKind)} className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="center" />
              Todo el centro
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="professional" />
              Un profesional concreto
            </label>
            {scopeKind === 'professional' && (
              <Select value={scopeProfessionalId} onValueChange={setScopeProfessionalId}>
                <SelectTrigger className="ml-6 w-[calc(100%-1.5rem)]">
                  <SelectValue placeholder="Elige un profesional" />
                </SelectTrigger>
                <SelectContent>
                  {professionals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {[p.first_name, p.last_name].filter(Boolean).join(' ') || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="session_type" />
              Un tipo de sesión concreto
            </label>
            {scopeKind === 'session_type' && (
              <Select value={scopeSessionTypeId} onValueChange={setScopeSessionTypeId}>
                <SelectTrigger className="ml-6 w-[calc(100%-1.5rem)]">
                  <SelectValue placeholder="Elige un tipo de sesión" />
                </SelectTrigger>
                <SelectContent>
                  {sessionTypes.map((st) => (
                    <SelectItem key={st.id} value={st.id}>
                      {st.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </RadioGroup>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Prompt del sistema (opcional)</Label>
          {hasDefault && (
            <Button variant="ghost" size="sm" onClick={handleRestoreDefault}>
              <Icon name="restart_alt" className="mr-1 h-3 w-3" />
              Restaurar por defecto
            </Button>
          )}
        </div>
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          className="min-h-[80px] font-mono text-xs"
          placeholder="Instrucciones generales de rol y tono. Déjalo en blanco para usar el del proveedor."
        />
      </div>

      <div className="space-y-2">
        <Label>Prompt de usuario</Label>
        <Textarea
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          className="min-h-[160px] font-mono text-xs"
          placeholder="Instrucciones para generar este documento a partir de la transcripción y sus dependencias."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Modelo (opcional)</Label>
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Usar el del centro" />
        </div>
        <div className="space-y-2">
          <Label>Temperatura (opcional)</Label>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            placeholder="Usar la del centro"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={!userPrompt.trim() || createVersion.isPending}>
          {createVersion.isPending && <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />}
          Guardar como borrador
        </Button>
      </DialogFooter>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Crear / editar una plantilla del centro (metadatos; las secciones son de solo lectura)
// ---------------------------------------------------------------------------

interface DocumentTypeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create';
  nextSortOrder: number;
}

function DocumentTypeFormDialog({ open, onOpenChange, nextSortOrder }: DocumentTypeFormDialogProps) {
  const createType = useCreateDocumentType();
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [audience, setAudience] = useState<AiDocumentAudience>('professional');
  const [scope, setScope] = useState<AiDocumentScope>('session');

  const normalizedKey = key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const reset = () => {
    setKey('');
    setLabel('');
    setDescription('');
    setAudience('professional');
    setScope('session');
  };

  const handleSubmit = async () => {
    if (!normalizedKey || !label.trim()) return;
    await createType.mutateAsync({
      key: normalizedKey,
      label: label.trim(),
      description: description.trim() || null,
      audience,
      scope,
      sortOrder: nextSortOrder,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva plantilla del centro</DialogTitle>
          <DialogDescription>
            Define los datos básicos. Las secciones que genera se configuran aparte y de momento
            se dejan vacías: para partir de un catálogo de secciones ya definido, duplica una
            plantilla de sistema en vez de crear una desde cero.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej: Informe de seguimiento" />
          </div>
          <div className="space-y-2">
            <Label>Clave interna</Label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="ej: informe_seguimiento" />
            {normalizedKey && <p className="text-xs text-muted-foreground">Se guardará como: {normalizedKey}</p>}
          </div>
          <div className="space-y-2">
            <Label>Descripción (opcional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[60px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Destinatario</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as AiDocumentAudience)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(AUDIENCE_LABELS).map(([value, text]) => (
                    <SelectItem key={value} value={value}>{text}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ámbito temporal</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as AiDocumentScope)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SCOPE_LABELS).map(([value, text]) => (
                    <SelectItem key={value} value={value}>{text}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!normalizedKey || !label.trim() || createType.isPending}>
            {createType.isPending && <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />}
            Crear plantilla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Variante inline (sin `Dialog` propio) para editar una plantilla ya existente del centro. */
function EditDocumentTypeInline({
  documentType,
  onDone,
  onCancel,
}: {
  documentType: AiDocumentType;
  onDone: () => void;
  onCancel: () => void;
}) {
  const updateType = useUpdateDocumentType();
  const [label, setLabel] = useState(documentType.label);
  const [description, setDescription] = useState(documentType.description ?? '');
  const [audience, setAudience] = useState<AiDocumentAudience>(documentType.audience);
  const [scope, setScope] = useState<AiDocumentScope>(documentType.scope);

  const handleSubmit = async () => {
    if (!label.trim()) return;
    await updateType.mutateAsync({
      id: documentType.id,
      label: label.trim(),
      description: description.trim() || null,
      audience,
      scope,
    });
    onDone();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Nombre</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Descripción (opcional)</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[60px]" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Destinatario</Label>
          <Select value={audience} onValueChange={(v) => setAudience(v as AiDocumentAudience)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(AUDIENCE_LABELS).map(([value, text]) => (
                <SelectItem key={value} value={value}>{text}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Ámbito temporal</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as AiDocumentScope)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(SCOPE_LABELS).map(([value, text]) => (
                <SelectItem key={value} value={value}>{text}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={!label.trim() || updateType.isPending}>
          {updateType.isPending && <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />}
          Guardar cambios
        </Button>
      </DialogFooter>
    </div>
  );
}

// Expone la variante inline como propiedad estática para usarla dentro del diálogo de
// detalle sin crear un `Dialog` anidado (shadcn no anida bien overlays de Radix).
DocumentTypeFormDialog.Inline = EditDocumentTypeInline;
