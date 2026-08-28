import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

import { DCI_CUTOFFS } from '@/data/dci-template';
import { Icon } from '@/components/ui/icon';

interface DCIResultsViewProps {
  detScore: number;
  comScore: number;
  valScore: number;
}

export function DCIResultsView({ detScore, comScore, valScore }: DCIResultsViewProps) {
  const detMax = 70; // 10 items × 7
  const comMax = 70; // 10 items × 7
  const valMax = 14; // 2 items × 7

  const detClinical = detScore >= DCI_CUTOFFS.DET;
  const comClinical = comScore >= DCI_CUTOFFS.COM;
  const valWarning = valScore >= 10; // Alta validez puede indicar aquiescencia

  const detPercent = (detScore / detMax) * 100;
  const comPercent = (comScore / comMax) * 100;

  return (
    <div className="space-y-6">
      {/* Alerta de validez */}
      {valWarning && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Icon name="gpp_maybe" className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-200">
                  Advertencia de Validez
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  La puntuación en la escala de validez es elevada ({valScore}/14). 
                  Esto puede indicar un patrón de respuesta aquiescente o aleatorio. 
                  Interpretar los resultados con precaución.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Puntuaciones principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Distanciamiento */}
        <Card className={detClinical ? 'border-destructive' : ''}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Icon name="psychology" className="h-5 w-5 text-primary" />
                Distanciamiento
              </CardTitle>
              {detClinical && (
                <Badge variant="destructive" className="gap-1">
                  <Icon name="warning" className="h-3 w-3" />
                  Clínico
                </Badge>
              )}
            </div>
            <CardDescription>
              Experiencias de desconexión del presente y la realidad
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">{detScore}</span>
                <span className="text-muted-foreground text-sm">/ {detMax}</span>
              </div>
              <Progress 
                value={detPercent} 
                className={`h-3 ${detClinical ? '[&>div]:bg-destructive' : ''}`}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Punto de corte: {DCI_CUTOFFS.DET}</span>
                <span>{detClinical ? 'Nivel clínico' : 'Normal'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Compartimentación */}
        <Card className={comClinical ? 'border-destructive' : ''}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Icon name="extension" className="h-5 w-5 text-primary" />
                Compartimentación
              </CardTitle>
              {comClinical && (
                <Badge variant="destructive" className="gap-1">
                  <Icon name="warning" className="h-3 w-3" />
                  Clínico
                </Badge>
              )}
            </div>
            <CardDescription>
              División del self o experiencias fragmentadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">{comScore}</span>
                <span className="text-muted-foreground text-sm">/ {comMax}</span>
              </div>
              <Progress 
                value={comPercent} 
                className={`h-3 ${comClinical ? '[&>div]:bg-destructive' : ''}`}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Punto de corte: {DCI_CUTOFFS.COM}</span>
                <span>{comClinical ? 'Nivel clínico' : 'Normal'}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Interpretación clínica */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Interpretación Clínica</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {detClinical && (
            <div className="border-l-4 border-destructive pl-4">
              <p className="font-medium text-destructive">Distanciamiento Elevado</p>
              <p className="text-sm text-muted-foreground mt-1">
                La puntuación indica experiencias significativas de desrealización, 
                despersonalización y desconexión del entorno. Pueden incluir: 
                percepción alterada del tiempo, sensación de irrealidad, 
                estado de observador de uno mismo, y "lagunas" atencionales frecuentes.
              </p>
              <p className="text-sm mt-2">
                <strong>Sugerencias:</strong> Evaluar historia de trauma, 
                trastornos disociativos, y considerar intervenciones de 
                grounding y regulación emocional.
              </p>
            </div>
          )}

          {comClinical && (
            <div className="border-l-4 border-destructive pl-4">
              <p className="font-medium text-destructive">Compartimentación Elevada</p>
              <p className="text-sm text-muted-foreground mt-1">
                La puntuación indica experiencias de fragmentación del self, 
                sensación de partes separadas o conflictivas, emociones que 
                no se perciben como propias, y cambios conductuales notables.
              </p>
              <p className="text-sm mt-2">
                <strong>Sugerencias:</strong> Explorar posible estructura disociativa, 
                trabajo con partes (IFS, terapia de estados del yo), 
                y procesamiento de trauma si aplica.
              </p>
            </div>
          )}

          {!detClinical && !comClinical && (
            <div className="border-l-4 border-green-500 pl-4">
              <p className="font-medium text-green-700 dark:text-green-400">
                Puntuaciones dentro del rango normal
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Las puntuaciones en ambas escalas están por debajo de los 
                puntos de corte clínicos. No se identifican experiencias 
                disociativas significativas a través de este instrumento.
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground italic pt-2 border-t">
            El DCI evalúa dos tipos de experiencias disociativas: distanciamiento 
            (desconexión del entorno/presente) y compartimentación (fragmentación del self). 
            Puntos de corte basados en la adaptación española (Perona-Garcerán et al., 2021).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
