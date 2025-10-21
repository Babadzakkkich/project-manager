// hooks/useAutoScroll.js
import { useCallback, useRef } from 'react';

export const useAutoScroll = () => {
  const scrollIntervalRef = useRef(null);
  const isScrollingRef = useRef(false);

  const startAutoScroll = useCallback((direction) => {
    if (isScrollingRef.current) return;
    
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
    }

    isScrollingRef.current = true;
    const scrollSpeed = 15;
    const scrollStep = direction === 'up' ? -scrollSpeed : scrollSpeed;

    scrollIntervalRef.current = setInterval(() => {
      window.scrollBy({
        top: scrollStep,
        behavior: 'instant'
      });
    }, 16);
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
    isScrollingRef.current = false;
  }, []);

  const handleDragOver = useCallback((e) => {
    const viewportHeight = window.innerHeight;
    const mouseY = e.clientY;
    
    const scrollZoneHeight = viewportHeight * 0.15;
    const topZone = scrollZoneHeight;
    const bottomZone = viewportHeight - scrollZoneHeight;

    if (mouseY >= topZone && mouseY <= bottomZone) {
      stopAutoScroll();
      return;
    }

    if (mouseY < topZone) {
      startAutoScroll('up');
    } else if (mouseY > bottomZone) {
      startAutoScroll('down');
    }
  }, [startAutoScroll, stopAutoScroll]);

  return {
    handleDragOver,
    stopAutoScroll
  };
};