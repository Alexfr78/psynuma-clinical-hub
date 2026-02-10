import { useState } from 'react';
import { 
  Users, Plus, Pencil, Trash2, Loader2, Check, X, 
  Globe, MapPin, ExternalLink, GripVertical, ToggleLeft, Link2, Clock, CheckCircle2, XCircle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  useReferrals, 
  type ReferralSpecialty, 
  type ReferralPartner,
  type ReferralSpecialtyInput,
  type ReferralPartnerInput
} from '@/hooks/useReferrals';
import { useReferralRequests, type ReferralPartnerRequest } from '@/hooks/useReferralRequests';
import { useCenter } from '@/hooks/useCenter';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// ===== SPECIALTY FORM =====
interface SpecialtyFormProps {
  specialty?: ReferralSpecialty | null;
  onSubmit: (data: ReferralSpecialtyInput) => void;
  onCancel: () => void;
  loading?: boolean;
}

function SpecialtyForm({ specialty, onSubmit, onCancel, loading }: SpecialtyFormProps) {
  const [name, setName] = useState(specialty?.name || '');
  const [active, setActive] = useState(specialty?.active ?? true);
  const [priority, setPriority] = useState(specialty?.priority ?? 100);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), active, priority });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="spec-name">Nombre *</Label>
        <Input
          id="spec-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Terapia de pareja"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="spec-priority">Prioridad</Label>
          <Input
            id="spec-priority"
            type="number"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
            min={0}
          />
          <p className="text-xs text-muted-foreground">Menor = más arriba</p>
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch id="spec-active" checked={active} onCheckedChange={setActive} />
          <Label htmlFor="spec-active">Activa</Label>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={loading || !name.trim()}>
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {specialty ? 'Guardar' : 'Crear'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ===== PARTNER FORM =====
interface PartnerFormProps {
  partner?: ReferralPartner | null;
  specialties: ReferralSpecialty[];
  onSubmit: (data: ReferralPartnerInput) => void;
  onCancel: () => void;
  loading?: boolean;
}

function PartnerForm({ partner, specialties, onSubmit, onCancel, loading }: PartnerFormProps) {
  const [formData, setFormData] = useState({
    name: partner?.name || '',
    surname: partner?.surname || '',
    public_name: partner?.public_name || '',
    description: partner?.description || '',
    email: partner?.email || '',
    phone: partner?.phone || '',
    website: partner?.website || '',
    active: partner?.active ?? true,
    priority: partner?.priority ?? 100,
    modality: partner?.modality || [],
    provinces: partner?.provinces || [],
    cities: partner?.cities || [],
    specialties: partner?.specialties || [],
  });

  const [provincesInput, setProvincesInput] = useState('');
  const [citiesInput, setCitiesInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    onSubmit({
      ...formData,
      name: formData.name.trim(),
      surname: formData.surname || null,
      public_name: formData.public_name || null,
      description: formData.description || null,
      email: formData.email || null,
      phone: formData.phone || null,
      website: formData.website || null,
      provinces: formData.provinces.length > 0 ? formData.provinces : null,
      cities: formData.cities.length > 0 ? formData.cities : null,
      specialties: formData.specialties.length > 0 ? formData.specialties : null,
    });
  };

  const toggleModality = (mod: string) => {
    setFormData(prev => ({
      ...prev,
      modality: prev.modality.includes(mod)
        ? prev.modality.filter(m => m !== mod)
        : [...prev.modality, mod]
    }));
  };

  const toggleSpecialty = (spec: string) => {
    setFormData(prev => ({
      ...prev,
      specialties: prev.specialties.includes(spec)
        ? prev.specialties.filter(s => s !== spec)
        : [...prev.specialties, spec]
    }));
  };

  const addProvince = () => {
    const val = provincesInput.trim();
    if (val && !formData.provinces.includes(val)) {
      setFormData(prev => ({ ...prev, provinces: [...prev.provinces, val] }));
    }
    setProvincesInput('');
  };

  const removeProvince = (prov: string) => {
    setFormData(prev => ({ ...prev, provinces: prev.provinces.filter(p => p !== prov) }));
  };

  const addCity = () => {
    const val = citiesInput.trim();
    if (val && !formData.cities.includes(val)) {
      setFormData(prev => ({ ...prev, cities: [...prev.cities, val] }));
    }
    setCitiesInput('');
  };

  const removeCity = (city: string) => {
    setFormData(prev => ({ ...prev, cities: prev.cities.filter(c => c !== city) }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      {/* Basic info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nombre *</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Nombre"
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Apellidos</Label>
          <Input
            value={formData.surname}
            onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
            placeholder="Apellidos"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Nombre público (opcional)</Label>
        <Input
          value={formData.public_name}
          onChange={(e) => setFormData({ ...formData, public_name: e.target.value })}
          placeholder="Nombre a mostrar públicamente"
        />
        <p className="text-xs text-muted-foreground">Si está vacío, se usa nombre + apellidos</p>
      </div>

      <div className="space-y-2">
        <Label>Descripción</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Breve descripción del profesional..."
          rows={2}
        />
      </div>

      <Separator />

      {/* Contact */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Email</Label>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="email@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label>Teléfono</Label>
          <Input
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="+34 600 000 000"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Web</Label>
        <Input
          value={formData.website}
          onChange={(e) => setFormData({ ...formData, website: e.target.value })}
          placeholder="https://..."
        />
      </div>

      <Separator />

      {/* Modality */}
      <div className="space-y-2">
        <Label>Modalidades *</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={formData.modality.includes('online') ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggleModality('online')}
          >
            <Globe className="h-4 w-4 mr-1" />
            Online
          </Button>
          <Button
            type="button"
            variant={formData.modality.includes('presencial') ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggleModality('presencial')}
          >
            <MapPin className="h-4 w-4 mr-1" />
            Presencial
          </Button>
        </div>
      </div>

      {/* Location (only if presencial) */}
      {formData.modality.includes('presencial') && (
        <>
          <div className="space-y-2">
            <Label>Provincias</Label>
            <div className="flex gap-2">
              <Input
                value={provincesInput}
                onChange={(e) => setProvincesInput(e.target.value)}
                placeholder="Añadir provincia..."
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addProvince())}
              />
              <Button type="button" size="icon" variant="outline" onClick={addProvince}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {formData.provinces.map(prov => (
                <Badge key={prov} variant="secondary" className="gap-1">
                  {prov}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => removeProvince(prov)} />
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ciudades</Label>
            <div className="flex gap-2">
              <Input
                value={citiesInput}
                onChange={(e) => setCitiesInput(e.target.value)}
                placeholder="Añadir ciudad..."
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCity())}
              />
              <Button type="button" size="icon" variant="outline" onClick={addCity}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {formData.cities.map(city => (
                <Badge key={city} variant="secondary" className="gap-1">
                  {city}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => removeCity(city)} />
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}

      <Separator />

      {/* Specialties */}
      <div className="space-y-2">
        <Label>Especialidades</Label>
        <div className="flex flex-wrap gap-1">
          {specialties.filter(s => s.active).map(spec => (
            <Badge
              key={spec.id}
              variant={formData.specialties.includes(spec.name) ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => toggleSpecialty(spec.name)}
            >
              {formData.specialties.includes(spec.name) && <Check className="h-3 w-3 mr-1" />}
              {spec.name}
            </Badge>
          ))}
        </div>
        {specialties.filter(s => s.active).length === 0 && (
          <p className="text-xs text-muted-foreground">No hay especialidades. Créalas primero.</p>
        )}
      </div>

      <Separator />

      {/* Priority & Active */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Prioridad</Label>
          <Input
            type="number"
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
            min={0}
          />
          <p className="text-xs text-muted-foreground">Menor = más arriba</p>
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch
            checked={formData.active}
            onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
          />
          <Label>Activo</Label>
        </div>
      </div>

      <DialogFooter className="pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={loading || !formData.name.trim() || formData.modality.length === 0}>
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {partner ? 'Guardar' : 'Crear'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ===== MAIN COMPONENT =====
export function ReferralsSettingsSection() {
  const {
    specialties, specialtiesLoading, createSpecialty, updateSpecialty, deleteSpecialty,
    partners, partnersLoading, createPartner, updatePartner, deletePartner,
  } = useReferrals();

  const { requests, isLoading: requestsLoading, approveRequest, rejectRequest } = useReferralRequests();
  const { center } = useCenter();

  // Reject dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Specialty dialog state
  const [specDialogOpen, setSpecDialogOpen] = useState(false);
  const [editingSpec, setEditingSpec] = useState<ReferralSpecialty | null>(null);
  const [deleteSpecId, setDeleteSpecId] = useState<string | null>(null);

  // Partner dialog state
  const [partnerDialogOpen, setPartnerDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<ReferralPartner | null>(null);
  const [deletePartnerId, setDeletePartnerId] = useState<string | null>(null);

  // Specialty handlers
  const handleCreateSpec = () => {
    setEditingSpec(null);
    setSpecDialogOpen(true);
  };

  const handleEditSpec = (spec: ReferralSpecialty) => {
    setEditingSpec(spec);
    setSpecDialogOpen(true);
  };

  const handleSpecSubmit = async (data: ReferralSpecialtyInput) => {
    if (editingSpec) {
      await updateSpecialty.mutateAsync({ id: editingSpec.id, ...data });
    } else {
      await createSpecialty.mutateAsync(data);
    }
    setSpecDialogOpen(false);
  };

  const handleDeleteSpec = async () => {
    if (deleteSpecId) {
      await deleteSpecialty.mutateAsync(deleteSpecId);
      setDeleteSpecId(null);
    }
  };

  // Partner handlers
  const handleCreatePartner = () => {
    setEditingPartner(null);
    setPartnerDialogOpen(true);
  };

  const handleEditPartner = (partner: ReferralPartner) => {
    setEditingPartner(partner);
    setPartnerDialogOpen(true);
  };

  const handlePartnerSubmit = async (data: ReferralPartnerInput) => {
    if (editingPartner) {
      await updatePartner.mutateAsync({ id: editingPartner.id, ...data });
    } else {
      await createPartner.mutateAsync(data);
    }
    setPartnerDialogOpen(false);
  };

  const handleDeletePartner = async () => {
    if (deletePartnerId) {
      await deletePartner.mutateAsync(deletePartnerId);
      setDeletePartnerId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Derivaciones
        </CardTitle>
        <CardDescription>
          Gestiona las especialidades y profesionales de confianza para derivar pacientes
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="partners" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <TabsList>
              <TabsTrigger value="partners">Profesionales ({partners.length})</TabsTrigger>
              <TabsTrigger value="specialties">Especialidades ({specialties.length})</TabsTrigger>
              <TabsTrigger value="requests">
                Solicitudes
                {requests.filter(r => r.status === 'pending').length > 0 && (
                  <Badge variant="destructive" className="ml-1.5 h-5 px-1.5 text-xs">
                    {requests.filter(r => r.status === 'pending').length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            {center?.portal_slug && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const url = `${window.location.origin}/derivaciones/${center.portal_slug}/registro`;
                  navigator.clipboard.writeText(url);
                  toast.success('Enlace copiado al portapapeles');
                }}
              >
                <Link2 className="h-4 w-4 mr-2" />
                Copiar enlace de registro
              </Button>
            )}
          </div>

          {/* PARTNERS TAB */}
          <TabsContent value="partners" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={handleCreatePartner}>
                <Plus className="h-4 w-4 mr-2" />
                Añadir profesional
              </Button>
            </div>

            {partnersLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : partners.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No hay profesionales configurados</p>
                <p className="text-sm">Añade profesionales de confianza para derivaciones</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Activo</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="hidden md:table-cell">Modalidades</TableHead>
                      <TableHead className="hidden lg:table-cell">Ubicaciones</TableHead>
                      <TableHead className="hidden lg:table-cell">Especialidades</TableHead>
                      <TableHead className="w-[80px]">Prior.</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partners.map(partner => (
                      <TableRow key={partner.id}>
                        <TableCell>
                          <Switch
                            checked={partner.active}
                            onCheckedChange={(active) => updatePartner.mutate({ id: partner.id, active })}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{partner.public_name || `${partner.name} ${partner.surname || ''}`}</div>
                          {partner.website && (
                            <a 
                              href={partner.website} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-xs text-primary flex items-center gap-1 hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Web
                            </a>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex gap-1">
                            {partner.modality.map(m => (
                              <Badge key={m} variant="outline" className="text-xs">
                                {m === 'online' ? <Globe className="h-3 w-3 mr-1" /> : <MapPin className="h-3 w-3 mr-1" />}
                                {m}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1 max-w-[150px]">
                            {partner.provinces?.slice(0, 2).map(p => (
                              <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
                            ))}
                            {(partner.provinces?.length || 0) > 2 && (
                              <Badge variant="secondary" className="text-xs">+{(partner.provinces?.length || 0) - 2}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1 max-w-[150px]">
                            {partner.specialties?.slice(0, 2).map(s => (
                              <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                            ))}
                            {(partner.specialties?.length || 0) > 2 && (
                              <Badge variant="secondary" className="text-xs">+{(partner.specialties?.length || 0) - 2}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {partner.priority}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => handleEditPartner(partner)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setDeletePartnerId(partner.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* SPECIALTIES TAB */}
          <TabsContent value="specialties" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={handleCreateSpec}>
                <Plus className="h-4 w-4 mr-2" />
                Añadir especialidad
              </Button>
            </div>

            {specialtiesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : specialties.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ToggleLeft className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No hay especialidades configuradas</p>
                <p className="text-sm">Crea especialidades para clasificar las derivaciones</p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Activa</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="w-[80px]">Prioridad</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {specialties.map(spec => (
                      <TableRow key={spec.id}>
                        <TableCell>
                          <Switch
                            checked={spec.active}
                            onCheckedChange={(active) => updateSpecialty.mutate({ id: spec.id, active })}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{spec.name}</TableCell>
                        <TableCell className="text-center text-muted-foreground">{spec.priority}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => handleEditSpec(spec)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setDeleteSpecId(spec.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Specialty Dialog */}
      <Dialog open={specDialogOpen} onOpenChange={setSpecDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSpec ? 'Editar especialidad' : 'Nueva especialidad'}</DialogTitle>
            <DialogDescription>
              Las especialidades se usan para filtrar profesionales en las derivaciones
            </DialogDescription>
          </DialogHeader>
          <SpecialtyForm
            specialty={editingSpec}
            onSubmit={handleSpecSubmit}
            onCancel={() => setSpecDialogOpen(false)}
            loading={createSpecialty.isPending || updateSpecialty.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Partner Dialog */}
      <Dialog open={partnerDialogOpen} onOpenChange={setPartnerDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPartner ? 'Editar profesional' : 'Nuevo profesional'}</DialogTitle>
            <DialogDescription>
              Añade un profesional de confianza para derivar pacientes
            </DialogDescription>
          </DialogHeader>
          <PartnerForm
            partner={editingPartner}
            specialties={specialties}
            onSubmit={handlePartnerSubmit}
            onCancel={() => setPartnerDialogOpen(false)}
            loading={createPartner.isPending || updatePartner.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Specialty Confirmation */}
      <AlertDialog open={!!deleteSpecId} onOpenChange={() => setDeleteSpecId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar especialidad?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Los profesionales que tengan esta especialidad asignada la perderán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSpec} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Partner Confirmation */}
      <AlertDialog open={!!deletePartnerId} onOpenChange={() => setDeletePartnerId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar profesional?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El profesional dejará de aparecer en las recomendaciones de derivación.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePartner} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
