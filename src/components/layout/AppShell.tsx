import { Sidebar } from './Sidebar';
import { DashboardPage } from '../dashboard/DashboardPage';
import { EntitiesPage } from '../entities/EntitiesPage';
import { PropertiesPage } from '../properties/PropertiesPage';
import { PropertyDetail } from '../properties/PropertyDetail';
import { LoansPage } from '../loans/LoansPage';
import { TaxPrepPage } from '../tax/TaxPrepPage';
import { TaxReviewPage } from '../tax/TaxReviewPage';
import { EvidencePage } from '../evidence/EvidencePage';
import { ExpensesPage } from '../expenses/ExpensesPage';
import { EmailInboxPage } from '../email/EmailInboxPage';
import { ResearchPage } from '../research/ResearchPage';
import { BankFeedsPage } from '../banking/BankFeedsPage';
import { DocumentIndexPage } from '../documents/DocumentIndexPage';
import { ChatPanel } from '../chat/ChatPanel';
import { useUIStore } from '../../store/uiStore';

function PageContent() {
  const page = useUIStore((s) => s.activePage);

  switch (page) {
    case 'dashboard': return <DashboardPage />;
    case 'entities': return <EntitiesPage />;
    case 'properties': return <PropertiesPage />;
    case 'property-detail': return <PropertyDetail />;
    case 'loans': return <LoansPage />;
    case 'tax': return <TaxPrepPage />;
    case 'tax-review': return <TaxReviewPage />;
    case 'evidence': return <EvidencePage />;
    case 'expenses': return <ExpensesPage />;
    case 'email': return <EmailInboxPage />;
    case 'research': return <ResearchPage />;
    case 'documents': return <DocumentIndexPage />;
    case 'bank-feeds': return <BankFeedsPage />;
    default: return <DashboardPage />;
  }
}

export function AppShell() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1600px] mx-auto p-6">
          <PageContent />
        </div>
      </main>
      <ChatPanel />
    </div>
  );
}
