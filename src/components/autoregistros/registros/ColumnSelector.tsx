import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Settings2, RotateCcw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { FieldDisplayMeta } from '@/lib/autoregistro-field-display';

interface ColumnSelectorProps {
  allFields: FieldDisplayMeta[];
  visibleLabels: Set<string>;
  onToggle: (label: string, visible: boolean) => void;
  onReset: () => void;
  hasCustomConfig: boolean;
}

export function ColumnSelector({
  allFields,
  visibleLabels,
  onToggle,
  onReset,
  hasCustomConfig,
}: ColumnSelectorProps) {
  // Only show fields that can appear in table (not system/detail-only)
  const toggleableFields = allFields.filter((m) => m.visibility !== 'system' && !m.detailOnly);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">Columnas</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <p className="text-sm font-medium">Columnas visibles</p>
          {hasCustomConfig && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={onReset}
            >
              <RotateCcw className="h-3 w-3" />
              Restaurar
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-72">
          <div className="p-3 space-y-2">
            {toggleableFields.map((meta) => {
              const checked = visibleLabels.has(meta.field.label);
              return (
                <div key={meta.field.label} className="flex items-center gap-2">
                  <Checkbox
                    id={`col-${meta.field.label}`}
                    checked={checked}
                    onCheckedChange={(v) => onToggle(meta.field.label, !!v)}
                  />
                  <Label
                    htmlFor={`col-${meta.field.label}`}
                    className="text-sm cursor-pointer flex-1 leading-tight"
                  >
                    {meta.field.label}
                    <span className="text-xs text-muted-foreground ml-1">
                      ({meta.field.type})
                    </span>
                  </Label>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
