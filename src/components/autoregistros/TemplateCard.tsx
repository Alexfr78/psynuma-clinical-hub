import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, FileText, Pencil } from 'lucide-react';
import type { AutoregistroTemplate } from '@/hooks/useAutoregistroTemplates';

interface TemplateCardProps {
  template: AutoregistroTemplate;
  onDelete: (id: string) => void;
  onEdit: (template: AutoregistroTemplate) => void;
}

const TYPE_LABELS: Record<string, string> = {
  text: 'Texto',
  textarea: 'Texto largo',
  number: 'Número',
  date: 'Fecha',
  time: 'Hora',
  select: 'Selección',
  checkbox: 'Casilla',
  scale: 'Escala',
};

export function TemplateCard({ template, onDelete, onEdit }: TemplateCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <CardTitle className="text-base truncate">{template.name}</CardTitle>
          </div>
          <div className="flex shrink-0">
            <Button variant="ghost" size="icon" onClick={() => onEdit(template)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onDelete(template.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {template.description && (
          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{template.description}</p>
        )}
        <div className="flex flex-wrap gap-1">
          {template.fields.map((f, i) => (
            <Badge key={i} variant="secondary" className="text-xs">
              {f.label} ({TYPE_LABELS[f.type] || f.type})
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {template.fields.length} campo{template.fields.length !== 1 ? 's' : ''}
        </p>
      </CardContent>
    </Card>
  );
}
