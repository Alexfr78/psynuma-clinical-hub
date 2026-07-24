import { useState } from 'react';
import { Search, Loader2, UserCog, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useProfessionalsWithRoles } from '@/hooks/useProfessionals';
import { ProfessionalCard } from '@/components/professionals/ProfessionalCard';
import { ProfessionalDetailDialog } from '@/components/professionals/ProfessionalDetailDialog';
import { InviteProfessionalDialog } from '@/components/professionals/InviteProfessionalDialog';

export default function Professionals() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  const { data: professionals = [], isLoading } = useProfessionalsWithRoles();

  const filteredProfessionals = professionals.filter((prof) => {
    const fullName = `${prof.first_name || ''} ${prof.last_name || ''}`.toLowerCase();
    const search = searchQuery.toLowerCase();
    return (
      fullName.includes(search) ||
      prof.email.toLowerCase().includes(search) ||
      (prof.specialty || '').toLowerCase().includes(search)
    );
  });

  const handleProfessionalClick = (id: string) => {
    setSelectedProfessionalId(id);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Profesionales</h1>
          <p className="text-muted-foreground text-sm">
            Gestiona los profesionales del centro
          </p>
        </div>
        <Button onClick={() => setInviteDialogOpen(true)} className="w-full sm:w-auto">
          <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
          Invitar profesional
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 w-full sm:max-w-sm"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredProfessionals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <UserCog className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">No hay profesionales</h3>
          <p className="text-sm text-muted-foreground">
            {searchQuery
              ? 'No se encontraron profesionales con esos criterios'
              : 'Aún no hay profesionales registrados en el centro'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProfessionals.map((professional) => (
            <ProfessionalCard
              key={professional.id}
              professional={professional}
              onClick={() => handleProfessionalClick(professional.id)}
            />
          ))}
        </div>
      )}

      <ProfessionalDetailDialog
        professionalId={selectedProfessionalId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
      <InviteProfessionalDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
      />
    </div>
  );
}
