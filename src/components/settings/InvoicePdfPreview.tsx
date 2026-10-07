import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

interface InvoicePdfPreviewProps {
  bytes: Uint8Array | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo mostrar la vista previa';
}

export function InvoicePdfPreview({ bytes, isLoading, isFetching, error }: InvoicePdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [renderError, setRenderError] = useState<unknown>(null);
  const [hasRenderedPage, setHasRenderedPage] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const updateWidth = () => setContainerWidth(element.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!bytes) return;
    let disposed = false;
    let loadingTask: ReturnType<(typeof import('pdfjs-dist'))['getDocument']> | null = null;

    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        loadingTask = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false });
        const nextDocument = await loadingTask.promise;
        if (disposed) {
          await nextDocument.destroy();
          return;
        }
        renderTaskRef.current?.cancel();
        const previousDocument = documentRef.current;
        documentRef.current = nextDocument;
        setDocument(nextDocument);
        setPageNumber((current) => Math.min(current, nextDocument.numPages));
        setRenderError(null);
        if (previousDocument) await previousDocument.destroy();
      } catch (loadError) {
        if (!disposed) setRenderError(loadError);
      }
    })();

    return () => {
      disposed = true;
      loadingTask?.destroy();
    };
  }, [bytes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!document || !canvas || containerWidth <= 0) return;
    let disposed = false;

    void (async () => {
      try {
        renderTaskRef.current?.cancel();
        const page = await document.getPage(pageNumber);
        if (disposed) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const cssScale = containerWidth / baseViewport.width;
        const pixelRatio = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: cssScale * pixelRatio });
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('No se pudo preparar el visor del PDF');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(baseViewport.width * cssScale)}px`;
        canvas.style.height = `${Math.floor(baseViewport.height * cssScale)}px`;
        const renderTask = page.render({ canvasContext: context, viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (!disposed) {
          setHasRenderedPage(true);
          setRenderError(null);
        }
      } catch (pageError) {
        if (!disposed && (pageError as { name?: string }).name !== 'RenderingCancelledException') setRenderError(pageError);
      }
    })();

    return () => {
      disposed = true;
      renderTaskRef.current?.cancel();
    };
  }, [containerWidth, document, pageNumber]);

  useEffect(() => () => {
    renderTaskRef.current?.cancel();
    void documentRef.current?.destroy();
    documentRef.current = null;
  }, []);

  const displayedError = error ?? renderError;
  const showInitialLoading = !hasRenderedPage && (isLoading || isFetching || !!bytes);

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="relative mx-auto aspect-[210/297] w-full overflow-hidden border bg-white shadow-sm" aria-busy={isFetching}>
        <canvas ref={canvasRef} className="block max-w-full bg-white" aria-label={`Vista previa de la factura, página ${pageNumber}`} />
        {showInitialLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white text-muted-foreground">
            <Icon name="progress_activity" className="h-6 w-6 animate-spin" />
            <span className="sr-only">Generando vista previa</span>
          </div>
        )}
        {isFetching && hasRenderedPage && (
          <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
            <Icon name="progress_activity" className="h-3.5 w-3.5 animate-spin" />
            Actualizando
          </div>
        )}
        {displayedError && !isFetching && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white p-6 text-center text-sm text-destructive" role="alert">
            <Icon name="error" className="h-6 w-6" />
            <span>{errorMessage(displayedError)}</span>
          </div>
        )}
      </div>
      {document && document.numPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button type="button" variant="outline" size="icon" className="h-10 w-10" onClick={() => setPageNumber((page) => Math.max(1, page - 1))} disabled={pageNumber === 1} aria-label="Página anterior">
            <Icon name="chevron_left" className="h-5 w-5" />
          </Button>
          <span className="min-w-28 text-center text-sm text-muted-foreground">Página {pageNumber} de {document.numPages}</span>
          <Button type="button" variant="outline" size="icon" className="h-10 w-10" onClick={() => setPageNumber((page) => Math.min(document.numPages, page + 1))} disabled={pageNumber === document.numPages} aria-label="Página siguiente">
            <Icon name="chevron_right" className="h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
