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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useCenter } from '@/hooks/useCenter';
import { useProfessionals } from '@/hooks/usePatients';
import { useSessionTypes } from '@/hooks/useSessionTypes';
import { parseSections } from '@/lib/ai-documents';
import { modelOptionsForProvider } from '@/lib/ai-models';
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
  useDeleteDocumentType,
  useAIDocumentDefaults,
  useSetDocumentDefault,
  useClearOwnDocumentDefault,
  resolveDocumentDefault,
  type ResolvedPromptVersion,
  type PromptVersionScope,
} from '@/hooks/useAIDocumentTemplates';
import type {
  AiDocumentType,
  AiDocumentAudience,
  AiDocumentScope,
  AiDocumentDefaultAudience,
} from '@/types/ai-documents';

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

const DEFAULT_AUDIENCE_LABELS: Record<AiDocumentDefaultAudience, string> = {
  professional: 'Informe del profesional',
  patient: 'Resumen del paciente',
};

/** Origen de una plantilla, para distinguir visualmente Psycma / centro / propia. */
type DocumentTypeOrigin = 'system' | 'center' | 'own';

function getDocumentTypeOrigin(dt: AiDocumentType): DocumentTypeOrigin {
  if (dt.center_id === null) return 'system';
  if (dt.professional_id) return 'own';
  return 'center';
}

const ORIGIN_LABELS: Record<DocumentTypeOrigin, string> = {
  system: 'Psycma',
  center: 'Centro',
  own: 'Propia',
};

/** Variante de `Badge` por origen: sistema en gris neutro, centro en secundario, propia
 *  destacada (color primario) para que salte a la vista que nadie más la ve. */
const ORIGIN_BADGE_VARIANT: Record<DocumentTypeOrigin, 'outline' | 'secondary' | 'default'> = {
  system: 'outline',
  center: 'secondary',
  own: 'default',
};

function OriginBadge({ origin }: { origin: DocumentTypeOrigin }) {
  return <Badge variant={ORIGIN_BADGE_VARIANT[origin]}>{ORIGIN_LABELS[origin]}</Badge>;
}

const MODEL_CHOICE_CENTER = '__center__';
const MODEL_CHOICE_CUSTOM = '__custom__';

/** Sentinela para "usar la predeterminada del centro" en el selector de un profesional
 *  (ranuras de predeterminadas, no tiene relación con el selector de modelo de IA). */
const DEFAULT_SLOT_USE_CENTER = '__use_center__';

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

/** Icono representativo por destinatario, para dar identidad visual rápida a cada tarjeta. */
const AUDIENCE_ICONS: Record<AiDocumentAudience, string> = {
  professional: 'stethoscope',
  patient: 'favorite',
  internal: 'lock',
  third_party: 'share',
};

