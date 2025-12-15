import { useRef, useCallback } from 'react';

interface SwipeConfig {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
}

export function useSwipeNavigation({ onSwipeLeft, onSwipeRight, threshold = 50 }: SwipeConfig) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return;

    const deltaX = e.changedTouches[0].clientX - touchStart.current.x;
    const deltaY = e.changedTouches[0].clientY - touchStart.current.y;

    // Only process if horizontal movement is greater than vertical
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
      if (deltaX < 0 && onSwipeLeft) {
        onSwipeLeft(); // Swipe left = next
      } else if (deltaX > 0 && onSwipeRight) {
        onSwipeRight(); // Swipe right = previous
      }
    }

    touchStart.current = null;
  }, [onSwipeLeft, onSwipeRight, threshold]);

  return { handleTouchStart, handleTouchEnd };
}
