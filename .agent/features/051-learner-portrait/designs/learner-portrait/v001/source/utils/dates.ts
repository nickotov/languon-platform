import { addDays, format } from 'date-fns';

export const TODAY = new Date('2026-10-20T10:24:00');
export const EXPIRY_DAYS = 14;

export function formatDate(iso: string): string {
  return format(new Date(iso), 'MMM d, yyyy');
}

export function formatDateTime(iso: string): string {
  return format(new Date(iso), "MMM d, yyyy 'at' h:mm a");
}

export function expiryDate(lastActivityIso: string): string {
  return formatDate(addDays(new Date(lastActivityIso), EXPIRY_DAYS).toISOString());
}

export function timeLabel(): string {
  return format(new Date(), 'h:mm a');
}

