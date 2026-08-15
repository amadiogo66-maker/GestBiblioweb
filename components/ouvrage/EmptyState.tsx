import { BookX } from 'lucide-react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';

export function EmptyState(): ReactElement {
  return (
    <Container className="flex flex-col items-center gap-4 py-24 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <BookX className="h-8 w-8" aria-hidden="true" />
      </span>
      <h1 className="font-serif text-2xl font-semibold text-primary">Ouvrage non trouvé</h1>
      <p className="max-w-md text-slate-500">Cet ouvrage n&rsquo;existe pas ou a été retiré du catalogue.</p>
      <Button href="/catalogue" variant="primary" size="md">
        Retour au catalogue
      </Button>
    </Container>
  );
}
