import { LayoutDashboard, Building2, Landmark, ArrowLeftRight, Receipt, FileText, ShieldCheck, ChevronDown, ChevronLeft, ChevronRight, Filter, Search, Mail } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { usePortfolioStore } from '../../store/portfolioStore';
import type { Page } from '../../types';

const navItems: { page: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { page: 'entities', label: 'Entities', icon: Building2 },
  { page: 'properties', label: 'Properties', icon: Landmark },
  { page: 'loans', label: 'Loans', icon: ArrowLeftRight },
  { page: 'expenses', label: 'Registers', icon: Receipt },
  { page: 'tax', label: 'Tax Prep', icon: FileText },
  { page: 'tax-review', label: 'Tax Review', icon: Search },
  { page: 'evidence', label: 'Evidence', icon: ShieldCheck },
  { page: 'email', label: 'Email Inbox', icon: Mail },
];

export function Sidebar() {
  const { activePage, setActivePage, activeEntityId, setActiveEntity, sidebarCollapsed, toggleSidebar } = useUIStore();
  const entities = usePortfolioStore((s) => s.entities);

  if (sidebarCollapsed) {
    return (
      <aside className="w-14 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0 shrink-0">
        <div className="p-2 border-b border-gray-200 flex justify-center">
          <button
            onClick={toggleSidebar}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            title="Expand sidebar"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <nav className="flex-1 px-1.5 py-3 space-y-0.5">
          {navItems.map(({ page, label, icon: Icon }) => {
            const isActive = activePage === page || (page === 'properties' && activePage === 'property-detail');
            return (
              <button
                key={page}
                onClick={() => setActivePage(page)}
                title={label}
                className={`w-full flex items-center justify-center p-2.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon size={18} />
              </button>
            );
          })}
        </nav>
      </aside>
    );
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0 shrink-0">
      <div className="p-5 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Property Portfolio</h1>
          <p className="text-xs text-gray-400 mt-0.5">Financial Dashboard</p>
        </div>
        <button
          onClick={toggleSidebar}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          title="Collapse sidebar"
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Entity Filter */}
      <div className="px-3 py-3 border-b border-gray-200">
        <div className="flex items-center gap-1.5 px-2 mb-2">
          <Filter size={12} className="text-gray-400" />
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Filter by Entity</span>
        </div>
        <div className="relative">
          <select
            value={activeEntityId || ''}
            onChange={(e) => setActiveEntity(e.target.value || null)}
            className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Entities</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.displayName}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        {activeEntityId && (
          <button
            onClick={() => setActiveEntity(null)}
            className="mt-1.5 text-xs text-blue-600 hover:text-blue-800 px-2"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {navItems.map(({ page, label, icon: Icon }) => {
          const isActive = activePage === page || (page === 'properties' && activePage === 'property-detail');
          return (
            <button
              key={page}
              onClick={() => setActivePage(page)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon size={18} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Tax Deadline */}
      <div className="p-3 border-t border-gray-200">
        <div className="bg-red-50 rounded-lg p-3">
          <p className="text-xs font-semibold text-red-800">Tax Returns Due</p>
          <p className="text-lg font-bold text-red-600">31 March 2026</p>
          <p className="text-xs text-red-500 mt-0.5">
            {Math.max(0, Math.ceil((new Date('2026-03-31').getTime() - Date.now()) / (1000*60*60*24)))} days remaining
          </p>
        </div>
      </div>
    </aside>
  );
}