export function AIDocumentTemplatesSection() {
  const { isAdmin, profile } = useAuth();
  const { data: documentTypes = [], isLoading } = useAIDocumentTypes();
  const [selected, setSelected] = useState<AiDocumentType | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [tab, setTab] = useState<'mine' | 'system'>('system');

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

  // "Mis plantillas": todo lo que no es de sistema (propias del profesional + del centro,
  // ambas personalizables y borrables). "Plantillas del sistema": las de Psycma, comunes a
  // todos los centros (solo duplicables, nunca editables ni borrables desde aquí).
  const mine = useMemo(
    () => documentTypes.filter((dt) => getDocumentTypeOrigin(dt) !== 'system'),
    [documentTypes]
  );
  const system = useMemo(
    () => documentTypes.filter((dt) => getDocumentTypeOrigin(dt) === 'system'),
    [documentTypes]
  );

  const groupsFor = (list: AiDocumentType[]) => {
    const groups = new Map<AiDocumentScope, AiDocumentType[]>();
    for (const dt of list) {
      const arr = groups.get(dt.scope) ?? [];
      arr.push(dt);
      groups.set(dt.scope, arr);
    }
    return (Object.keys(SCOPE_LABELS) as AiDocumentScope[])
      .map((scope) => ({ scope, items: groups.get(scope) ?? [] }))
      .filter((g) => g.items.length > 0);
  };

  return (
    <div className="space-y-4">
      <DefaultTemplatesCard documentTypes={documentTypes} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Icon name="description" className="h-5 w-5" />
              Plantillas de documentos
            </CardTitle>
            <CardDescription>
              Documentos clínicos generados con IA. Cada plantilla tiene su propio historial de
              versiones de prompt.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Icon name="add" className="mr-2 h-4 w-4" />
            Nueva plantilla
          </Button>
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
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'mine' | 'system')}>
              <TabsList>
                <TabsTrigger value="system">Plantillas del sistema</TabsTrigger>
                <TabsTrigger value="mine">Mis plantillas{mine.length > 0 ? ` (${mine.length})` : ''}</TabsTrigger>
              </TabsList>

              <TabsContent value="system" className="mt-4 space-y-6">
                {system.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No hay plantillas de sistema todavía.
                  </p>
                ) : (
                  groupsFor(system).map((group) => (
                    <TemplateGroup key={group.scope} scope={group.scope} items={group.items} onSelect={setSelected} />
                  ))
                )}
              </TabsContent>

              <TabsContent value="mine" className="mt-4 space-y-6">
                {mine.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Todavía no tienes plantillas propias.
                    <br />
                    Crea una nueva o duplica una desde "Plantillas del sistema" para personalizarla.
                  </div>
                ) : (
                  groupsFor(mine).map((group) => (
                    <TemplateGroup key={group.scope} scope={group.scope} items={group.items} onSelect={setSelected} />
                  ))
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>

        {selectedFresh && (
          <DocumentTypeDetailDialog
            documentType={selectedFresh}
            allDocumentTypes={documentTypes}
            open={!!selected}
            onOpenChange={(open) => !open && setSelected(null)}
          />
        )}

        <DocumentTypeFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          mode="create"
          nextSortOrder={nextSortOrder}
          documentTypes={documentTypes}
        />
      </Card>
    </div>
  );
}

/** Subcategoría por ámbito temporal ("Sesión >", "Multi-sesión >"...), en el espíritu de
 *  las categorías de Plaud, con sus plantillas en tarjetas dentro. */
