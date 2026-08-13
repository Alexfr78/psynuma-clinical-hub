export type VerifactuCancellationInvoiceIdInput = {
  issuerTaxId: string;
  invoiceNumber: string;
  issueDate: string;
};

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
