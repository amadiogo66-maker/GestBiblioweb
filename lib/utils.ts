import { addDays, format, formatDistance } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string, formatPattern = 'dd/MM/yyyy'): string {
  const value = typeof date === 'string' ? new Date(date) : date;

  if (Number.isNaN(value.getTime())) {
    return '';
  }

  return format(value, formatPattern, { locale: fr });
}

/** Date relative en français, par exemple « il y a 3 heures ». */
export function formatRelativeDate(date: Date, now = new Date()): string {
  return formatDistance(date, now, { addSuffix: true, locale: fr });
}

export function generateLibraryCardNumber(): string {
  const year = new Date().getFullYear();
  const randomPart = Math.floor(10000 + Math.random() * 90000);
  return `GB-${year}-${randomPart}`;
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateQRCodeData(userId: string): string {
  const payload = {
    userId,
    issuedAt: new Date().toISOString(),
    type: 'library-card',
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function calculateDueDate(borrowDate: Date, durationDays: number): Date {
  return addDays(borrowDate, durationDays);
}
