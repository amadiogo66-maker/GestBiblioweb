'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

interface AnimatedCounterProps {
  value: number;
  durationMs?: number;
}

export function AnimatedCounter({ value, durationMs = 1200 }: AnimatedCounterProps): ReactElement {
  const [display, setDisplay] = useState(0);
  const elementRef = useRef<HTMLSpanElement>(null);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    const node = elementRef.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || hasAnimatedRef.current) {
          return;
        }

        hasAnimatedRef.current = true;
        const startTime = performance.now();

        function tick(now: number): void {
          const progress = Math.min((now - startTime) / durationMs, 1);
          const eased = 1 - (1 - progress) ** 3;
          setDisplay(Math.round(eased * value));

          if (progress < 1) {
            requestAnimationFrame(tick);
          }
        }

        requestAnimationFrame(tick);
        observer.disconnect();
      },
      { threshold: 0.4 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [value, durationMs]);

  return (
    <span ref={elementRef} aria-hidden="true">
      {display.toLocaleString('fr-FR')}
    </span>
  );
}
