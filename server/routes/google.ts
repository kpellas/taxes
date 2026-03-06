import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import Anthropic from '@anthropic-ai/sdk';
import db from '../db.js';

const router = Router();

// ── Schema ──
db.exec(`
  CREATE TABLE IF NOT EXISTS google_tokens (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expiry_date INTEGER,
    scope TEXT
  );

  CREATE TABLE IF NOT EXISTS saved_findings (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_id TEXT,
    title TEXT NOT NULL,
    snippet TEXT,
    content TEXT,
    date TEXT,
    from_address TEXT,
    property_id TEXT,
    entity_id TEXT,
    loan_id TEXT,
    tags TEXT DEFAULT '[]',
    saved_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS gmail_cache (
    id TEXT PRIMARY KEY,
    thread_id TEXT,
    from_address TEXT,
    to_address TEXT,
    subject TEXT,
    date TEXT,
    snippet TEXT,
    body_text TEXT,
    has_attachments INTEGER DEFAULT 0,
    cached_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS research_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS research_turns (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    query TEXT NOT NULL,
    answer TEXT,
    search_queries TEXT DEFAULT '[]',
    gmail_results TEXT DEFAULT '[]',
    drive_results TEXT DEFAULT '[]',
    total_fetched INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES research_sessions(id)
  );
`);

function getPortfolioContext(): string {
  try {
    const properties = db.prepare('SELECT * FROM properties').all() as any[];
    const loans = db.prepare('SELECT * FROM loans').all() as any[];
    const entities = db.prepare('SELECT * FROM entities').all() as any[];

    const lines: string[] = ['PORTFOLIO CONTEXT:'];

    for (const e of entities) {
      lines.push(`Entity: ${e.display_name} (${e.type}) [id: ${e.id}]`);
    }

    for (const p of properties) {
      const aliases = p.aliases ? JSON.parse(p.aliases) : [];
      const ownership = p.ownership ? JSON.parse(p.ownership) : [];
      const ownerStr = ownership.map((o: any) => `${o.name} ${o.percentage}%`).join(', ');
      const aliasList = aliases.length > 0 ? ` aka ${aliases.join(', ')}` : '';
      const propLoans = loans.filter((l: any) => l.property_id === p.id && l.status === 'active');
      const loanStr = propLoans.map((l: any) => `${l.lender} #${l.account_number} $${l.original_amount}`).join('; ');
      lines.push(
        `Property: ${p.nickname}${aliasList} — ${p.address}, ${p.suburb} ${p.state} ${p.postcode || ''}` +
        ` | Entity: ${p.entity_id} | Status: ${p.status}` +
        ` | Purchase: $${p.purchase_price || '?'} on ${p.purchase_date || '?'}` +
        (p.land_cost ? ` | Land: $${p.land_cost}` : '') +
        (p.build_cost ? ` | Build: $${p.build_cost}` : '') +
        (p.deposit ? ` | Deposit: $${p.deposit}` : '') +
        ` | Ownership: ${ownerStr}` +
        (p.development ? ` | Development: ${p.development}` : '') +
        (loanStr ? ` | Loans: ${loanStr}` : ' | No debt')
      );
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}

function getClaudeClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your-api-key-here') return null;
  return new Anthropic({ apiKey });
}

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google/callback';

  if (!clientId || !clientSecret) return null;

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getStoredTokens(): { access_token: string; refresh_token?: string; expiry_date?: number } | null {
  const row = db.prepare('SELECT * FROM google_tokens WHERE id = 1').get() as any;
  if (!row) return null;
  return {
    access_token: row.access_token,
    refresh_token: row.refresh_token || undefined,
    expiry_date: row.expiry_date || undefined,
  };
}

function storeTokens(tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null }) {
  const existing = getStoredTokens();
  db.prepare(`INSERT OR REPLACE INTO google_tokens (id, access_token, refresh_token, expiry_date) VALUES (1, ?, ?, ?)`)
    .run(
      tokens.access_token || existing?.access_token || '',
      tokens.refresh_token || existing?.refresh_token || null,
      tokens.expiry_date || existing?.expiry_date || null,
    );
}

async function getAuthedClient() {
  const client = getOAuth2Client();
  if (!client) return null;

  const tokens = getStoredTokens();
  if (!tokens) return null;

  client.setCredentials(tokens);

  // Auto-refresh if expired
  client.on('tokens', (newTokens) => {
    storeTokens(newTokens);
  });

  return client;
}

