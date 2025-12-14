import { useState, useRef, useCallback, useEffect } from 'react';
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
  Heading3,
  List, 
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type
} from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function TemplateEditor({ value, onChange }: TemplateEditorProps) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const editorRef = useRef<HTMLDivElement>(null);
  const isInitialized = useRef(false);

  // Initialize content only once
  useEffect(() => {
    if (editorRef.current && !isInitialized.current) {
      editorRef.current.innerHTML = value;
      isInitialized.current = true;
    }
  }, [value]);

  // Sync external value changes (e.g., when loading a template)
  useEffect(() => {
    if (editorRef.current && isInitialized.current) {
      // Only update if value is completely different (not just typing)
      const currentContent = editorRef.current.innerHTML;
      if (value !== currentContent && value.length === 0) {
        editorRef.current.innerHTML = value;
      }
    }
  }, [value]);

  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
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

  const handleFontSize = useCallback((size: string) => {
    execCommand('fontSize', size);
  }, [execCommand]);

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
      '{campos_verificacion}': '<div class="bg-muted/50 p-3 rounded border my-2 text-sm">[Campos de verificación aparecerán aquí]</div>',
    };

    Object.entries(exampleValues).forEach(([key, val]) => {
      preview = preview.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), 
        key === '{campos_verificacion}' ? val : `<mark class="bg-primary/20 px-1 rounded">${val}</mark>`);
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
            
            {/* Font Size */}
            <Select onValueChange={handleFontSize}>
              <SelectTrigger className="h-8 w-[100px] text-xs">
                <Type className="mr-1 h-3 w-3" />
                <SelectValue placeholder="Tamaño" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Muy pequeño</SelectItem>
                <SelectItem value="2">Pequeño</SelectItem>
                <SelectItem value="3">Normal</SelectItem>
                <SelectItem value="4">Mediano</SelectItem>
                <SelectItem value="5">Grande</SelectItem>
                <SelectItem value="6">Muy grande</SelectItem>
                <SelectItem value="7">Enorme</SelectItem>
              </SelectContent>
            </Select>
            
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
            <Toggle
              size="sm"
              onPressedChange={() => execCommand('formatBlock', 'h3')}
              aria-label="Título 3"
            >
              <Heading3 className="h-4 w-4" />
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
            className="min-h-[400px] rounded-md border bg-background p-4 focus:outline-none focus:ring-2 focus:ring-ring prose prose-sm max-w-none dark:prose-invert [&_font[size='1']]:text-xs [&_font[size='2']]:text-sm [&_font[size='3']]:text-base [&_font[size='4']]:text-lg [&_font[size='5']]:text-xl [&_font[size='6']]:text-2xl [&_font[size='7']]:text-3xl"
            onInput={handleInput}
            onPaste={handlePaste}
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
