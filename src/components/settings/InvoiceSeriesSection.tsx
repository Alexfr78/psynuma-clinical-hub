import { useState } from 'react';
import { Plus, Archive, RotateCcw, Star, MoreHorizontal, AlertTriangle, Pencil } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useInvoiceSeries, InvoiceSeries } from '@/hooks/useInvoiceSeries';
import { useCenter } from '@/hooks/useCenter';
import { useAuth } from '@/hooks/useAuth';
import { CreateSeriesDialog } from './CreateSeriesDialog';

export function InvoiceSeriesSection() {
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSeries, setEditingSeries] = useState<InvoiceSeries | null>(null);
  
  const { ordinarySeries, rectifyingSeries, archiveSeries, setDefaultSeries, restoreSeries, isLoading } = useInvoiceSeries(showArchived);
  const { center } = useCenter();
  const { isAdmin } = useAuth();

  const missingBillingInfo = !center?.tax_id || !center?.address;

  const handleSetDefault = (series: InvoiceSeries) => {
    setDefaultSeries.mutate({ id: series.id, seriesType: series.series_type });
  };

  const handleArchive = (series: InvoiceSeries) => {
    archiveSeries.mutate(series.id);
  };

  const handleRestore = (series: InvoiceSeries) => {
    restoreSeries.mutate(series.id);
  };

  const handleEdit = (series: InvoiceSeries) => {
    setEditingSeries(series);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingSeries(null);
  };

  const renderSeriesTable = (seriesList: InvoiceSeries[], title: string) => (
    <div className="space-y-3">
      <h4 className="font-medium">{title}</h4>
      {seriesList.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No hay series {showArchived ? 'archivadas' : ''} de este tipo
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Formato</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Próximo Nº</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {seriesList.map((series) => (
              <TableRow key={series.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {series.name}
                    {series.is_default && (
                      <Badge variant="secondary" className="text-xs">
                        <Star className="mr-1 h-3 w-3" />
                        Predeterminada
                      </Badge>
                    )}
                    {series.is_archived && (
                      <Badge variant="outline" className="text-xs">
                        Archivada
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {series.format}
                </TableCell>
                <TableCell>
                  <Badge variant={series.invoice_type === 'complete' ? 'default' : 'secondary'}>
                    {series.invoice_type === 'complete' ? 'Completa' : 'Simplificada'}
                  </Badge>
                </TableCell>
                <TableCell>{series.next_number}</TableCell>
                <TableCell>
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(series)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        {!series.is_archived && !series.is_default && (
                          <DropdownMenuItem onClick={() => handleSetDefault(series)}>
                            <Star className="mr-2 h-4 w-4" />
                            Predeterminada
                          </DropdownMenuItem>
                        )}
                        {series.is_archived ? (
                          <DropdownMenuItem onClick={() => handleRestore(series)}>
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Restaurar
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem 
                            onClick={() => handleArchive(series)}
                            disabled={series.is_default}
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            Archivar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Series y numeración</CardTitle>
              <CardDescription>
                Gestiona las series de numeración de tus facturas
              </CardDescription>
            </div>
            {isAdmin && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Añadir serie
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {missingBillingInfo && (
            <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-amber-700 dark:text-amber-400">
                Para poder crear facturas, necesitas completar tu información fiscal (NIF/CIF y dirección) 
                en la sección "Información de facturación".
              </AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="active" onValueChange={(v) => setShowArchived(v === 'archived')}>
            <TabsList>
              <TabsTrigger value="active">Todas las series</TabsTrigger>
              <TabsTrigger value="archived">Series archivadas</TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-6 space-y-8">
              {renderSeriesTable(ordinarySeries, 'Series ordinarias')}
              {renderSeriesTable(rectifyingSeries, 'Series rectificativas')}
            </TabsContent>

            <TabsContent value="archived" className="mt-6 space-y-8">
              {renderSeriesTable(ordinarySeries, 'Series ordinarias archivadas')}
              {renderSeriesTable(rectifyingSeries, 'Series rectificativas archivadas')}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <CreateSeriesDialog
        open={dialogOpen}
        onOpenChange={handleCloseDialog}
        editingSeries={editingSeries}
      />
    </>
  );
}
