'use client';

import type { ChangeEvent, ReactElement, SelectHTMLAttributes } from 'react';

interface AutoSubmitSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  /** Champs du même formulaire remis à vide avant l'envoi (ex. un filtre qui dépend de celui-ci). */
  resetFields?: string[];
}

/**
 * Liste déroulante qui soumet son formulaire GET dès qu'elle change.
 * Amélioration progressive : sans JavaScript, c'est un <select> ordinaire et
 * le bouton du formulaire reste le moyen d'envoyer.
 */
export function AutoSubmitSelect({ resetFields = [], children, ...props }: AutoSubmitSelectProps): ReactElement {
  function submit(event: ChangeEvent<HTMLSelectElement>): void {
    const form = event.currentTarget.form;

    if (!form) return;

    for (const name of resetFields) {
      const field = form.elements.namedItem(name) as { value: string } | null;
      if (field && 'value' in field) field.value = '';
    }

    form.requestSubmit();
  }

  return (
    <select {...props} onChange={submit}>
      {children}
    </select>
  );
}
