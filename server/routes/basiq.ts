import { Router, Request, Response } from 'express';
import {
  getStatus, createAuthLink, getConnections, refreshConnection,
  getAccounts, getTransactions, getAllTransactions,
} from '../services/basiq.js';

const router = Router();

// GET /api/basiq/status
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/basiq/auth-link — get consent URL for user to connect a bank
router.post('/auth-link', async (_req: Request, res: Response) => {
  try {
    const result = await createAuthLink();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/basiq/connections
router.get('/connections', async (_req: Request, res: Response) => {
  try {
    const connections = await getConnections();
    res.json({ connections });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/basiq/connections/:id/refresh
router.post('/connections/:id/refresh', async (req: Request, res: Response) => {
  try {
    const result = await refreshConnection(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/basiq/accounts
router.get('/accounts', async (_req: Request, res: Response) => {
  try {
    const accounts = await getAccounts();
    res.json({ accounts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/basiq/transactions?account=X&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const accountId = req.query.account as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

    const result = await getTransactions({ accountId, from, to, limit });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/basiq/transactions/all?account=X&from=YYYY-MM-DD&to=YYYY-MM-DD
// Fetches ALL pages — can be slow for large date ranges
router.get('/transactions/all', async (req: Request, res: Response) => {
  try {
    const accountId = req.query.account as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const transactions = await getAllTransactions({ accountId, from, to });
    res.json({ transactions, total: transactions.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as basiqRouter };
