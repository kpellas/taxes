import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { usePortfolioStore } from './store/portfolioStore';
import { useFlowchartStore } from './store/flowchartStore';

function App() {
  const loadPortfolio = usePortfolioStore((s) => s.loadFromServer);
  const loadFlowchart = useFlowchartStore((s) => s.loadFromServer);

  useEffect(() => {
    loadPortfolio().then((result) => {
      if (result?.flowchart) {
        loadFlowchart(result.flowchart as Parameters<typeof loadFlowchart>[0]);
      }
    }).catch(() => {
      console.warn('API not available, using seed data');
    });
  }, [loadPortfolio, loadFlowchart]);

  return <AppShell />;
}

export default App;