// ── Status ──
router.get('/status', (_req: Request, res: Response) => {
  const client = getOAuth2Client();
  const tokens = getStoredTokens();
  res.json({
    configured: !!client,
    connected: !!tokens,
    hasRefreshToken: !!tokens?.refresh_token,
  });
});

// ── OAuth Flow ──
router.get('/auth', (_req: Request, res: Response) => {
  const client = getOAuth2Client();
  if (!client) {
    res.status(500).json({ error: 'Google credentials not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env' });
    return;
  }

  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
  });

  res.json({ url });
});

router.get('/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) {
    res.status(400).json({ error: 'No code provided' });
    return;
  }

  const client = getOAuth2Client();
  if (!client) {
    res.status(500).json({ error: 'Google credentials not configured' });
    return;
  }

  try {
    const { tokens } = await client.getToken(code);
    storeTokens(tokens);
    // Redirect back to the Vite dev server (or production)
    const devPort = process.env.VITE_PORT || '3456';
    const redirectBase = process.env.NODE_ENV === 'production' ? '' : `http://localhost:${devPort}`;
    res.redirect(`${redirectBase}/?google=connected`);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to exchange code' });
  }
});

router.post('/disconnect', (_req: Request, res: Response) => {
  db.prepare('DELETE FROM google_tokens WHERE id = 1').run();
  res.json({ success: true });
});

// ── Gmail Search ──
router.get('/gmail/search', async (req: Request, res: Response) => {
  const q = req.query.q as string;
  const pageToken = req.query.pageToken as string | undefined;
  if (!q) { res.status(400).json({ error: 'q required' }); return; }

  const auth = await getAuthedClient();
  if (!auth) { res.status(401).json({ error: 'Not connected to Google' }); return; }

  try {
    const gmail = google.gmail({ version: 'v1', auth });
    const list = await gmail.users.messages.list({
      userId: 'me',
      q,
      maxResults: 20,
      pageToken: pageToken || undefined,
    });

    const messages = list.data.messages || [];
    const results = await Promise.all(
      messages.map(async (msg) => {
        const full = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date'],
        });
        const headers = full.data.payload?.headers || [];
        const get = (name: string) => headers.find(h => h.name === name)?.value || '';
        return {
          id: msg.id,
          threadId: msg.threadId,
          from: get('From'),
          to: get('To'),
          subject: get('Subject'),
          date: get('Date'),
          snippet: full.data.snippet || '',
          hasAttachments: (full.data.payload?.parts || []).some(p => p.filename && p.filename.length > 0),
        };
      })
    );

    res.json({
      results,
      nextPageToken: list.data.nextPageToken || null,
      total: list.data.resultSizeEstimate || results.length,
    });
  } catch (err: any) {
    if (err.code === 401) {
      db.prepare('DELETE FROM google_tokens WHERE id = 1').run();
      res.status(401).json({ error: 'Google session expired. Please reconnect.' });
    } else {
      res.status(500).json({ error: err.message || 'Gmail search failed' });
    }
  }
});

// ── Gmail Message Detail ──
router.get('/gmail/:id', async (req: Request, res: Response) => {
  const auth = await getAuthedClient();
  if (!auth) { res.status(401).json({ error: 'Not connected to Google' }); return; }

  try {
    const gmail = google.gmail({ version: 'v1', auth });
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: req.params.id,
      format: 'full',
    });

    const headers = full.data.payload?.headers || [];
    const get = (name: string) => headers.find(h => h.name === name)?.value || '';

    // Extract body text
    let bodyText = '';
    function extractText(part: any) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        bodyText += Buffer.from(part.body.data, 'base64url').toString('utf-8');
      }
      if (part.parts) part.parts.forEach(extractText);
    }
    if (full.data.payload) extractText(full.data.payload);

    // Extract attachments metadata
    const attachments: { id: string; filename: string; mimeType: string; size: number }[] = [];
    function extractAttachments(part: any) {
      if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0,
        });
      }
      if (part.parts) part.parts.forEach(extractAttachments);
    }
    if (full.data.payload) extractAttachments(full.data.payload);

    res.json({
      id: full.data.id,
      threadId: full.data.threadId,
      from: get('From'),
      to: get('To'),
      subject: get('Subject'),
      date: get('Date'),
      snippet: full.data.snippet || '',
      bodyText,
      attachments,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch message' });
  }
});

