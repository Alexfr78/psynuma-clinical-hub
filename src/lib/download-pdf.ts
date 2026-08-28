/**
 * Downloads a remote PDF as a local blob so the browser never navigates to the
 * storage URL directly (some extensions/adblockers block those URLs with
 * ERR_BLOCKED_BY_CLIENT). Falls back to opening the URL in a new tab.
 */
export async function downloadPdfFromUrl(url: string, filename: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    return true;
  } catch (err) {
    console.error('Blob download failed, falling back to new tab:', err);
    const opened = window.open(url, '_blank');
    return Boolean(opened);
  }
}
