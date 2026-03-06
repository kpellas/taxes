const BASIQ_BASE = 'https://au-api.basiq.io';
const BASIQ_VERSION = '3.0';

// Kelly's existing Basiq user
const BASIQ_USER_ID = 'e1ac55b1-30b4-4e8a-a9d0-c9d180dbb406';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const apiKey = process.env.BASIQ_API_KEY;
  if (!apiKey) throw new Error('BASIQ_API_KEY not configured');

  const res = await fetch(`${BASIQ_BASE}/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'basiq-version': BASIQ_VERSION,
    },
    body: 'scope=SERVER_ACCESS',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Basiq auth failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

async function basiqFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const res = await fetch(`${BASIQ_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'basiq-version': BASIQ_VERSION,
      ...(options.headers || {}),
    },
  });
  return res;
}

// ── Types ──

export interface BasiqAccount {
  id: string;
  name: string;
  accountNo: string;
  balance: number | null;
  availableFunds: number | null;
  currency: string;
  class: { type: string; product: string };
  institution: string;
  connection: string;
  status: string;
  lastUpdated: string;
}

export interface BasiqTransaction {
  id: string;
  status: string;
  description: string;
  amount: string;
  account: string;
  balance: string;
  direction: 'credit' | 'debit';
  class: string;
  institution: string;
  postDate: string;
  transactionDate: string;
  subClass?: { title: string; code: string };
  enrich?: { merchant?: { businessName: string } };
}

export interface BasiqConnection {
  id: string;
  status: string;
  institution: { id: string; name: string; logo?: { links?: { square?: string } } };
  lastUsed: string;
  createdDate: string;
}

// ── API Methods ──

export async function getStatus(): Promise<{
  configured: boolean;
  userId: string;
  sandbox: boolean;
}> {
  const apiKey = process.env.BASIQ_API_KEY;
  if (!apiKey) return { configured: false, userId: '', sandbox: true };

  // Check if sandbox by inspecting the token
  try {
    const token = await getToken();
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return {
      configured: true,
      userId: BASIQ_USER_ID,
      sandbox: !!payload.sandbox_account,
    };
  } catch {
    return { configured: !!apiKey, userId: BASIQ_USER_ID, sandbox: true };
  }
}

export async function createAuthLink(): Promise<{ url: string }> {
  const res = await basiqFetch(`/users/${BASIQ_USER_ID}/auth_link`, {
    method: 'POST',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create auth link (${res.status}): ${text}`);
  }
  const data = await res.json() as { links: { public: string } };
  return { url: data.links.public };
}

export async function getConnections(): Promise<BasiqConnection[]> {
  const res = await basiqFetch(`/users/${BASIQ_USER_ID}/connections`);
  if (!res.ok) throw new Error(`Failed to fetch connections: ${res.status}`);
  const data = await res.json() as { data: any[] };
  return (data.data || []).map(c => ({
    id: c.id,
    status: c.status,
    institution: {
      id: c.institution?.id || '',
      name: c.institution?.name || c.institution?.shortName || 'Unknown',
      logo: c.institution?.logo,
    },
    lastUsed: c.lastUsed || '',
    createdDate: c.createdDate || '',
  }));
}

export async function refreshConnection(connectionId: string): Promise<{ jobId: string }> {
  const res = await basiqFetch(`/users/${BASIQ_USER_ID}/connections/${connectionId}/refresh`, {
    method: 'POST',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to refresh connection (${res.status}): ${text}`);
  }
  const data = await res.json() as { id: string };
  return { jobId: data.id };
}

export async function getAccounts(): Promise<BasiqAccount[]> {
  const res = await basiqFetch(`/users/${BASIQ_USER_ID}/accounts`);
  if (!res.ok) throw new Error(`Failed to fetch accounts: ${res.status}`);
  const data = await res.json() as { data: any[] };
  return (data.data || []).map(a => ({
    id: a.id,
    name: a.name || '',
    accountNo: a.accountNo || a.accountNumber || '',
    balance: a.balance != null ? parseFloat(a.balance) : null,
    availableFunds: a.availableFunds != null ? parseFloat(a.availableFunds) : null,
    currency: a.currency || 'AUD',
    class: a.class || { type: '', product: '' },
    institution: a.institution || '',
    connection: a.connection || '',
    status: a.status || '',
    lastUpdated: a.lastUpdated || '',
  }));
}

export async function getTransactions(options?: {
  accountId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<{ transactions: BasiqTransaction[]; nextUrl: string | null }> {
  const params = new URLSearchParams();

  // Build filter string
  const filters: string[] = [];
  if (options?.accountId) {
    filters.push(`account.id.eq('${options.accountId}')`);
  }
  if (options?.from) {
    filters.push(`transaction.postDate.gteq('${options.from}')`);
  }
  if (options?.to) {
    filters.push(`transaction.postDate.lteq('${options.to}')`);
  }
  if (filters.length > 0) {
    params.set('filter', filters.join(','));
  }
  if (options?.limit) {
    params.set('limit', String(options.limit));
  }

  const qs = params.toString();
  const path = `/users/${BASIQ_USER_ID}/transactions${qs ? '?' + qs : ''}`;
  const res = await basiqFetch(path);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch transactions (${res.status}): ${text}`);
  }
  const data = await res.json() as { data: any[]; links?: { next?: string } };

  const transactions: BasiqTransaction[] = (data.data || []).map(t => ({
    id: t.id,
    status: t.status || '',
    description: t.description || '',
    amount: t.amount || '0',
    account: t.account || '',
    balance: t.balance || '',
    direction: t.direction || 'debit',
    class: t.class || '',
    institution: t.institution || '',
    postDate: t.postDate || '',
    transactionDate: t.transactionDate || '',
    subClass: t.subClass,
    enrich: t.enrich,
  }));

  return { transactions, nextUrl: data.links?.next || null };
}

/** Fetch ALL transactions (paginating automatically) for an account in a date range */
export async function getAllTransactions(options?: {
  accountId?: string;
  from?: string;
  to?: string;
}): Promise<BasiqTransaction[]> {
  const all: BasiqTransaction[] = [];
  let nextUrl: string | null = null;

  // First page
  const first = await getTransactions({ ...options, limit: 500 });
  all.push(...first.transactions);
  nextUrl = first.nextUrl;

  // Paginate
  while (nextUrl) {
    const res = await basiqFetch(nextUrl.replace(BASIQ_BASE, ''));
    if (!res.ok) break;
    const data = await res.json() as { data: any[]; links?: { next?: string } };
    const page = (data.data || []).map((t: any) => ({
      id: t.id,
      status: t.status || '',
      description: t.description || '',
      amount: t.amount || '0',
      account: t.account || '',
      balance: t.balance || '',
      direction: t.direction || 'debit',
      class: t.class || '',
      institution: t.institution || '',
      postDate: t.postDate || '',
      transactionDate: t.transactionDate || '',
      subClass: t.subClass,
      enrich: t.enrich,
    }));
    all.push(...page);
    nextUrl = data.links?.next || null;
  }

  return all;
}
