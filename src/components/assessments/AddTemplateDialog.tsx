import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, Plus, Loader2, Check } from 'lucide-react';
import { useAssessmentTemplates } from '@/hooks/useAssessmentTemplates';
import { getPAITemplateData } from '@/data/pai-template';
import { getBDI2TemplateData } from '@/data/bdi2-template';
import { getDCITemplateData } from '@/data/dci-template';
import { getDESTemplateData } from '@/data/des-template';
import { getSTAITemplateData } from '@/data/stai-template';
import { getEMOTemplateData } from '@/data/emo-template';
import { getYBOCS2TemplateData } from '@/data/ybocs2-template';
import { toast } from 'sonner';

interface AddTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PREDEFINED_TEMPLATES = [
  {
    id: 'BDI2',
    name: 'BDI-II - Inventario de Depresión de Beck-II',
    description: 'Evaluación de la presencia y gravedad de síntomas depresivos en adultos y adolescentes. Marco temporal: últimas dos semanas.',
    items: 21,
    time: '5-10 min',
    getData: getBDI2TemplateData,
  },
  {
    id: 'DCI',
    name: 'DCI - Inventario de Distanciamiento y Compartimentación',
    description: 'Evaluación de experiencias disociativas: distanciamiento del presente y compartimentación del self.',
    items: 22,
    time: '5-10 min',
    getData: getDCITemplateData,
  },
  {
    id: 'DES',
    name: 'DES - Escala de Experiencias Disociativas',
    description: 'Evaluación de experiencias disociativas: amnesia, despersonalización, absorción y taxón disociativo.',
    items: 28,
    time: '10-15 min',
    getData: getDESTemplateData,
  },
  {
    id: 'PAI_V1',
    name: 'PAI - Inventario de Evaluación de la Personalidad',
    description: 'Evaluación multidimensional de la personalidad y psicopatología para adultos. Incluye 22 escalas principales y 31 subescalas.',
    items: 344,
    time: '45-60 min',
    getData: getPAITemplateData,
  },
  {
    id: 'STAI',
    name: 'STAI - Cuestionario de Ansiedad Estado Rasgo',
    description: 'Evaluación diferenciada de la ansiedad como estado emocional transitorio y como rasgo estable de personalidad.',
    items: 40,
    time: '10-15 min',
    getData: getSTAITemplateData,
  },
  {
    id: 'EMO',
    name: 'EMO - Entrevista de Regulación Emocional',
    description: 'Entrevista semi-estructurada para evaluar patrones de regulación emocional, historia de figuras reguladoras y calidad del apego temprano. Desarrollada por Anabel González.',
    items: 35,
    time: '45-60 min',
    getData: getEMOTemplateData,
  },
];

export function AddTemplateDialog({ open, onOpenChange }: AddTemplateDialogProps) {
  const { templates, createTemplate } = useAssessmentTemplates();
  const [adding, setAdding] = useState<string | null>(null);

  const existingCodes = templates.map(t => t.code);

  const handleAdd = async (template: typeof PREDEFINED_TEMPLATES[0]) => {
    setAdding(template.id);
    try {
      const data = template.getData();
      await createTemplate.mutateAsync(data as any);
      toast.success(`Plantilla "${template.name}" añadida correctamente`);
    } catch (error) {
      console.error('Error adding template:', error);
    } finally {
      setAdding(null);
    }
  };

  const availableTemplates = PREDEFINED_TEMPLATES.filter(t => !existingCodes.includes(t.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Añadir plantilla de evaluación
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {availableTemplates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Check className="h-12 w-12 mx-auto mb-4 text-primary" />
              <p>Ya tienes todas las plantillas disponibles</p>
            </div>
          ) : (
            availableTemplates.map(template => (
              <Card key={template.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <CardDescription className="mt-1">{template.description}</CardDescription>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAdd(template)}
                      disabled={adding === template.id}
                    >
                      {adding === template.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-1" />
                          Añadir
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex gap-2">
                    <Badge variant="secondary">{template.items} ítems</Badge>
                    <Badge variant="outline">{template.time}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
