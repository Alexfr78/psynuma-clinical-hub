import { useState, useEffect } from 'react';
import { Save, Loader2, Settings2, Globe, Copy, ExternalLink, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCenter } from '@/hooks/useCenter';
import { useAuth } from '@/hooks/useAuth';
import { useProfessionals } from '@/hooks/useProfessionals';
import { toast } from 'sonner';

export function PortalSettingsSection() {
  const { center, updateCenter } = useCenter();
  const { isAdmin } = useAuth();
  const { data: professionals } = useProfessionals();
  
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [publicBookingEnabled, setPublicBookingEnabled] = useState(false);
  const [portalAgendaClosed, setPortalAgendaClosed] = useState(false);
  const [portalSlug, setPortalSlug] = useState('');
  const [requireApproval, setRequireApproval] = useState(true);
  const [allowProfessionalSelection, setAllowProfessionalSelection] = useState(false);
  const [defaultProfessionalId, setDefaultProfessionalId] = useState<string>('');
  const [maxDays, setMaxDays] = useState(30);
  const [slotDuration, setSlotDuration] = useState('30');
  const [requireConfirmation, setRequireConfirmation] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedPublic, setCopiedPublic] = useState(false);

  useEffect(() => {
    if (center) {
      setPortalEnabled(center.portal_enabled ?? false);
      setPublicBookingEnabled(center.public_booking_enabled ?? false);
      setPortalAgendaClosed(center.portal_agenda_closed ?? false);
      setPortalSlug(center.portal_slug ?? '');
      setRequireApproval(center.portal_require_approval ?? true);
      setAllowProfessionalSelection(center.portal_allow_professional_selection ?? false);
      setDefaultProfessionalId(center.portal_default_professional_id ?? '');
      setMaxDays(center.reschedule_max_days ?? 30);
      setSlotDuration(String(center.reschedule_slot_duration ?? 30));
      setRequireConfirmation(center.reschedule_require_confirmation ?? false);
    }
  }, [center]);

  const handleSave = () => {
    if (portalEnabled && !portalSlug.trim()) {
      toast.error('El slug del portal es requerido');
      return;
    }

    if (maxDays < 1 || maxDays > 90) {
      toast.error('Los días máximos deben estar entre 1 y 90');
      return;
    }

    // Validate slug format
    const slugRegex = /^[a-z0-9-]+$/;
    if (portalSlug && !slugRegex.test(portalSlug)) {
      toast.error('El slug solo puede contener letras minúsculas, números y guiones');
      return;
    }

    updateCenter.mutate({
      portal_enabled: portalEnabled,
      public_booking_enabled: publicBookingEnabled,
      portal_agenda_closed: portalAgendaClosed,
      portal_slug: portalSlug.trim() || null,
      portal_require_approval: requireApproval,
      portal_allow_professional_selection: allowProfessionalSelection,
      portal_default_professional_id: defaultProfessionalId || null,
      reschedule_max_days: maxDays,
      reschedule_slot_duration: parseInt(slotDuration),
      reschedule_require_confirmation: requireConfirmation,
    }, {
      onSuccess: () => {
        toast.success('Configuración guardada correctamente');
      },
      onError: () => {
        toast.error('Error al guardar la configuración');
      }
    });
  };

  const portalUrl = portalSlug ? `${window.location.origin}/portal/${portalSlug}` : '';
  const publicBookingUrl = portalSlug ? `${window.location.origin}/book/${portalSlug}` : '';
  const embedCode = portalUrl ? `<iframe src="${portalUrl}" width="100%" height="700" frameborder="0" style="border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></iframe>` : '';
  const publicBookingEmbedCode = publicBookingUrl ? `<iframe src="${publicBookingUrl}?embed=1" width="100%" height="900" frameborder="0" style="border:none;"></iframe>` : '';

  const copyEmbedCode = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    toast.success('Código copiado');
    setTimeout(() => setCopied(false), 2000);
  };

  const copyPublicBookingCode = () => {
    navigator.clipboard.writeText(publicBookingEmbedCode);
    setCopiedPublic(true);
    toast.success('Código copiado');
    setTimeout(() => setCopiedPublic(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Portal de Pacientes
        </CardTitle>
        <CardDescription>
          Configura el portal público para que los pacientes gestionen sus citas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Enable Portal */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base">Activar portal de pacientes</Label>
            <p className="text-sm text-muted-foreground">
              Permite que los pacientes registrados gestionen sus citas
            </p>
          </div>
          <Switch checked={portalEnabled} onCheckedChange={setPortalEnabled} />
        </div>

        {/* Enable Public Booking */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base">Activar reservas públicas</Label>
            <p className="text-sm text-muted-foreground">
              Permite que cualquier persona reserve citas sin registro previo (ideal para embeber en tu web)
            </p>
          </div>
          <Switch checked={publicBookingEnabled} onCheckedChange={setPublicBookingEnabled} />
        </div>

        {/* Agenda Closed Mode */}
        {publicBookingEnabled && (
          <div className="flex items-center justify-between rounded-lg border p-4 ml-4 border-dashed">
            <div className="space-y-0.5">
              <Label className="text-base">Agenda cerrada (bloquear primeras consultas)</Label>
              <p className="text-sm text-muted-foreground">
                Bloquea las reservas públicas y muestra opciones para lista de espera o derivación a otro profesional
              </p>
            </div>
            <Switch checked={portalAgendaClosed} onCheckedChange={setPortalAgendaClosed} />
          </div>
        )}

        {/* Portal URL */}
        <div className="space-y-2">
          <Label htmlFor="portalSlug">URL del portal (slug)</Label>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-sm text-muted-foreground break-all">
              {window.location.origin}/portal/
            </span>
            <Input
              id="portalSlug"
              placeholder="mi-centro"
              value={portalSlug}
              onChange={(e) => setPortalSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              className="flex-1"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Solo letras minúsculas, números y guiones. Este será el identificador único de tu portal.
          </p>
        </div>

        {/* Appointments Config */}
        <div className="space-y-6 pt-4 border-t">
          <div>
            <h3 className="text-lg font-medium">Configuración de Citas</h3>
            <p className="text-sm text-muted-foreground">
              Opciones para las solicitudes de cita desde el portal
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">Requerir aprobación de citas</Label>
              <p className="text-sm text-muted-foreground">
                Las citas solicitadas quedarán pendientes hasta que las apruebes
              </p>
            </div>
            <Switch checked={requireApproval} onCheckedChange={setRequireApproval} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">Permitir selección de profesional</Label>
              <p className="text-sm text-muted-foreground">
                Los pacientes podrán elegir con qué profesional quieren la cita
              </p>
            </div>
            <Switch checked={allowProfessionalSelection} onCheckedChange={setAllowProfessionalSelection} />
          </div>

          <div className="space-y-2">
            <Label>Profesional por defecto</Label>
            <Select value={defaultProfessionalId} onValueChange={setDefaultProfessionalId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un profesional" />
              </SelectTrigger>
              <SelectContent>
                {professionals?.map((prof) => (
                  <SelectItem key={prof.id} value={prof.id}>
                    {prof.first_name} {prof.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Se asignará automáticamente cuando no se permita elegir profesional
            </p>
          </div>
        </div>

        {/* Reschedule Settings */}
        <div className="space-y-6 pt-4 border-t">
          <div>
            <h3 className="text-lg font-medium">Reprogramación de Citas</h3>
            <p className="text-sm text-muted-foreground">
              Configura cómo los pacientes pueden reprogramar sus citas
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxDays">Días máximos hacia el futuro (reservas y reprogramación)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="maxDays"
                type="number"
                min={1}
                max={90}
                value={maxDays}
                onChange={(e) => setMaxDays(parseInt(e.target.value) || 1)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">días</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Define cuántos días hacia el futuro pueden reservar o reprogramar los pacientes.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Duración de slots de tiempo</Label>
            <Select value={slotDuration} onValueChange={setSlotDuration}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutos</SelectItem>
                <SelectItem value="30">30 minutos</SelectItem>
                <SelectItem value="45">45 minutos</SelectItem>
                <SelectItem value="60">60 minutos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">Requerir doble confirmación</Label>
              <p className="text-sm text-muted-foreground">
                El paciente confirmará su selección antes del cambio
              </p>
            </div>
            <Switch checked={requireConfirmation} onCheckedChange={setRequireConfirmation} />
          </div>
        </div>

        {/* Embed Code - Patient Portal */}
        {portalEnabled && portalSlug && (
          <div className="space-y-4 pt-4 border-t">
            <div>
              <h3 className="text-lg font-medium">Portal de Pacientes - Código Embed</h3>
              <p className="text-sm text-muted-foreground">
                Para pacientes registrados que gestionan sus citas
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={portalUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Vista previa
                </a>
              </Button>
            </div>

            <Textarea
              value={embedCode}
              readOnly
              className="font-mono text-xs h-24"
            />
            
            <Button variant="secondary" onClick={copyEmbedCode}>
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? 'Copiado' : 'Copiar código'}
            </Button>
          </div>
        )}

        {/* Embed Code - Public Booking */}
        {publicBookingEnabled && portalSlug && (
          <div className="space-y-4 pt-4 border-t">
            <div>
              <h3 className="text-lg font-medium">Reservas Públicas - Código Embed</h3>
              <p className="text-sm text-muted-foreground">
                Para nuevos clientes que reservan sin registro (ideal para tu web externa)
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={publicBookingUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Vista previa
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`${publicBookingUrl}?embed=1`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Modo embed
                </a>
              </Button>
            </div>

            <Textarea
              value={publicBookingEmbedCode}
              readOnly
              className="font-mono text-xs h-24"
            />
            
            <Button variant="secondary" onClick={copyPublicBookingCode}>
              {copiedPublic ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copiedPublic ? 'Copiado' : 'Copiar código'}
            </Button>
          </div>
        )}

        {/* Save Button */}
        {isAdmin && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={updateCenter.isPending}>
              {updateCenter.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar Cambios
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
