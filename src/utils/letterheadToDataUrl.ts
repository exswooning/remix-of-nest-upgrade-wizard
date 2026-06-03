/**
 * Fetch a letterhead image and return it as a Base64 PNG data URL so
 * jsPDF can embed it. Returns null on any failure — the caller falls
 * back to a blank page. Goes through a canvas to handle JPEG sources
 * and to enforce a known format on the PDF side.
 *
 * Extracted from ContractTab.tsx so the same helper can be reused
 * by any other PDF generator without dragging in the entire tab's
 * imports. The CORS dance (Image(crossOrigin='anonymous') + canvas
 * re-encode) is what lets us bypass the Supabase storage CORS issue
 * that bit the 1:1 preview-capture download earlier.
 */
export async function letterheadToDataUrl(imageUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 794;
        canvas.height = img.naturalHeight || 1123;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}
