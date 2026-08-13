export type VerifactuCancellationInvoiceIdInput = {
  issuerTaxId: string;
  invoiceNumber: string;
  issueDate: string;
};

export function sanitizeVerifactuSystemName(input: unknown): string {
  let value = (input ?? '').toString();
  value = value.replace(/[\r\n\t]+/g, ' ').trim();
  value = Array.from(value).filter((character) => {
    const code = character.charCodeAt(0);
    return code > 31 && code !== 127;
  }).join('');
  value = value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');
  value = value.replace(/\s{2,}/g, ' ');

  if (!value) value = 'PSYCMA';
  return value.slice(0, 30).trim();
}

export function buildVerifactuCancellationInvoiceIdXml({
  issuerTaxId,
  invoiceNumber,
  issueDate,
}: VerifactuCancellationInvoiceIdInput): string {
  return `<sum1:IDFactura>
            <sum1:IDEmisorFacturaAnulada>${issuerTaxId}</sum1:IDEmisorFacturaAnulada>
            <sum1:NumSerieFacturaAnulada>${invoiceNumber}</sum1:NumSerieFacturaAnulada>
            <sum1:FechaExpedicionFacturaAnulada>${issueDate}</sum1:FechaExpedicionFacturaAnulada>
          </sum1:IDFactura>`;
}
