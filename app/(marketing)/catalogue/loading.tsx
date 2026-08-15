import type { ReactElement } from 'react';
import { Container } from '@/components/ui/Container';
import { cn } from '@/lib/utils';

function SkeletonBlock({ className }: { className?: string }): ReactElement {
  return <div className={cn('animate-pulse rounded-lg bg-slate-200', className)} />;
}

export default function CatalogueLoading(): ReactElement {
  return (
    <div className="bg-accent">
      <div className="border-b border-slate-200 bg-primary py-16">
        <Container className="flex flex-col gap-6">
          <div className="space-y-3">
            <SkeletonBlock className="h-4 w-32 bg-white/20" />
            <SkeletonBlock className="h-10 w-64 bg-white/20" />
            <SkeletonBlock className="h-4 w-96 max-w-full bg-white/20" />
          </div>
          <SkeletonBlock className="h-14 w-full bg-white/20" />
        </Container>
      </div>

      <Container className="flex flex-col gap-8 py-10">
        <SkeletonBlock className="h-48 w-full" />

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <SkeletonBlock className="aspect-[3/4] w-full rounded-none" />
              <div className="space-y-2 p-4">
                <SkeletonBlock className="h-3 w-1/3" />
                <SkeletonBlock className="h-4 w-3/4" />
                <SkeletonBlock className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </Container>
    </div>
  );
}
