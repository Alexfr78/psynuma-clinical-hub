import { useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import DOMPurify from 'dompurify';
import { Icon } from '@/components/ui/icon';

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'div', 'span'],
  ALLOWED_ATTR: [] as string[],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style'],
};

export function sanitizeDescription(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

interface RichDescriptionEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function RichDescriptionEditor({ value, onChange, placeholder }: RichDescriptionEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

  // Sync external value changes (e.g. on dialog open)
  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      const sanitized = sanitizeDescription(value);
      if (editorRef.current.innerHTML !== sanitized) {
        editorRef.current.innerHTML = sanitized;
      }
    }
    isInternalChange.current = false;
  }, [value]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    isInternalChange.current = true;
    const raw = editorRef.current.innerHTML;
    const clean = sanitizeDescription(raw);
    onChange(clean);
  }, [onChange]);

  const exec = useCallback((command: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, val);
    handleInput();
  }, [handleInput]);

  const tools = [
    { icon: 'format_bold', command: 'bold', label: 'Negrita' },
    { icon: 'format_italic', command: 'italic', label: 'Cursiva' },
    { icon: 'list', command: 'insertUnorderedList', label: 'Lista' },
    { icon: 'format_list_numbered', command: 'insertOrderedList', label: 'Lista numerada' },
  ] as const;

  return (
    <div className="rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-input px-1 py-1">
        {tools.map((t) => (
          <Button
            key={t.command}
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={t.label}
            onMouseDown={(e) => {
              e.preventDefault(); // keep focus in editor
              exec(t.command);
            }}
          >
            <Icon name={t.icon} className="h-3.5 w-3.5" />
          </Button>
        ))}
      </div>

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder ?? 'Instrucciones para el paciente...'}
        className={cn(
          'min-h-[60px] max-h-[200px] overflow-y-auto px-3 py-2 text-sm outline-none',
          'empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none',
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
        )}
      />
    </div>
  );
}
