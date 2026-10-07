import { describe, expect, it } from 'vitest';
import { classifyAeatAltaResponse } from './verifactuAeatResponse.ts';

const soap = (content: string) => `<soap:Envelope><soap:Body>${content}</soap:Body></soap:Envelope>`;

describe('classifyAeatAltaResponse', () => {
  it('accepts Correcto with CSV', () => {
    expect(classifyAeatAltaResponse({ httpStatus: 200, body: soap('<EstadoRegistro>Correcto</EstadoRegistro><CSV>CSV-1</CSV>') }))
      .toMatchObject({ outcome: 'accepted', csv: 'CSV-1', code: null });
  });

  it('accepts AceptadoConErrores and preserves the warning', () => {
    expect(classifyAeatAltaResponse({ httpStatus: 200, body: soap('<EstadoRegistro>AceptadoConErrores</EstadoRegistro><CodigoErrorRegistro>2001</CodigoErrorRegistro><DescripcionErrorRegistro>Aviso fiscal</DescripcionErrorRegistro><CSV>CSV-2</CSV>') }))
      .toEqual({ outcome: 'accepted_with_errors', code: '2001', message: 'Aviso fiscal', csv: 'CSV-2' });
  });

  it('rejects Incorrecto with a known code', () => {
    expect(classifyAeatAltaResponse({ httpStatus: 200, body: soap('<EstadoRegistro>Incorrecto</EstadoRegistro><CodigoErrorRegistro>1100</CodigoErrorRegistro><DescripcionErrorRegistro>Dato inválido</DescripcionErrorRegistro>') }))
      .toMatchObject({ outcome: 'rejected', code: '1100', message: 'Dato inválido' });
  });

  it('classifies code 3000 as duplicate with the required message', () => {
    expect(classifyAeatAltaResponse({ httpStatus: 200, body: soap('<EstadoRegistro>Incorrecto</EstadoRegistro><CodigoErrorRegistro>3000</CodigoErrorRegistro>') }))
      .toEqual({
        outcome: 'duplicate',
        code: '3000',
        message: 'La AEAT indica que esta factura ya está registrada. Consulta su estado en AEAT antes de reenviarla.',
        csv: null,
      });
  });

  it('treats an unknown business error code as rejected', () => {
    expect(classifyAeatAltaResponse({ httpStatus: 200, body: soap('<EstadoRegistro>Incorrecto</EstadoRegistro><CodigoErrorRegistro>9999</CodigoErrorRegistro>') }))
      .toMatchObject({ outcome: 'rejected', code: '9999' });
  });

  it('treats an HTML 503 page as transient', () => {
    expect(classifyAeatAltaResponse({ httpStatus: 503, body: '<!DOCTYPE html><html><title>503</title></html>' }).outcome)
      .toBe('transient');
  });

  it('treats a temporarily disabled 404 as transient', () => {
    expect(classifyAeatAltaResponse({ httpStatus: 404, body: 'Servicio Desactivada temporalmente' }).outcome)
      .toBe('transient');
  });

  it('treats a network exception as transient', () => {
    expect(classifyAeatAltaResponse({ networkError: new Error('timeout') }))
      .toMatchObject({ outcome: 'transient', message: 'timeout' });
  });

  it('treats a validation SOAP fault on HTTP 4xx as rejected', () => {
    expect(classifyAeatAltaResponse({ httpStatus: 400, body: soap('<soap:Fault><faultstring>XML inválido</faultstring></soap:Fault>') }))
      .toMatchObject({ outcome: 'rejected', message: 'XML inválido' });
  });
});
