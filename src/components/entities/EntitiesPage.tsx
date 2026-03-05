import { AlertTriangle, MapPin, Users, ExternalLink } from 'lucide-react';
import { usePortfolioStore } from '../../store/portfolioStore';
import { useUIStore } from '../../store/uiStore';
import { formatCurrency } from '../../utils/format';

export function EntitiesPage() {
  const { entities, properties, loans } = usePortfolioStore();
  const { setActiveEntity, setActivePage, navigateToProperty } = useUIStore();

  const propertyEntities = entities.filter(e => e.type !== 'business_trust');
  const businessEntities = entities.filter(e => e.type === 'business_trust');

  function renderEntityCard(entity: typeof entities[0]) {
          const entityProps = properties.filter((p) => p.entityId === entity.id);
          const entityLoans = loans.filter(
            (l) => l.entityId === entity.id && l.status === 'active' && l.type !== 'offset'
          );
          const totalDebt = entityLoans.reduce((sum, l) => sum + (l.currentBalance ?? l.originalAmount), 0);
          const totalRent = entityProps.reduce((sum, p) => sum + p.annualRent, 0);

          return (
            <div
              key={entity.id}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden"
              style={{ borderLeftWidth: 3, borderLeftColor: entity.color }}
            >
              <div className="px-4 py-3">
                {/* Header row */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-gray-900">{entity.displayName}</h3>
                    {entity.needsConfirmation && <AlertTriangle size={11} className="text-amber-500" />}
                  </div>
                  <button
                    onClick={() => { setActiveEntity(entity.id); setActivePage('dashboard'); }}
                    className="text-xs text-blue-500 hover:text-blue-700"
                  >
                    <ExternalLink size={12} />
                  </button>
                </div>

                {/* Type + ABN + Owners inline */}
                <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                  <span className="px-1.5 py-0.5 bg-gray-100 rounded font-medium text-gray-500">
                    {entity.type === 'personal' ? 'Personal' : entity.type === 'trust' ? 'Trust' : 'Business Trust'}
                  </span>
                  {entity.abn && <span>ABN {entity.abn}</span>}
                  <span className="text-gray-300">|</span>
                  <Users size={10} />
                  <span>{entity.owners.map(o => `${o.name} ${o.percentage}%`).join(', ')}</span>
                </div>

                {/* KPIs row */}
                <div className="flex gap-4 text-xs mb-2">
                  <div>
                    <span className="text-gray-400">Properties </span>
                    <span className="font-semibold text-gray-700">{entityProps.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Loans </span>
                    <span className="font-semibold text-gray-700">{entityLoans.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Debt </span>
                    <span className="font-semibold text-gray-700">{totalDebt > 0 ? formatCurrency(totalDebt) : '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Rent </span>
                    <span className="font-semibold text-gray-700">{totalRent > 0 ? formatCurrency(totalRent) : '-'}</span>
                  </div>
                </div>

                {/* Properties */}
                {entityProps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {entityProps.map((prop) => (
                      <button
                        key={prop.id}
                        onClick={() => navigateToProperty(prop.id)}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-gray-50 rounded border border-gray-100 hover:bg-gray-100 transition-colors text-gray-600"
                      >
                        <MapPin size={10} className="text-gray-400" />
                        {prop.nickname}
                        <span className={`ml-1 w-1.5 h-1.5 rounded-full ${prop.status === 'active_rental' ? 'bg-emerald-400' : prop.status === 'deposit_paid' ? 'bg-amber-400' : 'bg-gray-300'}`} />
                      </button>
                    ))}
                  </div>
                )}

                {/* Notes - compact */}
                {entity.notes && (
                  <p className="text-xs text-amber-600 mt-2 truncate" title={entity.notes}>{entity.notes}</p>
                )}
              </div>
            </div>
          );
  }

  return (
    <div className="space-y-6">
      {/* Property Entities */}
      <div>
        <div className="mb-2">
          <h2 className="text-lg font-bold text-gray-900">Property Entities</h2>
          <p className="text-xs text-gray-400">{propertyEntities.length} entities</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {propertyEntities.map(renderEntityCard)}
        </div>
      </div>

      {/* Business Entities */}
      {businessEntities.length > 0 && (
        <div>
          <div className="mb-2">
            <h2 className="text-lg font-bold text-gray-900">Business</h2>
            <p className="text-xs text-gray-400">{businessEntities.length} entities</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {businessEntities.map(renderEntityCard)}
          </div>
        </div>
      )}
    </div>
  );
}
