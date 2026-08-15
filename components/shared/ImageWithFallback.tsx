'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const OPTIMIZABLE_HOSTS = ['images.unsplash.com', 'covers.openlibrary.org'];

interface ImageWithFallbackProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallback: ReactNode;
  sizes?: string;
}

function isOptimizable(src: string): boolean {
  try {
    return OPTIMIZABLE_HOSTS.includes(new URL(src).hostname);
  } catch {
    return false;
  }
}

export function ImageWithFallback({ src, alt, className, fallback, sizes }: ImageWithFallbackProps): ReactElement {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;

  return (
    <div className={cn('relative overflow-hidden bg-gradient-to-br from-primary/10 to-secondary/10', className)}>
      {showFallback ? (
        <div className="flex h-full w-full items-center justify-center">{fallback}</div>
      ) : isOptimizable(src) ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes ?? '(max-width: 768px) 50vw, 25vw'}
          className="object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
          loading="lazy"
        />
      )}
    </div>
  );
}
