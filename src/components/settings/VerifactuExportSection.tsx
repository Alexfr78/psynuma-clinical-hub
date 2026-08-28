import { useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Icon } from '@/components/ui/icon';

export function VerifactuExportSection() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [includeEvents, setIncludeEvents] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-verifactu-records', {
        body: {
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          include_events: includeEvents
        }
      });

      if (error) throw error;

      // Create and download the file
      const blob = new Blob([data], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `verifactu_export_${new Date().toISOString().split('T')[0]}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Exportación completada');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Error al exportar los registros');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon name="description" className="h-5 w-5 text-primary" />
          <CardTitle>Exportar Registros VeriFactu</CardTitle>
        </div>
        <CardDescription>
          Exporta todos los registros de facturación en formato XML compatible con AEAT
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="start_date">Fecha inicio (opcional)</Label>
            <div className="relative">
              <Icon name="calendar_month" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="start_date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="end_date">Fecha fin (opcional)</Label>
            <div className="relative">
              <Icon name="calendar_month" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="end_date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="include_events"
            checked={includeEvents}
            onCheckedChange={(checked) => setIncludeEvents(checked === true)}
          />
          <Label htmlFor="include_events" className="text-sm font-normal">
            Incluir registro de eventos (auditoría)
          </Label>
        </div>

        <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
          <p>
            El archivo XML exportado incluye todos los registros de facturación firmados 
            con VeriFactu, el registro de eventos y la declaración responsable del software. 
            Este archivo cumple con los requisitos de exportación establecidos por la AEAT.
          </p>
        </div>

        <Button onClick={handleExport} disabled={isExporting} className="w-full sm:w-auto">
          {isExporting ? (
            <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Icon name="download" className="mr-2 h-4 w-4" />
          )}
          Exportar XML
        </Button>
      </CardContent>
    </Card>
  );
}