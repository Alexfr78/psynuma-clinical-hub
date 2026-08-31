import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { IntakeRequestDetailDialog } from '@/components/intake/IntakeRequestDetailDialog';
import { 
  useIntakeRequests, 
  type IntakeRequest, 
  type IntakeRequestStatus, 
  type IntakeRequestType 
} from '@/hooks/useIntakeRequests';
import { Icon } from '@/components/ui/icon';

export default function IntakeRequests() {
  const [typeFilter, setTypeFilter] = useState<IntakeRequestType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<IntakeRequestStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<IntakeRequest | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { 
    requests, 
    isLoading, 
    markAsContacted, 
    markAsClosed, 
    updateInternalNotes,
    updateStatus 
  } = useIntakeRequests({
    type: typeFilter === 'all' ? null : typeFilter,
    status: statusFilter === 'all' ? null : statusFilter,
    search: searchQuery || undefined,
  });

  const handleViewDetail = (request: IntakeRequest) => {
    setSelectedRequest(request);
    setDetailOpen(true);
  };

  const handleStatusChange = async (id: string, newStatus: IntakeRequestStatus) => {
    await updateStatus(id, newStatus);
  };

  const statusBadge = (status: IntakeRequestStatus) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Pendiente</Badge>;
      case 'contacted':
        return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Contactado</Badge>;
      case 'converted':
        return <Badge variant="outline" className="bg-success/10 text-success border-success/30">Convertido</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-muted text-muted-foreground">Cerrado</Badge>;
    }
  };

  const typeBadge = (type: IntakeRequestType) => {
    return type === 'waitlist' 
      ? <Badge variant="secondary" className="gap-1"><Icon name="schedule" className="h-3 w-3" />Espera</Badge>
      : <Badge variant="secondary" className="gap-1"><Icon name="group" className="h-3 w-3" />Derivación</Badge>;
  };

  // Stats
  const stats = useMemo(() => {
    const pending = requests.filter(r => r.status === 'pending').length;
    const contacted = requests.filter(r => r.status === 'contacted').length;
    const closed = requests.filter(r => r.status === 'cancelled').length;
    return { pending, contacted, closed, total: requests.length };
  }, [requests]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Icon name="checklist" className="h-6 w-6" />
            Solicitudes
          </h1>
          <p className="text-muted-foreground">
            Gestiona las solicitudes de lista de espera y derivaciones
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pendientes</CardDescription>
            <CardTitle className="text-2xl text-warning">{stats.pending}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Contactados</CardDescription>
            <CardTitle className="text-2xl text-primary">{stats.contacted}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cerrados</CardDescription>
            <CardTitle className="text-2xl text-muted-foreground">{stats.closed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as IntakeRequestType | 'all')}>
                <SelectTrigger className="w-[140px]">
                  <Icon name="filter_list" className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="waitlist">Lista de espera</SelectItem>
                  <SelectItem value="referral">Derivación</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as IntakeRequestStatus | 'all')}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="contacted">Contactado</SelectItem>
                  <SelectItem value="cancelled">Cerrado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Icon name="checklist" className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-medium">No hay solicitudes</h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery || typeFilter !== 'all' || statusFilter !== 'all' 
                  ? 'Prueba a cambiar los filtros'
                  : 'Las solicitudes de lista de espera y derivación aparecerán aquí'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="hidden md:table-cell">Contacto</TableHead>
                    <TableHead className="hidden lg:table-cell">Modalidad / Zona</TableHead>
                    <TableHead className="hidden lg:table-cell">Especialidad</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden sm:table-cell">RGPD</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => {
                    const referralContext = request.referral_context;
                    const location = [referralContext?.city, referralContext?.province]
                      .filter(Boolean)
                      .join(', ');

                    return (
                      <TableRow key={request.id}>
                        <TableCell className="whitespace-nowrap">
                          <span className="text-sm">
                            {format(new Date(request.created_at), 'd MMM', { locale: es })}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {format(new Date(request.created_at), 'HH:mm')}
                          </span>
                        </TableCell>
                        <TableCell>{typeBadge(request.request_type)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{request.first_name} {request.last_name}</div>
                          <div className="text-xs text-muted-foreground md:hidden">
                            {request.email}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-1 text-sm">
                            <Icon name="mail" className="h-3 w-3 text-muted-foreground" />
                            {request.email}
                          </div>
                          {request.phone && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Icon name="call" className="h-3 w-3" />
                              {request.phone}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {request.modality && (
                            <span className="capitalize text-sm">{request.modality}</span>
                          )}
                          {location && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Icon name="location_on" className="h-3 w-3" />
                              {location}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {request.specialty && (
                            <span className="text-sm">{request.specialty}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select 
                            value={request.status} 
                            onValueChange={(v) => handleStatusChange(request.id, v as IntakeRequestStatus)}
                          >
                            <SelectTrigger className="h-8 w-[120px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">
                                <span className="flex items-center gap-1">
                                  <span className="h-2 w-2 rounded-full bg-warning" />
                                  Pendiente
                                </span>
                              </SelectItem>
                              <SelectItem value="contacted">
                                <span className="flex items-center gap-1">
                                  <span className="h-2 w-2 rounded-full bg-primary" />
                                  Contactado
                                </span>
                              </SelectItem>
                              <SelectItem value="cancelled">
                                <span className="flex items-center gap-1">
                                  <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                                  Cerrado
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {request.privacy_accepted ? (
                            <Icon name="shield" className="h-4 w-4 text-success" />
                          ) : (
                            <Icon name="shield" className="h-4 w-4 text-muted-foreground/30" />
                          )}
                        </TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => handleViewDetail(request)}
                          >
                            <Icon name="visibility" className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <IntakeRequestDetailDialog
        request={selectedRequest}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onMarkContacted={markAsContacted}
        onMarkClosed={markAsClosed}
        onUpdateNotes={updateInternalNotes}
      />
    </div>
  );
}
