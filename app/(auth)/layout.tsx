import Image from 'next/image';
import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import { APP_NAME, UNIVERSITY_NAME } from '@/lib/constants';

interface AuthSegmentLayoutProps {
  children: ReactNode;
}

export default function AuthSegmentLayout({ children }: AuthSegmentLayoutProps): ReactElement {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-primary/5 via-white to-white px-4 py-12">
      <Link href="/" className="mb-8 flex flex-col items-center gap-2 text-center">
        <Image
          src="/images/logo-universite.png"
          alt={`Logo ${UNIVERSITY_NAME}`}
          width={132}
          height={52}
          priority
          className="h-12 w-auto"
        />
        <span className="font-serif text-lg font-semibold text-primary">{APP_NAME}</span>
        <span className="text-xs uppercase tracking-[0.3em] text-slate-500">{UNIVERSITY_NAME}</span>
      </Link>

      <div className="w-full max-w-[480px]">{children}</div>

      <p className="mt-8 text-xs text-slate-400">
        <Link href="/mentions-legales" className="hover:text-primary hover:underline">
          Mentions légales
        </Link>
      </p>
    </div>
  );
}
