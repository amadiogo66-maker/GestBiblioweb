import type { ReactElement } from 'react';
import { Container } from '@/components/ui/Container';
import { cn } from '@/lib/utils';

function SkeletonBlock({ className }: { className?: string }): ReactElement {
  return <div className={cn('animate-pulse rounded-lg bg-slate-200', className)} />;
}

export default function OuvrageLoading(): ReactElement {
  return (
    <Container className="flex flex-col gap-10 py-12">
      <SkeletonBlock className="h-4 w-32" />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[2fr_3fr]">
        <SkeletonBlock className="aspect-[2/3] w-full max-w-xs" />
        <div className="flex flex-col gap-4">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-10 w-3/4" />
          <SkeletonBlock className="h-6 w-1/3" />
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-2/3" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <SkeletonBlock className="h-12 w-full" />
          <SkeletonBlock className="h-12 w-48" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <SkeletonBlock key={index} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </Container>
  );
}
