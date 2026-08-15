import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';

function SkeletonBlock({ className }: { className?: string }): ReactElement {
  return <div className={cn('animate-pulse rounded-lg bg-slate-200', className)} />;
}

export default function DashboardLoading(): ReactElement {
  return (
    <div className="flex flex-col gap-8">
      <SkeletonBlock className="h-8 w-64" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <SkeletonBlock key={index} className="h-24 w-full" />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <SkeletonBlock key={index} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}
