import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import { buildSystemPrompt, extractFileText } from '../services/claudeContext.js';
import { buildDocumentIndex } from '../services/documentIndex.js';
import { loadEmailLog } from '../services/emailIngestion.js';
import path from 'path';

const router = Router();

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your-api-key-here') {
    return null;
  }
  return new Anthropic({ apiKey });
}

interface ChatRequest {
  message: string;
  propertyId?: string;
  evidenceItemIds?: string[];
  history?: { role: 'user' | 'assistant'; content: string }[];
  documentPaths?: string[];
  storeSnapshot?: Record<string, unknown>;
}

// POST /api/chat — send message to Claude with portfolio context
router.post('/', async (req: Request, res: Response) => {
  const client = getClient();
  if (!client) {
    res.status(503).json({
      error: 'Claude API not configured. Add your ANTHROPIC_API_KEY to .env file.',
    });
    return;
  }

  const { message, propertyId, history, documentPaths, storeSnapshot } = req.body as ChatRequest;

  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    // Build context with optional document text
    let extraContext = '';
    const propertiesPath = process.env.PROPERTIES_PATH || '';
    const uploadsPath = process.env.UPLOADS_PATH || path.resolve(import.meta.dirname, '../../uploads');

    // Resolve document paths from PROPERTIES or uploads folders
    if (documentPaths && documentPaths.length > 0) {
      for (const docPath of documentPaths.slice(0, 5)) { // Max 5 docs
        // Try PROPERTIES folder first, then uploads
        let fullPath = path.resolve(propertiesPath, docPath);
        if (!fullPath.startsWith(propertiesPath) || !fs.existsSync(fullPath)) {
          fullPath = path.resolve(uploadsPath, docPath);
          if (!fullPath.startsWith(uploadsPath) || !fs.existsSync(fullPath)) continue;
        }
        const text = await extractFileText(fullPath);
        extraContext += `\n\n--- Document: ${path.basename(docPath)} ---\n${text}`;
      }
    }

    if (propertyId) {
      const docs = buildDocumentIndex(propertiesPath)
        .filter(d => d.propertyId === propertyId)
        .slice(0, 20);
      extraContext += `\n\nAvailable documents for ${propertyId}:\n${docs.map(d => `- ${d.filename} (${d.category})`).join('\n')}`;
    }

    // Search email log for relevant emails when the message mentions emails/attachments
    const msgLower = message.toLowerCase();
    if (msgLower.includes('email') || msgLower.includes('attachment') || msgLower.includes('inbox')) {
      const emails = loadEmailLog();
      const relevant = emails.filter(e => {
        // Match by property if scoped
        if (propertyId && e.propertyId !== propertyId) return false;
        // Search subject + body for keywords from the user's message
        const words = message.split(/\s+/).filter(w => w.length > 3).map(w => w.toLowerCase());
        const emailText = `${e.subject} ${e.bodyPreview} ${e.from}`.toLowerCase();
        return words.some(w => emailText.includes(w));
      }).slice(0, 10);

      if (relevant.length > 0) {
        extraContext += '\n\n--- RELEVANT EMAILS ---\n';
        for (const e of relevant) {
          extraContext += `\nFrom: ${e.fromName} <${e.from}>\nDate: ${e.date}\nSubject: ${e.subject}\nProperty: ${e.propertyId || 'unmatched'}\n`;
          if (e.bodyText) extraContext += `Body:\n${e.bodyText.slice(0, 2000)}\n`;
          if (e.attachments.length > 0) {
            extraContext += `Attachments: ${e.attachments.map(a => `${a.filename} (${a.savedPath})`).join(', ')}\n`;
            // Auto-read PDF/text attachments
            for (const att of e.attachments.slice(0, 3)) {
              const attPath = path.resolve(uploadsPath, att.savedPath);
              if (fs.existsSync(attPath)) {
                const text = await extractFileText(attPath);
                if (!text.startsWith('[Unsupported')) {
                  extraContext += `\n--- Attachment: ${att.filename} ---\n${text}\n`;
                }
              }
            }
          }
          extraContext += '---\n';
        }
      }
    }

    // Include store snapshot as structured data
    if (storeSnapshot) {
      extraContext += '\n\n--- CURRENT APP DATA (live from user\'s dashboard) ---\n';
      extraContext += JSON.stringify(storeSnapshot, null, 1);
    }

    const systemPrompt = buildSystemPrompt(extraContext || undefined);

    const messages: Anthropic.MessageParam[] = [
      ...(history || []).map(h => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user', content: message },
    ];

    // Stream response via SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
    });

    stream.on('end', () => {
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    });

    stream.on('error', (error) => {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Chat request failed' });
  }
});

export { router as chatRouter };
