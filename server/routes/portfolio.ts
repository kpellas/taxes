import { Router, Request, Response } from 'express';
import {
  getAll, getById, getByField,
  upsertEntity, upsertProperty, upsertLoan, deleteLoan as dbDeleteLoan,
  upsertPurchaseBreakdown, deletePurchaseBreakdown as dbDeletePB,
  upsertTaxDocument, upsertActionItem,
  upsertTimelineEvent, upsertPropertyDocument,
  getFlowchartState, setFlowchartState,
} from '../db.js';

const router = Router();

// ── Entities ──
router.get('/entities', (_req: Request, res: Response) => {
  res.json(getAll('entities'));
});

router.put('/entities/:id', (req: Request, res: Response) => {
  const entity = { ...req.body, id: req.params.id };
  upsertEntity(entity);
  res.json(entity);
});

// ── Properties ──
router.get('/properties', (_req: Request, res: Response) => {
  res.json(getAll('properties'));
});

router.get('/properties/:id', (req: Request, res: Response) => {
  const p = getById('properties', req.params.id);
  if (!p) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(p);
});

router.put('/properties/:id', (req: Request, res: Response) => {
  const property = { ...req.body, id: req.params.id };
  upsertProperty(property);
  res.json(property);
});

// ── Loans ──
router.get('/loans', (_req: Request, res: Response) => {
  res.json(getAll('loans'));
});

router.get('/loans/:id', (req: Request, res: Response) => {
  const l = getById('loans', req.params.id);
  if (!l) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(l);
});

router.put('/loans/:id', (req: Request, res: Response) => {
  const loan = { ...req.body, id: req.params.id };
  upsertLoan(loan);
  res.json(loan);
});

router.post('/loans', (req: Request, res: Response) => {
  const loan = req.body;
  if (!loan.id) { res.status(400).json({ error: 'id required' }); return; }
  upsertLoan(loan);
  res.json(loan);
});

router.delete('/loans/:id', (req: Request, res: Response) => {
  dbDeleteLoan(req.params.id);
  res.json({ ok: true });
});

// ── Purchase Breakdowns ──
router.get('/purchase-breakdowns', (_req: Request, res: Response) => {
  res.json(getAll('purchase_breakdowns'));
});

router.put('/purchase-breakdowns/:propertyId', (req: Request, res: Response) => {
  const pb = { ...req.body, propertyId: req.params.propertyId };
  upsertPurchaseBreakdown(pb);
  res.json(pb);
});

router.delete('/purchase-breakdowns/:propertyId', (req: Request, res: Response) => {
  dbDeletePB(req.params.propertyId);
  res.json({ ok: true });
});

// ── Tax Documents ──
router.get('/tax-documents', (_req: Request, res: Response) => {
  res.json(getAll('tax_documents'));
});

router.put('/tax-documents/:id', (req: Request, res: Response) => {
  const doc = { ...req.body, id: req.params.id };
  upsertTaxDocument(doc);
  res.json(doc);
});

// ── Action Items ──
router.get('/action-items', (_req: Request, res: Response) => {
  res.json(getAll('action_items'));
});

router.put('/action-items/:id', (req: Request, res: Response) => {
  const item = { ...req.body, id: req.params.id };
  upsertActionItem(item);
  res.json(item);
});

// ── Timeline Events ──
router.get('/timeline-events', (_req: Request, res: Response) => {
  res.json(getAll('timeline_events'));
});

router.get('/timeline-events/property/:propertyId', (req: Request, res: Response) => {
  res.json(getByField('timeline_events', 'property_id', req.params.propertyId));
});

router.put('/timeline-events/:id', (req: Request, res: Response) => {
  const event = { ...req.body, id: req.params.id };
  upsertTimelineEvent(event);
  res.json(event);
});

// ── Property Documents ──
router.get('/property-documents', (_req: Request, res: Response) => {
  res.json(getAll('property_documents'));
});

router.put('/property-documents/:id', (req: Request, res: Response) => {
  const doc = { ...req.body, id: req.params.id };
  upsertPropertyDocument(doc);
  res.json(doc);
});

// ── Flowchart State ──
router.get('/flowchart', (_req: Request, res: Response) => {
  const positions = getFlowchartState('positions') ?? {};
  const arrows = getFlowchartState('arrows') ?? [];
  const periodLabelOverrides = getFlowchartState('periodLabelOverrides') ?? {};
  const boxColors = getFlowchartState('boxColors') ?? {};
  res.json({ positions, arrows, periodLabelOverrides, boxColors });
});

router.put('/flowchart/:key', (req: Request, res: Response) => {
  const { key } = req.params;
  setFlowchartState(key, req.body.value);
  res.json({ ok: true });
});

// ── Bulk load (initial page load) ──
router.get('/snapshot', (_req: Request, res: Response) => {
  res.json({
    entities: getAll('entities'),
    properties: getAll('properties'),
    loans: getAll('loans'),
    purchaseBreakdowns: getAll('purchase_breakdowns'),
    taxDocuments: getAll('tax_documents'),
    actionItems: getAll('action_items'),
    timelineEvents: getAll('timeline_events'),
    propertyDocuments: getAll('property_documents'),
    flowchart: {
      positions: getFlowchartState('positions') ?? {},
      arrows: getFlowchartState('arrows') ?? [],
      periodLabelOverrides: getFlowchartState('periodLabelOverrides') ?? {},
      boxColors: getFlowchartState('boxColors') ?? {},
    },
  });
});

export { router as portfolioRouter };
