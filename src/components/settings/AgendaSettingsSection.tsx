import { useCenter } from '@/hooks/useCenter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Icon } from '@/components/ui/icon';


export function AgendaSettingsSection() {
  const { center, isLoading, updateCenter } = useCenter();

  const handleShowWeekendsChange = (checked: boolean) => {
    updateCenter.mutate({ agenda_show_weekends: checked });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración de la Agenda</CardTitle>
        <CardDescription>
          Personaliza cómo se muestra la agenda de citas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="show-weekends">Mostrar fines de semana</Label>
            <p className="text-sm text-muted-foreground">
              Mostrar sábado y domingo en la vista semanal de la agenda
            </p>
          </div>
          <Switch
            id="show-weekends"
            checked={center?.agenda_show_weekends !== false}
            onCheckedChange={handleShowWeekendsChange}
            disabled={updateCenter.isPending}
          />
        </div>
      </CardContent>
    </Card>
  );
}
