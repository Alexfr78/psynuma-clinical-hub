import { BellRing, Building2, CircleUserRound, Loader2, LogOut, Mail, MapPin, MessageCircle, Phone, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export interface PortalAccountData {
  patient: { firstName: string; lastName: string; email: string | null; phone: string | null; address: string | null; city: string | null; postalCode: string | null };
  center: { name: string; email: string | null; phone: string | null; address: string | null; addressDetails: string | null; city: string | null; province: string | null; postalCode: string | null; country: string | null };
  communications: { remindersEnabled: boolean; reminderChannels: string[] };
  locations: Array<{ id: string; name: string; street: string | null; number_details: string | null; city: string | null; postal_code: string | null; country: string | null; location_type: string | null }>;
}

interface PortalAccountProps {
  data: PortalAccountData | null;
  loading: boolean;
  onLogout: () => void;
}

const channelLabels: Record<string, string> = { email: 'Correo electrónico', whatsapp: 'WhatsApp', sms: 'SMS' };

function joinAddress(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(', ');
}

export function PortalAccount({ data, loading, onLogout }: PortalAccountProps) {
  if (loading || !data) return <Card><CardContent className="flex min-h-40 items-center justify-center" role="status"><Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" /><span className="text-sm text-muted-foreground">Cargando tu cuenta...</span></CardContent></Card>;
  const patientAddress = joinAddress([data.patient.address, data.patient.postalCode, data.patient.city]);
  const centerAddress = joinAddress([data.center.address, data.center.addressDetails, data.center.postalCode, data.center.city, data.center.province, data.center.country]);
  const correctionSubject = encodeURIComponent('Solicitud de actualización de datos del portal');

  return <div className="space-y-4">
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><CircleUserRound className="h-5 w-5 text-primary" aria-hidden="true" />Datos personales</CardTitle><CardDescription>Estos son los datos administrativos que tiene registrados el centro.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nombre</p><p className="mt-1 font-medium">{data.patient.firstName} {data.patient.lastName}</p></div><div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Correo</p><p className="mt-1 break-all font-medium">{data.patient.email || 'No disponible'}</p></div><div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Teléfono</p><p className="mt-1 font-medium">{data.patient.phone || 'No disponible'}</p></div><div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dirección</p><p className="mt-1 font-medium">{patientAddress || 'No disponible'}</p></div><div className="rounded-lg border border-dashed p-4 sm:col-span-2"><p className="text-sm leading-6 text-muted-foreground">Para proteger tu cuenta, los cambios de correo y teléfono deben ser verificados por el centro.</p><div className="mt-3 flex flex-wrap gap-2">{data.center.email && <Button asChild variant="outline" size="sm" className="min-h-11"><a href={`mailto:${data.center.email}?subject=${correctionSubject}`}><Mail className="mr-2 h-4 w-4" aria-hidden="true" />Solicitar corrección</a></Button>}{data.center.phone && <Button asChild variant="outline" size="sm" className="min-h-11"><a href={`tel:${data.center.phone}`}><Phone className="mr-2 h-4 w-4" aria-hidden="true" />Llamar al centro</a></Button>}</div></div></CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BellRing className="h-5 w-5 text-primary" aria-hidden="true" />Comunicaciones</CardTitle><CardDescription>Canales que el centro utiliza para recordatorios de citas</CardDescription></CardHeader><CardContent>{data.communications.remindersEnabled && data.communications.reminderChannels.length > 0 ? <div className="flex flex-wrap gap-2">{data.communications.reminderChannels.map((channel) => <Badge key={channel} variant="outline" className="min-h-8 px-3"><MessageCircle className="mr-2 h-3.5 w-3.5" aria-hidden="true" />{channelLabels[channel] || channel}</Badge>)}</div> : <p className="text-sm text-muted-foreground">El centro no tiene recordatorios automáticos activos.</p>}<p className="mt-4 text-sm leading-6 text-muted-foreground">Si quieres cambiar el canal por el que recibes comunicaciones, contacta con el centro para verificar tu identidad y tus datos.</p></CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Building2 className="h-5 w-5 text-primary" aria-hidden="true" />{data.center.name}</CardTitle><CardDescription>Información de contacto y sedes públicas</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2">{data.center.email && <Button asChild variant="outline" size="sm" className="min-h-11"><a href={`mailto:${data.center.email}`}><Mail className="mr-2 h-4 w-4" aria-hidden="true" />{data.center.email}</a></Button>}{data.center.phone && <Button asChild variant="outline" size="sm" className="min-h-11"><a href={`tel:${data.center.phone}`}><Phone className="mr-2 h-4 w-4" aria-hidden="true" />{data.center.phone}</a></Button>}</div>{centerAddress && <p className="flex items-start gap-2 text-sm text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{centerAddress}</p>}{data.locations.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{data.locations.map((location) => { const address = joinAddress([location.street, location.number_details, location.postal_code, location.city, location.country]); const mapsUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null; return <div key={location.id} className="rounded-lg border p-4"><p className="font-medium">{location.name}</p><p className="mt-1 text-sm text-muted-foreground">{address || location.location_type || 'Ubicación del centro'}</p>{mapsUrl && <Button asChild variant="link" className="mt-2 min-h-11 px-0"><a href={mapsUrl} target="_blank" rel="noopener noreferrer"><MapPin className="mr-2 h-4 w-4" aria-hidden="true" />Abrir mapa</a></Button>}</div>; })}</div>}</CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />Seguridad</CardTitle><CardDescription>Protege el acceso a tu información</CardDescription></CardHeader><CardContent><p className="mb-4 text-sm leading-6 text-muted-foreground">Cierra la sesión cuando utilices un dispositivo compartido. Tendrás que solicitar un nuevo código para volver a entrar.</p><Button variant="outline" className="min-h-11 w-full text-destructive hover:bg-destructive hover:text-destructive-foreground sm:w-auto" onClick={onLogout}><LogOut className="mr-2 h-4 w-4" aria-hidden="true" />Cerrar sesión</Button></CardContent></Card>
  </div>;
}
