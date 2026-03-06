import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { usePortfolioStore } from './store/portfolioStore';
import { useFlowchartStore } from './store/flowchartStore';

function App() {
  const loadPortfolio = usePortfolioStore((s) => s.loadFromServer);
  const loadFlowchart = useFlowchartStore((s) => s.loadFromServer);
  const loaded = usePortfolioStore((s) => s._loaded);

  useEffect(() => {
    loadPortfolio().then((result) => {
      if (result?.flowchart) {
        loadFlowchart(result.flowchart as Parameters<typeof loadFlowchart>[0]);
      }
    });
  }, [loadPortfolio, loadFlowchart]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-gray-400">Loading portfolio data...</p>
      </div>
    );
  }

  return <AppShell />;
}

export default App;
