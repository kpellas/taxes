import { Landmark, MapPin, AlertTriangle } from 'lucide-react';
import { EntityBadge } from '../common/EntityBadge';
import { StatusBadge } from '../common/StatusBadge';
import { usePortfolioStore } from '../../store/portfolioStore';
import { useUIStore } from '../../store/uiStore';
import { formatCurrency } from '../../utils/format';

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function formatOwnership(ownership: { name: string; percentage: number }[]): string {
  if (ownership.length === 1) return `${ownership[0].name} (${ownership[0].percentage}%)`;
  return ownership.map((o) => `${o.name.split(' ')[0]} ${o.percentage}%`).join(' / ');
}

export function PropertiesPage() {
  const { properties, loans, entities } = usePortfolioStore();
  const { activeEntityId, navigateToProperty } = useUIStore();

  const filteredProps = activeEntityId
    ? properties.filter((p) => p.entityId === activeEntityId)
    : properties;

  // Group by entity
  const grouped = entities
    .map((entity) => ({
      entity,
      properties: filteredProps.filter((p) => p.entityId === entity.id),
    }))
    .filter((g) => g.properties.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Landmark size={24} /> Properties
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {activeEntityId ? (
            <>
              Showing {filteredProps.length} of {properties.length} properties
              {' — '}
              <button
                onClick={() => useUIStore.getState().setActiveEntity(null)}
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Clear filter to show all
              </button>
            </>
          ) : (
            `${filteredProps.length} properties across ${grouped.length} entities`
          )}
        </p>
      </div>

      {grouped.map(({ entity, properties: entityProps }) => (
        <div key={entity.id}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entity.color }} />
            <h3 className="text-sm font-semibold text-gray-700">{entity.displayName}</h3>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {entityProps.map((property) => {
              const propLoans = loans.filter(
                (l) => l.propertyId === property.id && l.status === 'active' && l.type !== 'offset'
              );
              const propDebt = propLoans.reduce((sum, l) => sum + (l.currentBalance ?? l.originalAmount), 0);
              const hasIssues = !property.depreciationScheduleAvailable
                || property.ownershipNeedsConfirmation
                || (property.status === 'active_rental' && !property.weeklyRent);

              return (
                <div
                  key={property.id}
                  onClick={() => navigateToProperty(property.id)}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
                  style={{ borderLeftWidth: 4, borderLeftColor: entity.color }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-gray-900 text-lg">{property.nickname}</h4>
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                        <MapPin size={13} />
                        {property.address}, {property.suburb} {property.state}
                      </p>
                    </div>
                    <StatusBadge status={property.status} size="md" />
                  </div>

                  {/* Ownership */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs text-gray-500">{formatOwnership(property.ownership)}</span>
                    {property.ownershipNeedsConfirmation && (
                      <StatusBadge status="needs_confirmation" />
                    )}
                  </div>

                  {/* Key metrics - 2 rows */}
                  <div className="grid grid-cols-4 gap-x-4 gap-y-2 mb-3">
                    {/* Row 1 */}
                    <div>
                      <p className="text-xs text-gray-400">Rent</p>
                      <p className="font-semibold text-gray-900 text-sm">
                        {property.weeklyRent ? `$${property.weeklyRent}/wk` : (
                          property.status === 'active_rental'
                            ? <span className="text-red-600">TBD</span>
                            : '-'
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Lease</p>
                      <p className="font-medium text-gray-700 text-xs">
                        {property.leaseStart && property.leaseEnd
                          ? `${formatDate(property.leaseStart)} – ${formatDate(property.leaseEnd)}`
                          : property.status === 'active_rental' ? <span className="text-red-600">TBD</span> : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Purchased</p>
                      <p className="font-medium text-gray-700 text-xs">
                        {property.purchaseDate ? formatDate(property.purchaseDate) : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Purchase Price</p>
                      <p className="font-semibold text-gray-900 text-sm">
                        {property.purchasePrice ? formatCurrency(property.purchasePrice) : '-'}
                      </p>
                    </div>

                    {/* Row 2 */}
                    <div>
                      <p className="text-xs text-gray-400">Insurance</p>
                      <p className="font-semibold text-gray-900 text-sm">
                        {property.insuranceAnnual ? formatCurrency(property.insuranceAnnual) : '-'}
                      </p>
                      {property.insuranceProvider && (
                        <p className="text-xs text-gray-400">{property.insuranceProvider}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Council Rates</p>
                      <p className="font-semibold text-gray-900 text-sm">
                        {property.councilRatesAnnual ? formatCurrency(property.councilRatesAnnual) : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Total Debt</p>
                      <p className="font-semibold text-gray-900 text-sm">
                        {propDebt > 0 ? formatCurrency(propDebt) : property.loanIds.length > 0 ? 'TBD' : 'None'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Property Manager</p>
                      <p className="font-medium text-gray-700 text-xs">
                        {property.managementCompany || '-'}
                        {property.managementFeePercent ? ` (${property.managementFeePercent}%)` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Flags */}
                  {hasIssues && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                      {!property.depreciationScheduleAvailable && (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600">
                          <AlertTriangle size={11} /> No depreciation schedule
                        </span>
                      )}
                      {property.status === 'active_rental' && !property.weeklyRent && (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600">
                          <AlertTriangle size={11} /> Rent amount missing
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
