'use client';

import { SessionProvider } from 'next-auth/react';
import type { ReactNode, ReactElement } from 'react';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps): ReactElement {
  return <SessionProvider>{children}</SessionProvider>;
}

