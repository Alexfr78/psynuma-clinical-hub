import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { useCenter } from '@/hooks/useCenter';
import { qk } from '@/lib/query-keys';
import { describeEdgeFunctionError } from '@/lib/edge-function-error';
import { normalizeDesign, type InvoiceDesignDraft } from '@/lib/invoice-design';

// La firma va al bucket privado invoice-documents; solo el admin puede leerla
// y escribirla, y solo en estas dos rutas (policies + CHECK en centers).
const SIGNATURE_BUCKET = 'invoice-documents';
const SIGNATURE_URL_TTL_SECONDS = 60 * 10;
const LOGO_BUCKET = 'invoice-logos';

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_SIGNATURE_BYTES = 1024 * 1024;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * PDF real de una factura de muestra con el borrador sin guardar.
 * `draft` debe llegar ya con debounce: cada cambio de clave genera un PDF.
 */
export function useInvoiceDesignPreview(draft: InvoiceDesignDraft, enabled = true) {
  const { center, centerId } = useCenter();
  // Logo y firma no van en el borrador: si cambian, la vista previa se rehace.
  const assetsVersion = [center?.invoice_logo_url ?? '', center?.invoice_signature_path ?? '', center?.updated_at ?? ''].join('|');
  const normalized = normalizeDesign(draft);

  return useQuery({
    queryKey: qk.invoiceDesign.preview(centerId, normalized, assetsVersion),
    enabled: enabled && !!centerId,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-invoice-pdf', {
        body: { preview: true, overrides: normalized },
      });
      if (error) throw new Error(await describeEdgeFunctionError(error, 'No se pudo generar la vista previa'));
      const base64 = (data as { pdf_base64?: string } | null)?.pdf_base64;
      if (!base64) throw new Error('No se pudo generar la vista previa');
      return base64ToBytes(base64);
    },
  });
}

/** URL firmada de la firma guardada (solo para mostrarla en ajustes). */
export function useInvoiceSignatureUrl() {
  const { center, centerId } = useCenter();
  const path = center?.invoice_signature_path ?? null;
  return useQuery({
    queryKey: qk.invoiceDesign.signatureUrl(centerId, path),
    enabled: !!centerId && !!path,
    staleTime: (SIGNATURE_URL_TTL_SECONDS - 60) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(SIGNATURE_BUCKET)
        .createSignedUrl(path!, SIGNATURE_URL_TTL_SECONDS);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

/** Guarda los campos cambiados del borrador. */
export function useSaveInvoiceDesign() {
  const { updateCenter } = useCenter();
  return useMutation({
    mutationFn: async (changes: Partial<InvoiceDesignDraft>) => {
      if (Object.keys(changes).length === 0) return;
      await updateCenter.mutateAsync(changes);
    },
  });
}

export function useInvoiceLogo() {
  const { center, centerId, updateCenter } = useCenter();
  const queryClient = useQueryClient();

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!centerId) throw new Error('No hay centro');
      if (!file.type.startsWith('image/')) throw new Error('Selecciona una imagen válida');
      if (file.size > MAX_LOGO_BYTES) throw new Error('La imagen no puede superar 2MB');
      const ext = file.name.split('.').pop();
      const fileName = `${centerId}/logo.${ext}`;
      const { error } = await supabase.storage.from(LOGO_BUCKET).upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(fileName);
      // El nombre del archivo no cambia al reemplazarlo: el parámetro evita la caché.
      await updateCenter.mutateAsync({ invoice_logo_url: `${publicUrl}?v=${Date.now()}` });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.invoiceDesign.all }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!center?.invoice_logo_url) return;
      const fileName = center.invoice_logo_url.split('?')[0].split('/').slice(-2).join('/');
      await supabase.storage.from(LOGO_BUCKET).remove([fileName]);
      await updateCenter.mutateAsync({ invoice_logo_url: null });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.invoiceDesign.all }),
  });

  return { upload, remove };
}

export function useInvoiceSignature() {
  const { center, centerId, updateCenter } = useCenter();
  const queryClient = useQueryClient();
  const currentPath = center?.invoice_signature_path ?? null;

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!centerId) throw new Error('No hay centro');
      // pdf-lib solo incrusta PNG y JPG
      if (file.type !== 'image/png' && file.type !== 'image/jpeg') throw new Error('La firma debe ser una imagen PNG o JPG');
      if (file.size > MAX_SIGNATURE_BYTES) throw new Error('La imagen de la firma no puede superar 1MB');
      const ext = file.type === 'image/png' ? 'png' : 'jpg';
      const path = `${centerId}/branding/invoice-signature.${ext}`;
      const { error } = await supabase.storage
        .from(SIGNATURE_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      if (currentPath && currentPath !== path) {
        await supabase.storage.from(SIGNATURE_BUCKET).remove([currentPath]);
      }
      await updateCenter.mutateAsync({ invoice_signature_path: path });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.invoiceDesign.all }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!currentPath) return;
      await supabase.storage.from(SIGNATURE_BUCKET).remove([currentPath]);
      await updateCenter.mutateAsync({ invoice_signature_path: null });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.invoiceDesign.all }),
  });

  return { upload, remove };
}