// ── Gmail Attachment Download ──
router.get('/gmail/:messageId/attachment/:attachmentId', async (req: Request, res: Response) => {
  const auth = await getAuthedClient();
  if (!auth) { res.status(401).json({ error: 'Not connected to Google' }); return; }

  try {
    const gmail = google.gmail({ version: 'v1', auth });
    const att = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: req.params.messageId,
      id: req.params.attachmentId,
    });

    const data = att.data.data;
    if (!data) { res.status(404).json({ error: 'No attachment data' }); return; }

    const buffer = Buffer.from(data, 'base64url');
    const filename = req.query.filename as string || 'attachment';
    const mimeType = req.query.mimeType as string || 'application/octet-stream';
    const inlineTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const disposition = inlineTypes.includes(mimeType) ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.setHeader('Content-Type', mimeType);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to download attachment' });
  }
});

// ── Drive Search ──
router.get('/drive/search', async (req: Request, res: Response) => {
  const q = req.query.q as string;
  const pageToken = req.query.pageToken as string | undefined;
  if (!q) { res.status(400).json({ error: 'q required' }); return; }

  const auth = await getAuthedClient();
  if (!auth) { res.status(401).json({ error: 'Not connected to Google' }); return; }

  try {
    const drive = google.drive({ version: 'v3', auth });
    const list = await drive.files.list({
      q: `fullText contains '${q.replace(/'/g, "\\'")}'`,
      pageSize: 20,
      pageToken: pageToken || undefined,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, webViewLink, parents)',
      orderBy: 'modifiedTime desc',
    });

    res.json({
      results: (list.data.files || []).map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        size: f.size ? parseInt(f.size) : null,
        webViewLink: f.webViewLink,
      })),
      nextPageToken: list.data.nextPageToken || null,
    });
  } catch (err: any) {
    if (err.code === 401) {
      db.prepare('DELETE FROM google_tokens WHERE id = 1').run();
      res.status(401).json({ error: 'Google session expired. Please reconnect.' });
    } else {
      res.status(500).json({ error: err.message || 'Drive search failed' });
    }
  }
});

