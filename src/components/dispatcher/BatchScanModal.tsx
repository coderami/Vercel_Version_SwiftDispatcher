import { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { scanInvoices, addScannedCards } from '@/lib/dispatcher-api';
import { extractAddressFromInvoice, type RawScanResult } from '@/lib/address-utils';
import type { InvoiceCard } from '@/types/dispatcher';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Default 'inbox' mode persists scans as inbox cards. 'raw' returns extracted
   *  results to the caller without touching the DB — used by the Map Tab. */
  mode?: 'inbox' | 'raw';
  /** Called in 'inbox' mode after cards have been persisted. */
  onScanned?: (cards: InvoiceCard[]) => void;
  /** Called in 'raw' mode with the sanitized scan results. */
  onResults?: (results: RawScanResult[]) => void;
}

export function BatchScanModal({ open, onClose, onScanned, onResults, mode = 'inbox' }: Props) {
  const [images, setImages] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  // Track when the native camera/file picker is open to prevent dialog close
  const capturePendingRef = useRef(false);
  // Track if we should auto-scan after camera capture
  const autoScanRef = useRef(false);

  const resizeImage = (file: File, maxWidth = 1200): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          if (img.width <= maxWidth) {
            resolve(reader.result as string);
            return;
          }
          const canvas = document.createElement('canvas');
          const ratio = maxWidth / img.width;
          canvas.width = maxWidth;
          canvas.height = img.height * ratio;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const doScan = useCallback(async (imagesToScan: string[]) => {
    if (imagesToScan.length === 0) return;
    setProcessing(true);
    try {
      for (const img of imagesToScan) {
        if (!img.startsWith('data:image/')) {
          throw new Error('Invalid image format. Please re-capture the photo.');
        }
      }
      const rawResults = await scanInvoices(imagesToScan);
      if (rawResults.length === 0) {
        toast.error('No invoice data could be extracted. Try a clearer photo.');
        setProcessing(false);
        return;
      }
      // Apply the shared sanitizer so Dispatch + Map see identical "raw text"
      const results = rawResults.map(extractAddressFromInvoice);

      if (mode === 'raw') {
        onResults?.(results);
        toast.success(`${results.length} invoice(s) extracted`);
        setImages([]);
        onClose();
      } else {
        const { added, duplicates } = await addScannedCards(
          results.map(r => ({
            clientName: r.clientName,
            address: r.address,
            invoiceNumber: r.invoiceNumber,
            isPickup: r.isPickup,
          }))
        );

        for (const dup of duplicates) {
          toast.error(`Duplicate Found: Invoice #${dup.invoiceNumber} has already been scanned and is currently in ${dup.location}.`, { duration: 6000 });
          if (navigator.vibrate) navigator.vibrate(200);
        }

        if (added.length > 0) {
          onScanned?.(added);
          toast.success(`${added.length} invoice(s) scanned and added to inbox`);
        }
        setImages([]);
        onClose();
      }
    } catch (err: any) {
      console.error('Scan error:', err);
      const msg = err.message || 'Failed to scan invoices';
      if (msg.includes('API Key') || msg.includes('not configured')) {
        toast.error('Missing API Key: Configure GEMINI_API_KEY in project secrets.');
      } else if (msg.includes('rate_limit') || msg.includes('Rate')) {
        toast.error('Rate limit hit. Wait 10 seconds and try again.');
      } else {
        toast.error(`Scan failed: ${msg}`);
      }
    } finally {
      setProcessing(false);
    }
  }, [onScanned, onResults, mode, onClose]);

  const handleFiles = useCallback(async (files: FileList | null, shouldAutoScan = false) => {
    capturePendingRef.current = false;
    if (!files || files.length === 0) return;
    
    const newImages: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const resized = await resizeImage(file);
        newImages.push(resized);
      } catch {
        toast.error(`Failed to load ${file.name}`);
      }
    }
    
    if (newImages.length === 0) return;

    if (shouldAutoScan) {
      // For camera capture: auto-scan immediately without waiting for user to tap "Scan"
      setImages(newImages);
      await doScan(newImages);
    } else {
      setImages(prev => [...prev, ...newImages]);
    }
  }, [doScan]);

  const handleCameraClick = useCallback(() => {
    capturePendingRef.current = true;
    autoScanRef.current = true;
    fileRef.current?.click();
  }, []);

  const handleGalleryClick = useCallback(() => {
    capturePendingRef.current = true;
    autoScanRef.current = false;
    galleryRef.current?.click();
  }, []);

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  // Prevent dialog from closing when camera/file-picker is open or processing
  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen && (processing || capturePendingRef.current)) return;
    if (!isOpen) {
      setImages([]);
      onClose();
    }
  }, [processing, onClose]);

  // Listen for page visibility changes - when camera returns on mobile,
  // the page becomes visible again. We use this to keep the dialog alive.
  useEffect(() => {
    if (!open) return;
    const handleVisibilityChange = () => {
      // When page becomes visible again after camera, keep dialog open
      if (document.visibilityState === 'visible' && capturePendingRef.current) {
        // Camera might still be returning the file, keep pending
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [open]);

  return (
    <>
      {/* Camera input - lives outside Dialog to persist across mobile camera lifecycle */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={e => {
          handleFiles(e.target.files, autoScanRef.current);
          if (fileRef.current) fileRef.current.value = '';
        }}
        className="hidden"
      />
      {/* Gallery input - no capture attribute, supports multiple */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        onChange={e => {
          handleFiles(e.target.files, false);
          if (galleryRef.current) galleryRef.current.value = '';
        }}
        className="hidden"
      />

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="bg-card border-border max-w-md"
          onPointerDownOutside={e => (processing || capturePendingRef.current) && e.preventDefault()}
          onInteractOutside={e => (processing || capturePendingRef.current) && e.preventDefault()}
          onEscapeKeyDown={e => (processing || capturePendingRef.current) && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Camera className="h-4 w-4 text-primary" />
              Batch Scan
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <button
                onClick={handleCameraClick}
                disabled={processing}
                className="flex-1 border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors disabled:opacity-50"
              >
                <Camera className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Take Photo</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Auto-scans</p>
              </button>
              <button
                onClick={handleGalleryClick}
                disabled={processing}
                className="flex-1 border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors disabled:opacity-50"
              >
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Upload Files</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Multi-select</p>
              </button>
            </div>

            {images.length > 0 && !processing && (
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                {images.map((img, i) => (
                  <div key={i} className="relative shrink-0 w-16 h-16 rounded-md overflow-hidden border border-border">
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3 text-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {processing && (
              <div className="flex items-center justify-center gap-2 py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Extracting invoice data...</p>
              </div>
            )}

            {images.length > 0 && !processing && (
              <Button
                onClick={() => doScan(images)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Scan {images.length} Image(s)
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
