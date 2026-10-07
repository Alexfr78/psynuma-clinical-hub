export type AeatAltaOutcome =
  | 'accepted'
  | 'accepted_with_errors'
  | 'rejected'
  | 'duplicate'
  | 'transient';

export interface AeatAltaClassification {
  outcome: AeatAltaOutcome;
  code: string | null;
  message: string;
  csv: string | null;
}

export interface AeatAltaResponseInput {
  httpStatus?: number;
  body?: string | null;
  networkError?: unknown;
}

function extractXmlValue(xml: string, tagName: string): string | null {
  const match = xml.match(new RegExp(`<[^>]*${tagName}[^>]*>([^<]+)<\\/[^>]*${tagName}[^>]*>`, 'i'));
  return match?.[1]?.trim() || null;
}

function networkErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return 'Error de conexión con la AEAT';
}

export function classifyAeatAltaResponse({
  httpStatus,
  body = '',
  networkError,
}: AeatAltaResponseInput): AeatAltaClassification {
  const responseBody = body || '';
  const csv = extractXmlValue(responseBody, 'CSV');
  const code = extractXmlValue(responseBody, 'CodigoErrorRegistro');
  const description = extractXmlValue(responseBody, 'DescripcionErrorRegistro');
  const fault = extractXmlValue(responseBody, 'faultstring')
    || extractXmlValue(responseBody, 'Text');
  const estadoRegistro = extractXmlValue(responseBody, 'EstadoRegistro');
  const estadoEnvio = extractXmlValue(responseBody, 'EstadoEnvio');

  if (networkError !== undefined && networkError !== null) {
    return { outcome: 'transient', code: null, message: networkErrorMessage(networkError), csv: null };
  }

  const isHtml = /<!doctype\s+html|<html\b/i.test(responseBody);
  if (isHtml) {
    return {
      outcome: 'transient',
      code: null,
      message: `La AEAT devolvió una página HTML de error${httpStatus ? ` (HTTP ${httpStatus})` : ''}`,
      csv: null,
    };
  }

  if (httpStatus !== undefined && httpStatus >= 500) {
    return { outcome: 'transient', code: null, message: `Error temporal de AEAT (HTTP ${httpStatus})`, csv: null };
  }

  if (
    httpStatus === 404
    && /desactivada\s+temporalmente|no\s+habilitado/i.test(responseBody)
  ) {
    return { outcome: 'transient', code: null, message: 'Servicio AEAT desactivado temporalmente o no habilitado', csv: null };
  }

  if (estadoRegistro === 'AceptadoConErrores') {
    return {
      outcome: 'accepted_with_errors',
      code,
      message: description || 'Registro aceptado por la AEAT con avisos',
      csv,
    };
  }

  if (code === '3000') {
    return {
      outcome: 'duplicate',
      code,
      message: 'La AEAT indica que esta factura ya está registrada. Consulta su estado en AEAT antes de reenviarla.',
      csv,
    };
  }

  if (code || estadoRegistro === 'Incorrecto' || estadoEnvio === 'Incorrecto' || fault) {
    return {
      outcome: 'rejected',
      code,
      message: description || fault || 'Registro rechazado por la AEAT',
      csv,
    };
  }

  if (estadoRegistro === 'Correcto' || estadoEnvio === 'Correcto' || csv) {
    return { outcome: 'accepted', code: null, message: 'Registro aceptado por la AEAT', csv };
  }

  return {
    outcome: 'transient',
    code: null,
    message: httpStatus && httpStatus >= 400
      ? `Respuesta AEAT sin estado de negocio claro (HTTP ${httpStatus})`
      : 'Respuesta AEAT sin estado de negocio claro',
    csv: null,
  };
}
