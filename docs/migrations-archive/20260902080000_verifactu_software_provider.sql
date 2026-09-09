-- =====================================================================
-- La identificacion del software Verifactu (NombreRazon/NIF del
-- desarrollador, NombreSistemaInformatico, Version) identifica a Psycma
-- como producto ante la AEAT, no a cada centro cliente por separado.
-- Se marca un unico centro como "proveedor del software": los edge
-- functions de Verifactu (sign-invoice-verifactu, cancel-registro-
-- facturacion, export-verifactu-records) leen esos 4 campos siempre de
-- ese centro, sin importar que centro emite la factura.
-- =====================================================================

ALTER TABLE public.centers
  ADD COLUMN IF NOT EXISTS is_software_provider boolean NOT NULL DEFAULT false;

-- Solo puede haber un centro proveedor del software a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_centers_single_software_provider
  ON public.centers (is_software_provider)
  WHERE is_software_provider = true;

UPDATE public.centers
SET is_software_provider = true
WHERE name = 'Psycma';

-- RPC de solo lectura para que CUALQUIER centro pueda mostrar (sin poder
-- editar) la identificación de software vigente en pantallas informativas
-- como la Declaración Responsable — la RLS de `centers` restringe la
-- lectura directa a la propia fila, así que un centro normal no podría ver
-- estos 4 campos del centro proveedor sin este RPC.
CREATE OR REPLACE FUNCTION public.get_platform_verifactu_software_info()
RETURNS TABLE (
  verifactu_sistema_informatico text,
  verifactu_software_version text,
  verifactu_software_nif text,
  verifactu_software_name text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT verifactu_sistema_informatico, verifactu_software_version, verifactu_software_nif, verifactu_software_name
  FROM public.centers
  WHERE is_software_provider = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_platform_verifactu_software_info() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_verifactu_software_info() TO authenticated;
