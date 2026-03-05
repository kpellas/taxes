import { usePortfolioStore } from '../../store/portfolioStore';

interface EntityBadgeProps {
  entityId: string;
  size?: 'sm' | 'md';
}

export function EntityBadge({ entityId, size = 'sm' }: EntityBadgeProps) {
  const entity = usePortfolioStore((s) => s.getEntity(entityId));
  if (!entity) return null;

  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

  return (
    <span className={`inline-flex items-center gap-1 rounded font-medium text-gray-700 bg-gray-100 ${sizeClasses}`}>
      {entity.name}
    </span>
  );
}
