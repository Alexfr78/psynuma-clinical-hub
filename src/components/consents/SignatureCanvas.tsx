import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import SignaturePad from 'signature_pad';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';


interface SignatureCanvasProps {
  onSignatureChange?: (hasSignature: boolean) => void;
}

export interface SignatureCanvasRef {
  getSignatureData: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
}

export const SignatureCanvas = forwardRef<SignatureCanvasRef, SignatureCanvasProps>(
  ({ onSignatureChange }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const signaturePadRef = useRef<SignaturePad | null>(null);

    useEffect(() => {
      if (!canvasRef.current) return;

      const canvas = canvasRef.current;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);

      const resizeCanvas = () => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * ratio;
        canvas.height = rect.height * ratio;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(ratio, ratio);
        }
        signaturePadRef.current?.clear();
      };

      signaturePadRef.current = new SignaturePad(canvas, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(0, 0, 0)',
      });

      signaturePadRef.current.addEventListener('endStroke', () => {
        onSignatureChange?.(!signaturePadRef.current?.isEmpty());
      });

      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);

      return () => {
        window.removeEventListener('resize', resizeCanvas);
        signaturePadRef.current?.off();
      };
    }, [onSignatureChange]);

    useImperativeHandle(ref, () => ({
      getSignatureData: () => {
        if (signaturePadRef.current?.isEmpty()) return null;
        return signaturePadRef.current?.toDataURL('image/png') || null;
      },
      clear: () => {
        signaturePadRef.current?.clear();
        onSignatureChange?.(false);
      },
      isEmpty: () => signaturePadRef.current?.isEmpty() ?? true,
    }));

    const handleClear = () => {
      signaturePadRef.current?.clear();
      onSignatureChange?.(false);
    };

    return (
      <div className="space-y-2">
        <div className="relative rounded-lg border bg-white">
          <canvas
            ref={canvasRef}
            className="h-[200px] w-full cursor-crosshair touch-none rounded-lg"
            style={{ touchAction: 'none' }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2"
            onClick={handleClear}
          >
            <Icon name="ink_eraser" className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Dibuja tu firma con el ratón o el dedo
        </p>
      </div>
    );
  }
);

SignatureCanvas.displayName = 'SignatureCanvas';