// ── Smart Search (Claude-powered) ──
router.post('/smart-search', async (req: Request, res: Response) => {
  const { query, source = 'gmail', history } = req.body;
  if (!query) { res.status(400).json({ error: 'query required' }); return; }

  // Build conversation context for follow-up questions
  const conversationCtx = (history && Array.isArray(history) && history.length > 0)
    ? '\n\nPREVIOUS CONVERSATION:\n' + history.map((h: any) =>
        `Q: ${h.query}\nA: ${h.answer || '(no answer)'}`
      ).join('\n\n') + '\n\nThe user is now asking a FOLLOW-UP question. Use the conversation above to understand context (e.g. which property they\'re asking about).'
    : '';

  const claude = getClaudeClient();
  if (!claude) { res.status(503).json({ error: 'Claude API not configured' }); return; }

  const auth = await getAuthedClient();
  if (!auth) { res.status(401).json({ error: 'Not connected to Google' }); return; }

  const portfolioCtx = getPortfolioContext();

  try {
    // Step 1: Ask Claude to extract Gmail-friendly search keywords
    const keywordResponse = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{ role: 'user', content: query }],
      system: `You are a search query translator. The user is Kelly Pellas. She may ask about ANYTHING in her email — properties, business expenses, accountant correspondence, personal finances, tax, insurance, tradies, anything.

${portfolioCtx}${conversationCtx}

Convert their natural language question into 2-4 BROAD Gmail search queries. The goal is to CAST A WIDE NET and get lots of results — Claude will filter for relevance later.

USE YOUR KNOWLEDGE to expand searches intelligently:
- Property aliases: "Chisholm" → also "Waterford", "Goldring", "Caifu"
- People: "accountant" → "Elizabeth", "broker" → "Jordan", "solicitor" → "JMH", "Rhett"
- Business: "M2K2" → also "Sarcophilus", "consulting"
- Financial terms: "deposit" → could be land deposit, build deposit, bank transfer
- Use property names, suburb names, development names, lender names, people's names from the portfolio data

QUERY RULES:
- Keep each query to 1-2 words MAX for the keyword part. Single keywords work best.
- NEVER use from: or subject: operators unless the user specifically names a sender
- NEVER include account numbers or specific IDs — they rarely appear in email text
- Generate overlapping queries to maximize coverage

DATE FILTERING — CRITICAL:
- If the user mentions a specific date, month, or year, you MUST add Gmail date operators to EVERY query
- Use after:YYYY/MM/DD and before:YYYY/MM/DD to constrain the date range
- For a specific month like "November 2019", use after:2019/10/15 before:2019/12/15 (add ~2 week buffer)
- For a specific year like "2019", use after:2018/12/01 before:2020/02/01
- For "around November 2019", use after:2019/09/01 before:2020/02/01 (wider buffer)
- ALWAYS add the date operators to each query string

Return ONLY a JSON array of search query strings, nothing else.`,
    });

    const keywordText = keywordResponse.content[0].type === 'text' ? keywordResponse.content[0].text : '';
    let searchQueries: string[];
    try {
      searchQueries = JSON.parse(keywordText);
      if (!Array.isArray(searchQueries)) throw new Error('not array');
    } catch {
      // Try to extract a JSON array from the response (Claude sometimes wraps it in prose)
      const arrayMatch = keywordText.match(/\[[\s\S]*?\]/);
      if (arrayMatch) {
        try {
          const parsed = JSON.parse(arrayMatch[0]);
          if (Array.isArray(parsed) && parsed.length > 0) {
            searchQueries = parsed;
          } else {
            throw new Error('empty');
          }
        } catch {
          searchQueries = [];
        }
      } else {
        searchQueries = [];
      }

      // Final fallback: extract key nouns/phrases from the query
      if (searchQueries.length === 0) {
        const stopWords = new Set(['can', 'you', 'the', 'is', 'was', 'were', 'are', 'a', 'an', 'it', 'its', 'for', 'of', 'to', 'in', 'on', 'at', 'and', 'or', 'but', 'not', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'has', 'have', 'had', 'been', 'be', 'being', 'that', 'this', 'with', 'from', 'what', 'when', 'where', 'how', 'much', 'many', 'about', 'please', 'tell', 'me', 'my', 'we', 'our', 'i', 'confirm', 'find', 'show', 'get', 'know', 'there']);
        const words = query.toLowerCase().replace(/[^a-z0-9\s$]/g, '').split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w));
        // Build 1-2 search queries from the keywords
        if (words.length > 0) {
          searchQueries = [words.slice(0, 3).join(' ')];
          if (words.length > 3) searchQueries.push(words.slice(2, 5).join(' '));
        } else {
          searchQueries = [query.split(/\s+/).slice(0, 3).join(' ')];
        }
      }
    }

    // Step 2a: Search Google Drive (in parallel with Gmail)
    const drive = google.drive({ version: 'v3', auth });
    const driveFiles = new Map<string, any>();

    // Strip date operators for Drive queries (Drive uses modifiedTime instead)
    const driveQueries = searchQueries.slice(0, 4).map(sq => sq.replace(/\b(after|before):\S+/g, '').trim()).filter(Boolean);
    const uniqueDriveQueries = [...new Set(driveQueries)];

    const driveSearchPromise = Promise.all(
      uniqueDriveQueries.map(async (sq) => {
        try {
          const escaped = sq.replace(/'/g, "\\'");
          const list = await drive.files.list({
            q: `fullText contains '${escaped}'`,
            pageSize: 20,
            fields: 'files(id, name, mimeType, modifiedTime, size, webViewLink)',
            orderBy: 'modifiedTime desc',
          });
          for (const f of list.data.files || []) {
            if (f.id && !driveFiles.has(f.id)) {
              driveFiles.set(f.id, {
                id: f.id,
                name: f.name,
                mimeType: f.mimeType,
                modifiedTime: f.modifiedTime,
                size: f.size ? parseInt(f.size) : null,
                webViewLink: f.webViewLink,
              });
            }
          }
        } catch { /* skip failed queries */ }
      })
    );

    // Step 2b: Fetch results from Gmail for each query
    const gmail = google.gmail({ version: 'v1', auth });
    const allMessages = new Map<string, any>();

    const gmailSearchPromise = (async () => {
      for (const sq of searchQueries.slice(0, 4)) {
        try {
          const list = await gmail.users.messages.list({
            userId: 'me',
            q: sq,
            maxResults: 80,
          });
          const messages = list.data.messages || [];
          for (const msg of messages) {
            if (!allMessages.has(msg.id!)) {
              allMessages.set(msg.id!, msg);
            }
          }
        } catch { /* skip failed queries */ }
      }
    })();

    // Wait for both to complete
    await Promise.all([driveSearchPromise, gmailSearchPromise]);

    // Step 3: Fetch metadata for each unique message (check cache first)
    const results: any[] = [];
    const uncachedIds: string[] = [];

    for (const [msgId] of allMessages) {
      const cached = db.prepare('SELECT * FROM gmail_cache WHERE id = ?').get(msgId) as any;
      if (cached) {
        results.push({
          id: cached.id,
          threadId: cached.thread_id,
          from: cached.from_address,
          to: cached.to_address,
          subject: cached.subject,
          date: cached.date,
          snippet: cached.snippet,
          hasAttachments: !!cached.has_attachments,
          bodyPreview: cached.body_text?.substring(0, 300) || cached.snippet,
        });
      } else {
        uncachedIds.push(msgId);
      }
    }

    // Fetch and cache uncached messages (in batches of 10)
    for (let i = 0; i < uncachedIds.length; i += 10) {
      const batch = uncachedIds.slice(i, i + 10);
      const fetched = await Promise.all(
        batch.map(async (msgId) => {
          try {
            const full = await gmail.users.messages.get({
              userId: 'me',
              id: msgId,
              format: 'full',
            });
            const headers = full.data.payload?.headers || [];
            const get = (name: string) => headers.find(h => h.name === name)?.value || '';

            // Extract body text
            let bodyText = '';
            function extractText(part: any) {
              if (part.mimeType === 'text/plain' && part.body?.data) {
                bodyText += Buffer.from(part.body.data, 'base64url').toString('utf-8');
              }
              if (part.parts) part.parts.forEach(extractText);
            }
            if (full.data.payload) extractText(full.data.payload);

            const hasAttachments = (full.data.payload?.parts || []).some(
              (p: any) => p.filename && p.filename.length > 0
            );

            const result = {
              id: msgId,
              threadId: full.data.threadId || '',
              from: get('From'),
              to: get('To'),
              subject: get('Subject'),
              date: get('Date'),
              snippet: full.data.snippet || '',
              hasAttachments,
              bodyPreview: (bodyText || full.data.snippet || '').substring(0, 300),
              bodyText,
            };

            // Cache in SQLite
            db.prepare(
              `INSERT OR REPLACE INTO gmail_cache (id, thread_id, from_address, to_address, subject, date, snippet, body_text, has_attachments) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              msgId, result.threadId, result.from, result.to,
              result.subject, result.date, result.snippet,
              bodyText.substring(0, 8000), // Cap cached body at 8K chars
              hasAttachments ? 1 : 0,
            );

            return result;
          } catch {
            return null;
          }
        })
      );
      results.push(...fetched.filter(Boolean));
    }

    if (results.length === 0) {
      res.json({ results: [], driveResults: [...driveFiles.values()], searchQueries, reasoning: 'No results found for any search query.', answer: null });
      return;
    }

    // Step 4: Ask Claude to rank results by relevance (using previews)
    const summaries = results.map((r, i) => (
      `[${i}] Subject: ${r.subject}\nFrom: ${r.from}\nDate: ${r.date}\nPreview: ${r.bodyPreview?.substring(0, 500) || r.snippet}`
    )).join('\n\n');

    const rankResponse = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: `Original question: "${query}"\n\nHere are ${results.length} email results. Rank them by relevance to the question.\n\n${summaries}` }],
      system: `You rank email search results by relevance to the user's question. Return ONLY a JSON object with:
- "indices": array of result indices sorted by relevance (most relevant first)
- "reasoning": one sentence explaining what you found

BE INCLUSIVE — include anything even loosely related. Better to show too many results than miss something useful. Only exclude results that are clearly completely unrelated (e.g. personal emails about dinner plans when searching for loan documents).

Example: {"indices":[3,0,7,1,5],"reasoning":"Found 5 emails related to Bankwest loans and statements."}

If truly nothing is relevant, return {"indices":[],"reasoning":"None of these emails appear related to the question."}`,
    });

    const rankText = rankResponse.content[0].type === 'text' ? rankResponse.content[0].text : '{}';
    let ranking: { indices: number[]; reasoning: string };
    try {
      ranking = JSON.parse(rankText);
      if (!Array.isArray(ranking.indices)) ranking = { indices: results.map((_, i) => i), reasoning: '' };
    } catch {
      ranking = { indices: results.map((_, i) => i), reasoning: 'Could not rank results.' };
    }

    // Step 5: Build ranked results list
    const ranked = ranking.indices
      .filter(i => i >= 0 && i < results.length)
      .map(i => {
        const r = results[i];
        return {
          id: r.id,
          threadId: r.threadId,
          from: r.from,
          to: r.to,
          subject: r.subject,
          date: r.date,
          snippet: r.snippet,
          hasAttachments: r.hasAttachments,
        };
      });

    // Step 6: Analyse top results to answer the question
    // Use full body text from the top 20 most relevant results — read as much as possible
    const topIndices = ranking.indices.filter(i => i >= 0 && i < results.length).slice(0, 20);

    // For cached emails, get full body from cache instead of truncated preview
    const emailContents = topIndices.map(i => {
      const r = results[i];
      let body = r.bodyText || '';
      if (!body || body.length < 200) {
        // Try getting from cache
        const cached = db.prepare('SELECT body_text FROM gmail_cache WHERE id = ?').get(r.id) as any;
        if (cached?.body_text) body = cached.body_text;
      }
      if (!body) body = r.bodyPreview || r.snippet || '';
      return `--- Email ${i} ---\nSubject: ${r.subject}\nFrom: ${r.from}\nDate: ${r.date}\nBody:\n${body.substring(0, 6000)}`;
    }).join('\n\n');

    // Also include Drive file names for context
    const driveContext = driveFiles.size > 0
      ? '\n\nDRIVE FILES FOUND:\n' + [...driveFiles.values()].map(f => `- ${f.name} (${f.mimeType}, modified ${f.modifiedTime})`).join('\n')
      : '';

    let answer: string | null = null;
    if (topIndices.length > 0) {
      try {
        const answerResponse = await claude.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 3000,
          messages: [{ role: 'user', content: `Question: "${query}"\n\nHere are the ${topIndices.length} most relevant emails I found:\n\n${emailContents}${driveContext}` }],
          system: `You are Kelly Pellas's expert research assistant. You help with questions about properties, business (M2K2 Trust / Sarcophilus Consulting), tax, accountant correspondence, insurance, expenses, and anything else in her email and files.

${portfolioCtx}${conversationCtx}

Read ALL the emails provided thoroughly. Extract every concrete data point you can find.

PRIORITY: HARD DATA OVER NARRATIVE
Your #1 job is finding and presenting specific numbers, dates, and facts. The user needs data they can act on, not a story.

FOR LOAN/FINANCE QUESTIONS, always try to extract:
- **Loan amount** (approved/drawn)
- **Account number**
- **Interest rate** (fixed or variable, and the rate)
- **Loan type** (IO, P&I, construction, offset)
- **LVR** (loan-to-value ratio)
- **Valuation amount**
- **Settlement/approval date**
- **Lender contact** (broker, BDM)
- **Fees** (application, settlement, LMI)
- **Security property**
- **Borrower name(s)**

FOR PROPERTY QUESTIONS, always try to extract:
- **Purchase price** (land + build if H&L)
- **Deposit amount** and date paid
- **Settlement date**
- **Current value / valuation**
- **Ownership structure**
- **Key contacts** (solicitor, agent, PM, builder)

FORMAT WITH MARKDOWN:
- Use a **key facts table** or bullet list at the top with the hard data points
- Use **bold** for every number, date, and name
- Use ### headers to organize sections
- End with **Sources** citing specific emails: "Subject" from Sender (Date)
- After the data, add any relevant context or timeline

EXTRACTION RULES:
- Scan EVERY email body character by character for: dollar amounts ($XX,XXX), percentages, account numbers, dates, reference numbers, phone numbers, email addresses
- These are often buried in email signatures, footers, reference lines, or forwarded content — don't skip anything
- Cross-reference with portfolio data to fill gaps (e.g. if portfolio says purchase price is $248K but emails only mention "land contract", connect them)
- If a data point is NOT found in any email, explicitly say "**Not found in emails**" — don't skip it silently
- If you can calculate something (e.g. LVR from loan amount and purchase price), do the calculation`,
        });
        const answerText = answerResponse.content[0].type === 'text' ? answerResponse.content[0].text : null;
        if (answerText) answer = answerText;
      } catch {
        // Non-critical — we still have results even if analysis fails
      }
    }

    res.json({
      results: ranked,
      driveResults: [...driveFiles.values()],
      searchQueries,
      reasoning: ranking.reasoning,
      answer,
      totalFetched: results.length,
      totalRelevant: ranked.length,
    });
  } catch (err: any) {
    if (err.code === 401) {
      db.prepare('DELETE FROM google_tokens WHERE id = 1').run();
      res.status(401).json({ error: 'Google session expired. Please reconnect.' });
    } else {
      res.status(500).json({ error: err.message || 'Smart search failed' });
    }
  }
});

// ── Saved Findings ──
router.get('/findings', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM saved_findings ORDER BY saved_at DESC').all();
  res.json({ findings: rows });
});

router.post('/findings', (req: Request, res: Response) => {
  const { id, source, sourceId, title, snippet, content, date, from, propertyId, entityId, loanId, tags } = req.body;
  if (!id || !title) { res.status(400).json({ error: 'id and title required' }); return; }

  db.prepare(`INSERT OR REPLACE INTO saved_findings (id, source, source_id, title, snippet, content, date, from_address, property_id, entity_id, loan_id, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, source || 'manual', sourceId || null, title, snippet || null, content || null, date || null, from || null, propertyId || null, entityId || null, loanId || null, JSON.stringify(tags || []));

  res.json({ success: true });
});

router.patch('/findings/:id', (req: Request, res: Response) => {
  const { propertyId, entityId, loanId, tags } = req.body;
  const existing = db.prepare('SELECT * FROM saved_findings WHERE id = ?').get(req.params.id) as any;
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }

  db.prepare('UPDATE saved_findings SET property_id = ?, entity_id = ?, loan_id = ?, tags = ? WHERE id = ?')
    .run(
      propertyId !== undefined ? propertyId : existing.property_id,
      entityId !== undefined ? entityId : existing.entity_id,
      loanId !== undefined ? loanId : existing.loan_id,
      tags !== undefined ? JSON.stringify(tags) : existing.tags,
      req.params.id,
    );

  res.json({ success: true });
});

router.delete('/findings/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM saved_findings WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Research Sessions ──
router.get('/research/sessions', (_req: Request, res: Response) => {
  const sessions = db.prepare('SELECT * FROM research_sessions ORDER BY updated_at DESC').all();
  res.json({ sessions });
});

router.post('/research/sessions', (req: Request, res: Response) => {
  const { id, title } = req.body;
  if (!id) { res.status(400).json({ error: 'id required' }); return; }
  db.prepare('INSERT OR REPLACE INTO research_sessions (id, title) VALUES (?, ?)')
    .run(id, title || 'New Research');
  res.json({ success: true });
});

router.delete('/research/sessions/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM research_turns WHERE session_id = ?').run(req.params.id);
  db.prepare('DELETE FROM research_sessions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.get('/research/sessions/:id/turns', (req: Request, res: Response) => {
  const turns = db.prepare('SELECT * FROM research_turns WHERE session_id = ? ORDER BY created_at ASC').all(req.params.id);
  res.json({
    turns: turns.map((t: any) => ({
      id: t.id,
      sessionId: t.session_id,
      query: t.query,
      answer: t.answer,
      searchQueries: JSON.parse(t.search_queries || '[]'),
      gmailResults: JSON.parse(t.gmail_results || '[]'),
      driveResults: JSON.parse(t.drive_results || '[]'),
      totalFetched: t.total_fetched,
      createdAt: t.created_at,
    })),
  });
});

router.post('/research/sessions/:id/turns', (req: Request, res: Response) => {
  const { id: turnId, query, answer, searchQueries, gmailResults, driveResults, totalFetched } = req.body;
  const sessionId = req.params.id;
  db.prepare(
    'INSERT INTO research_turns (id, session_id, query, answer, search_queries, gmail_results, drive_results, total_fetched) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    turnId, sessionId, query, answer || null,
    JSON.stringify(searchQueries || []),
    JSON.stringify(gmailResults || []),
    JSON.stringify(driveResults || []),
    totalFetched || 0,
  );
  // Update session title (from first query) and timestamp
  const turnCount = (db.prepare('SELECT COUNT(*) as cnt FROM research_turns WHERE session_id = ?').get(sessionId) as any).cnt;
  if (turnCount === 1) {
    db.prepare('UPDATE research_sessions SET title = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(query.substring(0, 100), sessionId);
  } else {
    db.prepare('UPDATE research_sessions SET updated_at = datetime(\'now\') WHERE id = ?').run(sessionId);
  }
  res.json({ success: true });
});

export { router as googleRouter };
