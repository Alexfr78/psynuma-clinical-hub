import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { TemplateVariables } from './TemplateVariables';
import { 
  Eye, 
  Code, 
  Bold, 
  Italic, 
  Underline,
  Heading1, 
  Heading2, 
  List, 
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight
} from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';

interface TemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function TemplateEditor({ value, onChange }: TemplateEditorProps) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const editorRef = useRef<HTMLDivElement>(null);

  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    // Update the value after command execution
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
    editorRef.current?.focus();
  }, [onChange]);

  const insertVariable = useCallback((variable: string) => {
    if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand('insertText', false, variable);
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  const renderPreview = () => {
    let preview = value;
    const exampleValues: Record<string, string> = {
      '{nombre_paciente}': 'María',
      '{apellidos_paciente}': 'García López',
      '{dni_paciente}': '12345678A',
      '{fecha_nacimiento}': '15/03/1990',
      '{nombre_tutor}': 'Juan García',
      '{relacion_tutor}': 'Padre',
      '{nombre_profesional}': 'Dr. López',
      '{especialidad}': 'Psicología Clínica',
      '{nombre_centro}': 'Centro Psycma',
      '{direccion_centro}': 'C/ Gran Vía 123, Madrid',
      '{fecha_actual}': new Date().toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    };

    Object.entries(exampleValues).forEach(([key, val]) => {
      preview = preview.replace(new RegExp(key, 'g'), `<mark class="bg-primary/20 px-1 rounded">${val}</mark>`);
    });

    return preview;
  };

  return (
    <div className="space-y-4">
      <TemplateVariables onInsert={insertVariable} />
      
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'edit' | 'preview')}>
        <TabsList>
          <TabsTrigger value="edit" className="gap-2">
            <Code className="h-4 w-4" />
            Editor
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-2">
            <Eye className="h-4 w-4" />
            Vista previa
          </TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="mt-4 space-y-2">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/50 p-1">
            <Toggle
              size="sm"
              onPressedChange={() => execCommand('bold')}
              aria-label="Negrita"
            >
              <Bold className="h-4 w-4" />
            </Toggle>
            <Toggle
              size="sm"
              onPressedChange={() => execCommand('italic')}
              aria-label="Cursiva"
            >
              <Italic className="h-4 w-4" />
            </Toggle>
            <Toggle
              size="sm"
              onPressedChange={() => execCommand('underline')}
              aria-label="Subrayado"
            >
              <Underline className="h-4 w-4" />
            </Toggle>
            
            <Separator orientation="vertical" className="mx-1 h-6" />
            
            <Toggle
              size="sm"
              onPressedChange={() => execCommand('formatBlock', 'h1')}
              aria-label="Título 1"
            >
              <Heading1 className="h-4 w-4" />
            </Toggle>
            <Toggle
              size="sm"
              onPressedChange={() => execCommand('formatBlock', 'h2')}
              aria-label="Título 2"
            >
              <Heading2 className="h-4 w-4" />
            </Toggle>
            
            <Separator orientation="vertical" className="mx-1 h-6" />
            
            <Toggle
              size="sm"
              onPressedChange={() => execCommand('insertUnorderedList')}
              aria-label="Lista"
            >
              <List className="h-4 w-4" />
            </Toggle>
            <Toggle
              size="sm"
              onPressedChange={() => execCommand('insertOrderedList')}
              aria-label="Lista numerada"
            >
              <ListOrdered className="h-4 w-4" />
            </Toggle>
            
            <Separator orientation="vertical" className="mx-1 h-6" />
            
            <Toggle
              size="sm"
              onPressedChange={() => execCommand('justifyLeft')}
              aria-label="Alinear izquierda"
            >
              <AlignLeft className="h-4 w-4" />
            </Toggle>
            <Toggle
              size="sm"
              onPressedChange={() => execCommand('justifyCenter')}
              aria-label="Centrar"
            >
              <AlignCenter className="h-4 w-4" />
            </Toggle>
            <Toggle
              size="sm"
              onPressedChange={() => execCommand('justifyRight')}
              aria-label="Alinear derecha"
            >
              <AlignRight className="h-4 w-4" />
            </Toggle>
          </div>

          {/* Editor */}
          <div
            ref={editorRef}
            contentEditable
            className="min-h-[400px] rounded-md border bg-background p-4 focus:outline-none focus:ring-2 focus:ring-ring prose prose-sm max-w-none dark:prose-invert"
            onInput={handleInput}
            onPaste={handlePaste}
            dangerouslySetInnerHTML={{ __html: value }}
            suppressContentEditableWarning
          />
          <p className="text-xs text-muted-foreground">
            Usa los botones de la barra de herramientas para dar formato al texto y las variables dinámicas.
          </p>
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <Card className="min-h-[400px] overflow-auto p-6">
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: renderPreview() }}
            />
          </Card>
          <p className="mt-2 text-xs text-muted-foreground">
            Los valores resaltados son ejemplos de cómo se verán las variables al generar el documento.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
