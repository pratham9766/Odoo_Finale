// Smooth (inertia) page scrolling with Lenis. Areas that scroll on their own keep native wheel behaviour.
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

// Things that scroll on their own or sit above the page: the wheel there must stay native.
const NATIVE = [
  '.sidebar', '.ops-panel', '.ant-table-body', '.ant-table-content',
  '.ant-modal-root', '.ant-drawer', '.ant-select-dropdown', '.ant-picker-dropdown',
  '.ant-dropdown', '.ant-popover', '.ant-cascader-dropdown', '[data-lenis-prevent]',
].join(',');

/**
 * Momentum ("weighty") smooth scrolling for the main window, via Lenis. Mouse wheel and trackpad only:
 * touch keeps the device's own scrolling, and people who ask for reduced motion get plain scrolling.
 */
export default function SmoothScroll() {
  const lenis = useRef(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const start = () => {
      lenis.current?.destroy();
      lenis.current = motion.matches ? null : new Lenis({
        autoRaf: true,
        lerp: 0.085,              // lower = heavier glide
        wheelMultiplier: 0.9,
        allowNestedScroll: true,  // tables, lists and panels that scroll themselves keep working
        prevent: (node) => !!node.closest?.(NATIVE),
      });
    };
    start();
    motion.addEventListener('change', start);
    return () => {
      motion.removeEventListener('change', start);
      lenis.current?.destroy();
      lenis.current = null;
    };
  }, []);

  // a new screen starts at the top, without gliding there from the old position
  useEffect(() => {
    if (lenis.current) lenis.current.scrollTo(0, { immediate: true, force: true });
    else window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
