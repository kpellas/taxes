import type { PropertyStatus, LoanStatus, DocumentStatus } from '../../types';

type BadgeStatus = PropertyStatus | LoanStatus | DocumentStatus | 'needs_confirmation';

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  active_rental: { label: 'Active Rental', bg: '#f3f4f6', text: '#374151' },
  construction: { label: 'Construction', bg: '#f3f4f6', text: '#374151' },
  deposit_paid: { label: 'Deposit Paid', bg: '#f3f4f6', text: '#374151' },
  sold: { label: 'Sold', bg: '#f3f4f6', text: '#9ca3af' },
  active: { label: 'Active', bg: '#f3f4f6', text: '#374151' },
  refinanced: { label: 'Refinanced', bg: '#f3f4f6', text: '#9ca3af' },
  closed: { label: 'Closed', bg: '#f3f4f6', text: '#9ca3af' },
  provided: { label: 'Provided', bg: '#f3f4f6', text: '#374151' },
  missing: { label: 'Missing', bg: '#fee2e2', text: '#991b1b' },
  partial: { label: 'Partial', bg: '#f3f4f6', text: '#374151' },
  needs_confirmation: { label: 'Needs Confirmation', bg: '#fee2e2', text: '#991b1b' },
};

interface StatusBadgeProps {
  status: BadgeStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, bg: '#f1f5f9', text: '#475569' };
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

  return (
    <span
      className={`inline-block rounded font-medium ${sizeClasses}`}
      style={{ backgroundColor: config.bg, color: config.text }}
    >
      {config.label}
    </span>
  );
}
