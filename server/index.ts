import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { documentsRouter } from './routes/documents.js';
import { uploadRouter } from './routes/upload.js';
import { chatRouter } from './routes/chat.js';
import { emailRouter } from './routes/email.js';
import { startEmailPoller } from './services/emailIngestion.js';

dotenv.config({ path: path.resolve(import.meta.dirname, '../.env') });

const app = express();
const PORT = process.env.API_PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Routes
app.use('/api/documents', documentsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/chat', chatRouter);
app.use('/api/email', emailRouter);

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

  // Start email poller (5 min interval) — gracefully skips if IMAP not configured
  startEmailPoller(5 * 60 * 1000);
});
