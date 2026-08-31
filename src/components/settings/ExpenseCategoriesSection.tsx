import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Icon } from '@/components/ui/icon';
import { useAuth } from '@/hooks/useAuth';
import {
  useExpenseCategories,
  useCreateExpenseCategory,
  useUpdateExpenseCategory,
  useDeleteExpenseCategory,
} from '@/hooks/useExpenseCategories';

const COLOR_OPTIONS = ['#EF4444', '#F59E0B', '#6366F1', '#0EA5E9', '#22C55E', '#14B8A6', '#EC4899', '#8B5CF6', '#0891B2', '#64748B'];

export function ExpenseCategoriesSection() {
  const { isAdmin } = useAuth();
  const { data: categories, isLoading } = useExpenseCategories(true);
  const createCategory = useCreateExpenseCategory();
  const updateCategory = useUpdateExpenseCategory();
  const deleteCategory = useDeleteExpenseCategory();

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLOR_OPTIONS[0]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const maxOrder = Math.max(0, ...(categories ?? []).map((c) => c.display_order));
    await createCategory.mutateAsync({ name: newName.trim(), color: newColor, display_order: maxOrder + 1 });
    setNewName('');
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
        <CardTitle>Categorías de gasto</CardTitle>
        <CardDescription>
          Categoriza los gastos del centro. La categoría marcada como "Pagos a profesionales" se usa
          automáticamente para las liquidaciones generadas por el sistema.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {categories?.map((category) => (
          <div key={category.id} className="flex items-center gap-3 rounded-lg border p-3">
            <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
            <span className={`flex-1 text-sm ${!category.is_active ? 'text-muted-foreground line-through' : ''}`}>
              {category.name}
            </span>
            {category.is_professional_payment_category && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Pagos a profesionales</span>
            )}
            {isAdmin && (
              <Switch
                checked={category.is_active}
                onCheckedChange={(checked) => updateCategory.mutate({ id: category.id, is_active: checked })}
              />
            )}
            {isAdmin && !category.is_professional_payment_category && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => deleteCategory.mutate(category.id)}
              >
                <Icon name="delete" className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
            <Input
              placeholder="Nueva categoría..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 min-w-[160px]"
            />
            <div className="flex gap-1">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewColor(color)}
                  className={`h-6 w-6 rounded-full border-2 ${newColor === color ? 'border-foreground' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <Button onClick={handleAdd} disabled={createCategory.isPending || !newName.trim()}>
              <Icon name="add" className="h-4 w-4 mr-2" />
              Añadir
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
