const API = '/api/portfolio';

// Fire-and-forget API calls — update local state immediately, persist in background
function persist(url: string, method: string, body?: unknown) {
  fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch((err) => console.error('Sync failed:', err));
}

export const portfolioApi = {
  loadSnapshot: async () => {
    const res = await fetch(`${API}/snapshot`);
    if (!res.ok) throw new Error('Failed to load snapshot');
    return res.json();
  },

  saveEntity: (entity: { id: string }) => persist(`${API}/entities/${entity.id}`, 'PUT', entity),
  saveProperty: (property: { id: string }) => persist(`${API}/properties/${property.id}`, 'PUT', property),
  saveLoan: (loan: { id: string }) => persist(`${API}/loans/${loan.id}`, 'PUT', loan),
  addLoan: (loan: { id: string }) => persist(`${API}/loans`, 'POST', loan),
  deleteLoan: (id: string) => persist(`${API}/loans/${id}`, 'DELETE'),
  savePurchaseBreakdown: (pb: { propertyId: string }) => persist(`${API}/purchase-breakdowns/${pb.propertyId}`, 'PUT', pb),
  deletePurchaseBreakdown: (propertyId: string) => persist(`${API}/purchase-breakdowns/${propertyId}`, 'DELETE'),
  saveTaxDocument: (doc: { id: string }) => persist(`${API}/tax-documents/${doc.id}`, 'PUT', doc),
  saveActionItem: (item: { id: string }) => persist(`${API}/action-items/${item.id}`, 'PUT', item),
  savePropertyDocument: (doc: { id: string }) => persist(`${API}/property-documents/${doc.id}`, 'PUT', doc),

  saveFlowchartKey: (key: string, value: unknown) => persist(`${API}/flowchart/${key}`, 'PUT', { value }),
};
