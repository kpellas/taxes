import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, extractPdfText } from '../services/claudeContext.js';
import { buildDocumentIndex } from '../services/documentIndex.js';
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

    if (documentPaths && documentPaths.length > 0) {
      const propertiesPath = process.env.PROPERTIES_PATH || '';
      for (const docPath of documentPaths.slice(0, 3)) { // Max 3 docs
        const fullPath = path.resolve(propertiesPath, docPath);
        if (fullPath.startsWith(propertiesPath)) {
          const ext = path.extname(docPath).toLowerCase();
          if (ext === '.pdf') {
            const text = await extractPdfText(fullPath);
            extraContext += `\n\n--- Document: ${path.basename(docPath)} ---\n${text}`;
          }
        }
      }
    }

    if (propertyId) {
      const propertiesPath = process.env.PROPERTIES_PATH || '';
      const docs = buildDocumentIndex(propertiesPath)
        .filter(d => d.propertyId === propertyId)
        .slice(0, 20);
      extraContext += `\n\nAvailable documents for ${propertyId}:\n${docs.map(d => `- ${d.filename} (${d.category})`).join('\n')}`;
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
