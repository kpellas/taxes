import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { documentsRouter } from './routes/documents.js';
import { uploadRouter } from './routes/upload.js';
import { chatRouter } from './routes/chat.js';
import { emailRouter } from './routes/email.js';
import { authRouter, ensureAdminExists } from './routes/auth.js';
import { portfolioRouter } from './routes/portfolio.js';
import { googleRouter } from './routes/google.js';
import { bankwestRouter } from './routes/bankwest.js';
import { scrapersRouter } from './routes/scrapers.js';
import { startEmailPoller } from './services/emailIngestion.js';
import { seedDocumentTemplates } from './services/documentTemplates.js';
import { syncFileIndex } from './services/documentIndexSync.js';
dotenv.config({ path: path.resolve(import.meta.dirname, '../.env') });
ensureAdminExists();

const app = express();
const PORT = process.env.API_PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/chat', chatRouter);
app.use('/api/email', emailRouter);
app.use('/api/google', googleRouter);
app.use('/api/bankwest', bankwestRouter);
app.use('/api/scrapers', scrapersRouter);

// Serve static frontend build in production
const distPath = path.resolve(import.meta.dirname, '../dist');
import fs from 'fs';
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback — serve index.html for non-API routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    propertiesPath: process.env.PROPERTIES_PATH || 'not set',
    apiKeyConfigured: !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your-api-key-here'),
  });
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log(`Properties path: ${process.env.PROPERTIES_PATH || 'not set'}`);
  console.log(`API key configured: ${!!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your-api-key-here')}`);

  // Seed document templates and sync file index on startup
  seedDocumentTemplates();
  const propertiesPath = process.env.PROPERTIES_PATH;
  if (propertiesPath) {
    const result = syncFileIndex(propertiesPath);
    console.log(`Document index: ${result.added} added, ${result.updated} updated, ${result.total} total`);
  }

  // Start email poller (5 min interval) — gracefully skips if IMAP not configured
  startEmailPoller(5 * 60 * 1000);
});
