/**
 * Shared address utilities used by BOTH the Dispatch (BatchScanModal) and
 * Map Tab (MapWorkspace) scanners. Single source of truth — if you change
 * the scrub rules here, both tabs see the change.
 */

// Canadian postal code: A1A 1A1 (space optional)
export const POSTAL_RE = /[A-Z][0-9][A-Z]\s?[0-9][A-Z][0-9]/i;
export const STREET_RE =
  /\b\d{1,6}\s+[A-Za-z0-9'.\-]+(?:\s+[A-Za-z0-9'.\-]+){0,5}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Crescent|Cres|Way|Place|Pl|Trail|Trl|Highway|Hwy|Parkway|Pkwy|Terrace|Ter)\b\.?/i;

// Common OCR typo corrections (whole-word, case-insensitive)
const OCR_FIXES: { re: RegExp; to: string }[] = [
  { re: /\bOSHWA\b/gi, to: 'OSHAWA' },
  { re: /\bLAWERENCE\b/gi, to: 'LAWRENCE' },
  { re: /\bTRUCKSHO\b/gi, to: '' },
];

/** Look for a Canadian postal code and fix common OCR letter↔digit swaps. */
function fixPostalOCR(s: string): string {
  const L_TO_D: Record<string, string> = { O: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', G: '6', T: '7', Q: '0' };
  const D_TO_L: Record<string, string> = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z', '6': 'G' };
  return s.replace(/\b([A-Z0-9])([A-Z0-9])([A-Z0-9])\s?([A-Z0-9])([A-Z0-9])([A-Z0-9])\b/gi, (full, ...g) => {
    const chars = g.slice(0, 6).map((c: string) => c.toUpperCase());
    const want = ['L', 'D', 'L', 'D', 'L', 'D'];
    const fixed: string[] = [];
    for (let i = 0; i < 6; i++) {
      const c = chars[i];
      const isDigit = /[0-9]/.test(c);
      const isLetter = /[A-Z]/.test(c);
      if (want[i] === 'L' && isDigit && D_TO_L[c]) fixed.push(D_TO_L[c]);
      else if (want[i] === 'D' && isLetter && L_TO_D[c]) fixed.push(L_TO_D[c]);
      else if ((want[i] === 'L' && isLetter) || (want[i] === 'D' && isDigit)) fixed.push(c);
      else return full;
    }
    return `${fixed[0]}${fixed[1]}${fixed[2]} ${fixed[3]}${fixed[4]}${fixed[5]}`;
  });
}

/** Canonical scrub: newlines → space, junk chars → space, OCR typos, postal repair, tidy commas. */
export function sanitizeAddress(raw: string): string {
  let s = raw || '';
  s = s.replace(/[\r\n]+/g, ' ');
  s = s.replace(/[|$_*`~^<>{}\[\]\\]/g, ' ');
  for (const { re, to } of OCR_FIXES) s = s.replace(re, to);
  s = fixPostalOCR(s);
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\s*,\s*/g, ', ').replace(/^[,\s]+|[,\s]+$/g, '');
  return s.trim();
}

/**
 * Shared post-scan extractor. The Gemini edge function already performs
 * zone-priority detection (Green Ship-To > Blue Sold-To) and returns a
 * clean `address` field — this helper just enforces our scrub rules on top
 * so both tabs end up with identical 'raw text' before geocoding/persisting.
 */
export interface RawScanResult {
  clientName: string;
  address: string;
  invoiceNumber: string;
  isPickup: boolean;
}

export function extractAddressFromInvoice(scan: RawScanResult): RawScanResult {
  return {
    ...scan,
    address: sanitizeAddress(scan.address),
  };
}