function TemplateGroup({
  scope,
  items,
  onSelect,
}: {
  scope: AiDocumentScope;
  items: AiDocumentType[];
  onSelect: (dt: AiDocumentType) => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">{SCOPE_LABELS[scope]}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((dt) => (
          <TemplateCard key={dt.id} documentType={dt} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function TemplateCard({
  documentType: dt,
  onSelect,
}: {
  documentType: AiDocumentType;
  onSelect: (dt: AiDocumentType) => void;
}) {
  const origin = getDocumentTypeOrigin(dt);
  return (
    <button
      type="button"
      onClick={() => onSelect(dt)}
      className={cn(
        'group flex h-full flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md',
        !dt.is_active && 'opacity-60'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name={AUDIENCE_ICONS[dt.audience]} className="h-5 w-5" />
        </div>
        <OriginBadge origin={origin} />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium leading-tight">{dt.label}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {dt.description || 'Sin descripción.'}
        </p>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        <Badge variant="outline" className="text-[10px] font-normal">
          {AUDIENCE_LABELS[dt.audience]}
        </Badge>
        {!dt.is_active && (
          <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
            Inactiva
          </Badge>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Predeterminadas por destinatario (informe del profesional / resumen del paciente)
// ---------------------------------------------------------------------------

function DefaultTemplatesCard({ documentTypes }: { documentTypes: AiDocumentType[] }) {
  const { data: defaults = [], isLoading } = useAIDocumentDefaults();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon name="star" className="h-5 w-5" />
          Plantillas predeterminadas
        </CardTitle>
        <CardDescription>
          Las que se usan al pulsar "Generar automáticamente" sobre una sesión: una para el
          informe del profesional y otra para el resumen del paciente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Icon name="progress_activity" className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {(Object.keys(DEFAULT_AUDIENCE_LABELS) as AiDocumentDefaultAudience[]).map((audience) => (
              <DefaultTemplateSlot
                key={audience}
                audience={audience}
                documentTypes={documentTypes}
                defaults={defaults}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DefaultTemplateSlot({
  audience,
  documentTypes,
  defaults,
}: {
  audience: AiDocumentDefaultAudience;
  documentTypes: AiDocumentType[];
  defaults: ReturnType<typeof useAIDocumentDefaults>['data'];
}) {
  const { isAdmin, profile } = useAuth();
  const setDefault = useSetDocumentDefault();
  const clearOwn = useClearOwnDocumentDefault();

  const eligible = useMemo(
    () =>
      documentTypes.filter(
        (dt) => dt.is_active && dt.scope === 'session' && dt.audience === audience
      ),
    [documentTypes, audience]
  );

  const resolved = useMemo(
    () => resolveDocumentDefault(audience, defaults ?? [], documentTypes, profile?.id),
    [audience, defaults, documentTypes, profile?.id]
  );

  const ownRow = (defaults ?? []).find((d) => d.audience === audience && d.professional_id === profile?.id);

  if (isAdmin) {
    return (
      <div className="space-y-1.5 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm">{DEFAULT_AUDIENCE_LABELS[audience]}</Label>
          <Badge variant="outline" className="text-[10px]">Predeterminada del centro</Badge>
        </div>
        <Select
          value={resolved.centerDocumentType?.id ?? ''}
          onValueChange={(v) => setDefault.mutate({ audience, documentTypeId: v, scope: 'center' })}
          disabled={setDefault.isPending}
        >
          <SelectTrigger><SelectValue placeholder="Elige una plantilla" /></SelectTrigger>
          <SelectContent>
            {eligible.map((dt) => (
              <SelectItem key={dt.id} value={dt.id}>{dt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Cada profesional puede fijar la suya propia, que la sustituirá solo para él.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm">{DEFAULT_AUDIENCE_LABELS[audience]}</Label>
        {resolved.source === 'professional' ? (
          <Badge className="text-[10px]">Tu predeterminada</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">Predeterminada del centro</Badge>
        )}
      </div>
      {resolved.source === 'professional' && resolved.centerDocumentType && (
        <p className="text-xs text-muted-foreground">
          Sustituye a la del centro (<span className="font-medium">{resolved.centerDocumentType.label}</span>) solo para ti.
        </p>
      )}
      <Select
        value={ownRow?.document_type_id ?? DEFAULT_SLOT_USE_CENTER}
        onValueChange={(v) => {
          if (v === DEFAULT_SLOT_USE_CENTER) clearOwn.mutate(audience);
          else setDefault.mutate({ audience, documentTypeId: v, scope: 'mine' });
        }}
        disabled={setDefault.isPending || clearOwn.isPending}
      >
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_SLOT_USE_CENTER}>
            Usar la del centro{resolved.centerDocumentType ? ` (${resolved.centerDocumentType.label})` : ''}
          </SelectItem>
          {eligible.map((dt) => (
            <SelectItem key={dt.id} value={dt.id}>{dt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detalle de una plantilla: secciones, dependencias e historial de versiones
// ---------------------------------------------------------------------------

interface DocumentTypeDetailDialogProps {
  documentType: AiDocumentType;
  allDocumentTypes: AiDocumentType[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DocumentTypeDetailDialog({
  documentType,
  allDocumentTypes,
  open,
  onOpenChange,
}: DocumentTypeDetailDialogProps) {
  const { isAdmin, profile } = useAuth();
  const [mode, setMode] = useState<'view' | 'new-version' | 'edit-type'>('view');
  const { versions, isLoading: versionsLoading } = usePromptVersions(documentType.id);
  const setActive = useSetDocumentTypeActive();
  const duplicate = useDuplicateSystemDocumentType();
  const deleteType = useDeleteDocumentType();

  const sections = parseSections(documentType.sections);
  const origin = getDocumentTypeOrigin(documentType);
  const isSystemTemplate = origin === 'system';
  const isOwnTemplate = origin === 'own' && documentType.professional_id === profile?.id;
  const canManageMetadata = !isSystemTemplate && (isAdmin || isOwnTemplate);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) setMode('view');
    onOpenChange(nextOpen);
  };

  const handleDelete = async () => {
    await deleteType.mutateAsync(documentType.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{documentType.label}</DialogTitle>
            <OriginBadge origin={origin} />
            <Badge variant="outline">{AUDIENCE_LABELS[documentType.audience]}</Badge>
            <Badge variant="outline">{SCOPE_LABELS[documentType.scope]}</Badge>
          </div>
          {documentType.description && (
            <DialogDescription>{documentType.description}</DialogDescription>
          )}
        </DialogHeader>

        {mode === 'view' && (
          <div className="space-y-5">
            <DefaultMarker documentType={documentType} allDocumentTypes={allDocumentTypes} />

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
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setMode('edit-type')}>
                      <Icon name="edit" className="mr-2 h-4 w-4" />
                      Editar datos de la plantilla
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
                          <Icon name="delete" className="mr-2 h-4 w-4" />
                          Eliminar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar "{documentType.label}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Se borrará también su historial de versiones de prompt. Esta acción no
                            se puede deshacer. Los documentos ya generados con esta plantilla no se
                            ven afectados.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={deleteType.isPending}
                            onClick={handleDelete}
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
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

            {documentType.default_user_prompt && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Prompt base de la plantilla
                </p>
                <p className="mb-2 text-xs text-muted-foreground">
                  Es el que se usa mientras no haya ninguna versión publicada que aplique. No es
                  editable directamente: para cambiarlo, crea una versión nueva y publícala.
                </p>
                <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                  {documentType.default_user_prompt}
                </pre>
              </div>
            )}

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
                Todavía no hay ninguna versión de prompt para esta plantilla en tu centro
                {documentType.default_user_prompt
                  ? ': se está usando el prompt base de arriba.'
                  : '.'}
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

/**
 * Acción para marcar ESTA plantilla como la predeterminada de su destinatario (solo si su
 * `audience` es `professional` o `patient` y su `scope` es `session`: no tiene sentido
 * ofrecer la marca en las demás, CONTRACT-2 §3.2 "no ofrezcas lo imposible").
 */
function DefaultMarker({
  documentType,
  allDocumentTypes,
}: {
  documentType: AiDocumentType;
  allDocumentTypes: AiDocumentType[];
}) {
  const { isAdmin, profile } = useAuth();
  const { data: defaults = [] } = useAIDocumentDefaults();
  const setDefault = useSetDocumentDefault();

  const eligibleAudience: AiDocumentDefaultAudience | null =
    documentType.scope === 'session' &&
    (documentType.audience === 'professional' || documentType.audience === 'patient')
      ? documentType.audience
      : null;

  if (!eligibleAudience || !documentType.is_active) return null;

  const resolved = resolveDocumentDefault(eligibleAudience, defaults, allDocumentTypes, profile?.id);
  const isCenterDefault = resolved.centerDocumentType?.id === documentType.id;
  const ownRow = defaults.find((d) => d.audience === eligibleAudience && d.professional_id === profile?.id);
  const isOwnDefault = ownRow?.document_type_id === documentType.id;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3">
      <div className="text-sm text-muted-foreground">
        Predeterminada para <span className="font-medium text-foreground">{DEFAULT_AUDIENCE_LABELS[eligibleAudience]}</span>
        {isAdmin && isCenterDefault && ' — ya es la del centro.'}
        {!isAdmin && isOwnDefault && ' — ya es la tuya.'}
        {!isAdmin && !isOwnDefault && isCenterDefault && ' — ya es la del centro (y no tienes una propia).'}
      </div>
      {isAdmin ? (
        <Button
          size="sm"
          variant="outline"
          disabled={isCenterDefault || setDefault.isPending}
          onClick={() => setDefault.mutate({ audience: eligibleAudience, documentTypeId: documentType.id, scope: 'center' })}
        >
          <Icon name="star" className="mr-2 h-4 w-4" />
          Fijar como predeterminada del centro
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={isOwnDefault || setDefault.isPending}
          onClick={() => setDefault.mutate({ audience: eligibleAudience, documentTypeId: documentType.id, scope: 'mine' })}
        >
          <Icon name="star" className="mr-2 h-4 w-4" />
          Fijar como mi predeterminada
        </Button>
      )}
    </div>
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
          <span>Modelo: {version.model ?? 'el del centro'}</span>
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
  const { center } = useCenter();
  const { data: professionals = [] } = useProfessionals();
  const { data: sessionTypes = [] } = useSessionTypes();
  const createVersion = useCreatePromptVersion();

  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [modelChoice, setModelChoice] = useState<string>(MODEL_CHOICE_CENTER);
  const [customModel, setCustomModel] = useState('');
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

  const providerModels = modelOptionsForProvider(center?.ai_provider);
  const isCustomModel = modelChoice === MODEL_CHOICE_CUSTOM;
  const resolvedModel =
    modelChoice === MODEL_CHOICE_CENTER ? null : isCustomModel ? customModel.trim() || null : modelChoice;

  const handleSubmit = async () => {
    if (!userPrompt.trim()) return;
    const scope = buildScope();
    if (!scope) return;

    const parsedTemperature = temperature.trim() === '' ? null : Number(temperature);

    await createVersion.mutateAsync({
      documentTypeId: documentType.id,
      systemPrompt: systemPrompt.trim() || null,
      userPrompt: userPrompt.trim(),
      model: resolvedModel,
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
          <Select value={modelChoice} onValueChange={setModelChoice}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={MODEL_CHOICE_CENTER}>Usar el del centro</SelectItem>
              {providerModels.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
              <SelectItem value={MODEL_CHOICE_CUSTOM}>Modelo personalizado...</SelectItem>
            </SelectContent>
          </Select>
          {isCustomModel && (
            <Input
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="Nombre del modelo"
              className="mt-2"
            />
          )}
          <p className="text-xs text-muted-foreground">
            Se muestran los modelos de {center?.ai_provider === 'gemini' ? 'Google Gemini' : 'OpenAI'}, el
            proveedor configurado en el centro.
          </p>
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

const DUPLICATE_FROM_SCRATCH = '__scratch__';

interface DocumentTypeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create';
  nextSortOrder: number;
  documentTypes: AiDocumentType[];
}

function DocumentTypeFormDialog({
  open,
  onOpenChange,
  nextSortOrder,
  documentTypes,
}: DocumentTypeFormDialogProps) {
  const { isAdmin } = useAuth();
  const createType = useCreateDocumentType();
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [audience, setAudience] = useState<AiDocumentAudience>('professional');
  const [scope, setScope] = useState<AiDocumentScope>('session');
  const [duplicateFromId, setDuplicateFromId] = useState(DUPLICATE_FROM_SCRATCH);

  const normalizedKey = key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const duplicateSource =
    duplicateFromId === DUPLICATE_FROM_SCRATCH
      ? undefined
      : documentTypes.find((dt) => dt.id === duplicateFromId);

  const reset = () => {
    setKey('');
    setLabel('');
    setDescription('');
    setAudience('professional');
    setScope('session');
    setDuplicateFromId(DUPLICATE_FROM_SCRATCH);
  };

  const handleDuplicateFromChange = (value: string) => {
    setDuplicateFromId(value);
    const source = documentTypes.find((dt) => dt.id === value);
    if (source) {
      setAudience(source.audience);
      setScope(source.scope);
      if (!label.trim()) setLabel(`${source.label} (copia)`);
    }
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
      duplicateFrom: duplicateSource
        ? {
            requires: duplicateSource.requires,
            sections: duplicateSource.sections,
            input_schema: duplicateSource.input_schema,
            required_consent_purposes: duplicateSource.required_consent_purposes,
            mirror_column: null, // el espejo a sessions.ai_summary_* es exclusivo de las plantillas de sistema
          }
        : undefined,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isAdmin ? 'Nueva plantilla del centro' : 'Nueva plantilla propia'}</DialogTitle>
          <DialogDescription>
            {isAdmin
              ? 'Visible y editable por todo el centro.'
              : 'Solo tú la verás y podrás editarla; no la ven otros profesionales del centro.'}{' '}
            Puedes partir de cero o duplicar una plantilla existente para heredar sus secciones.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Partir de</Label>
            <Select value={duplicateFromId} onValueChange={handleDuplicateFromChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={DUPLICATE_FROM_SCRATCH}>Desde cero (sin secciones)</SelectItem>
                {documentTypes.map((dt) => (
                  <SelectItem key={dt.id} value={dt.id}>
                    {dt.label} ({ORIGIN_LABELS[getDocumentTypeOrigin(dt)]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
