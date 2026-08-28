import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { PAIInterpretation } from '@/hooks/usePAIInterpretation';
import { PAI_SCALE_LABELS } from '@/data/pai-template';
import { Icon } from '@/components/ui/icon';

interface PAIInterpretationPanelProps {
  interpretation: PAIInterpretation;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

function ValidityBadge({ estado }: { estado: 'válido' | 'cuestionable' | 'inválido' }) {
  const config = {
    'válido': { icon: CheckCircle, variant: 'default' as const, className: 'bg-green-600' },
    'cuestionable': { icon: AlertTriangle, variant: 'secondary' as const, className: 'bg-yellow-600' },
    'inválido': { icon: XCircle, variant: 'destructive' as const, className: '' },
  };

  const { icon: Icon, variant, className } = config[estado] || config.cuestionable;

  return (
    <Badge variant={variant} className={`gap-1 ${className}`}>
      <Icon className="h-3 w-3" />
      Protocolo {estado}
    </Badge>
  );
}

function RiskBadge({ nivel }: { nivel: string }) {
  const normalizedNivel = nivel.toLowerCase();
  
  if (normalizedNivel.includes('alto') || normalizedNivel.includes('elevado')) {
    return <Badge variant="destructive">{nivel}</Badge>;
  }
  if (normalizedNivel.includes('moderado') || normalizedNivel.includes('medio')) {
    return <Badge variant="secondary" className="bg-yellow-600">{nivel}</Badge>;
  }
  return <Badge variant="outline">{nivel}</Badge>;
}

export function PAIInterpretationPanel({ 
  interpretation, 
  onRegenerate,
  isRegenerating 
}: PAIInterpretationPanelProps) {
  // Handle raw interpretation (when JSON parsing failed)
  if (interpretation.rawInterpretation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Icon name="description" className="h-5 w-5" />
              Interpretación Clínica
            </span>
            {onRegenerate && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onRegenerate}
                disabled={isRegenerating}
              >
                {isRegenerating ? (
                  <Icon name="progress_activity" className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon name="refresh" className="h-4 w-4" />
                )}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap">
            {interpretation.rawInterpretation}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with validity and regenerate */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Icon name="shield" className="h-5 w-5" />
              Validez del Protocolo
            </CardTitle>
            {onRegenerate && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onRegenerate}
                disabled={isRegenerating}
                className="gap-2"
              >
                {isRegenerating ? (
                  <>
                    <Icon name="progress_activity" className="h-4 w-4 animate-spin" />
                    Regenerando...
                  </>
                ) : (
                  <>
                    <Icon name="refresh" className="h-4 w-4" />
                    Regenerar
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3">
            <ValidityBadge estado={interpretation.validez?.estado || 'cuestionable'} />
            <p className="text-sm text-muted-foreground">
              {interpretation.validez?.observaciones}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Executive Summary */}
      {interpretation.resumenEjecutivo && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Icon name="description" className="h-5 w-5" />
              Resumen Ejecutivo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{interpretation.resumenEjecutivo}</p>
          </CardContent>
        </Card>
      )}

      {/* Risks */}
      {interpretation.riesgos && (
        <Card className={
          interpretation.riesgos.nivelGlobal === 'alto' 
            ? 'border-destructive' 
            : interpretation.riesgos.nivelGlobal === 'moderado'
            ? 'border-yellow-500'
            : ''
        }>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Icon name="error" className="h-5 w-5" />
              Evaluación de Riesgos
              <RiskBadge nivel={`Nivel ${interpretation.riesgos.nivelGlobal}`} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {interpretation.riesgos.suicidio && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">Riesgo Suicida</span>
                    <RiskBadge nivel={interpretation.riesgos.suicidio.nivel} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {interpretation.riesgos.suicidio.observaciones}
                  </p>
                </div>
              </div>
            )}
            {interpretation.riesgos.violencia && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">Riesgo de Violencia</span>
                    <RiskBadge nivel={interpretation.riesgos.violencia.nivel} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {interpretation.riesgos.violencia.observaciones}
                  </p>
                </div>
              </div>
            )}
            {interpretation.riesgos.descompensacion && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">Riesgo de Descompensación</span>
                    <RiskBadge nivel={interpretation.riesgos.descompensacion.nivel} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {interpretation.riesgos.descompensacion.observaciones}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Clinical Profile */}
      {interpretation.perfilClinico && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Icon name="track_changes" className="h-5 w-5" />
              Perfil Clínico
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {interpretation.perfilClinico.escalasElevadas?.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Escalas Elevadas</h4>
                <div className="space-y-3">
                  {interpretation.perfilClinico.escalasElevadas.map((escala, i) => (
                    <div key={i} className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">
                          {escala.escala}
                          <span className="text-muted-foreground ml-2 font-normal">
                            {PAI_SCALE_LABELS[escala.escala]?.label || ''}
                          </span>
                        </span>
                        <Badge variant="secondary">T = {escala.puntuacionT}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{escala.interpretacion}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <Separator />
            
            <div>
              <h4 className="text-sm font-medium mb-2">Formulación Clínica Integrada</h4>
              <p className="text-sm text-muted-foreground">
                {interpretation.perfilClinico.formulacionIntegrada}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Diagnostic Hypotheses */}
      {interpretation.hipotesisDiagnosticas?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Icon name="warning" className="h-5 w-5" />
              Hipótesis Diagnósticas
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Estas son hipótesis clínicas, no diagnósticos cerrados DSM-5/CIE-11
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {interpretation.hipotesisDiagnosticas.map((hipotesis, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-primary mt-1">•</span>
                  {hipotesis}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Interventions */}
      {interpretation.intervenciones && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Icon name="lightbulb" className="h-5 w-5" />
              Recomendaciones de Intervención
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {interpretation.intervenciones.prioridades?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Prioridades Terapéuticas</h4>
                <ol className="space-y-1 list-decimal list-inside">
                  {interpretation.intervenciones.prioridades.map((prioridad, i) => (
                    <li key={i} className="text-sm text-muted-foreground">{prioridad}</li>
                  ))}
                </ol>
              </div>
            )}
            
            {interpretation.intervenciones.enfoqueSugerido && (
              <div>
                <h4 className="text-sm font-medium mb-2">Enfoque Sugerido</h4>
                <p className="text-sm text-muted-foreground">
                  {interpretation.intervenciones.enfoqueSugerido}
                </p>
              </div>
            )}
            
            {interpretation.intervenciones.precauciones?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 text-yellow-600">Precauciones</h4>
                <ul className="space-y-1">
                  {interpretation.intervenciones.precauciones.map((precaucion, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Icon name="warning" className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                      {precaucion}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
