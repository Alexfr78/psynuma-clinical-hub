import { useState } from 'react';
import { Package, Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useBonos } from '@/hooks/useBonos';
import { BonoCard } from '@/components/bonos/BonoCard';
import { CreateBonoDialog } from '@/components/bonos/CreateBonoDialog';
import { BonoTemplatesDialog } from '@/components/bonos/BonoTemplatesDialog';

export default function Bonos() {
  const [createOpen, setCreateOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('active');

  const { data: bonos, isLoading } = useBonos({ status: statusFilter === 'all' ? undefined : statusFilter });

  const stats = {
    active: bonos?.filter(b => b.status === 'active').length || 0,
    exhausted: bonos?.filter(b => b.status === 'exhausted').length || 0,
    expired: bonos?.filter(b => b.status === 'expired').length || 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">Bonos</h1>
          <p className="text-muted-foreground">Gestiona los paquetes de sesiones</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Plantillas
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo bono
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Activos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Agotados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.exhausted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Expirados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.expired}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="active">Activos</TabsTrigger>
          <TabsTrigger value="exhausted">Agotados</TabsTrigger>
          <TabsTrigger value="expired">Expirados</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>

        <TabsContent value={statusFilter} className="mt-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : !bonos || bonos.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
              <Package className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 font-semibold">Sin bonos</h3>
              <p className="text-sm text-muted-foreground">No hay bonos en esta categoría</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {bonos.map(bono => (
                <BonoCard key={bono.id} bono={bono} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CreateBonoDialog open={createOpen} onOpenChange={setCreateOpen} />
      <BonoTemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} />
    </div>
  );
}
