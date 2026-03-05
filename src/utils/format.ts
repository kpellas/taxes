export function formatCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs >= 1000000
    ? `$${(abs / 1000000).toFixed(2)}M`
    : abs >= 1000
      ? `$${abs.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
      : `$${abs.toFixed(2)}`;
  return amount < 0 ? `-${formatted}` : formatted;
}

export function formatCurrencyFull(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  if (dateStr.length <= 7) return dateStr; // e.g., "2024-10"
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function getTaxYear(date: Date): number {
  return date.getMonth() >= 6 ? date.getFullYear() + 1 : date.getFullYear();
}

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function getLenderColor(lender: string): string {
  const map: Record<string, string> = {
    'Beyond Bank': '#2563eb',
    'Macquarie': '#1e40af',
    'Bankwest': '#1d4ed8',
    'NAB': '#3b82f6',
  };
  return map[lender] || '#2563eb';
}
