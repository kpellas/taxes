import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ── Types ──────────────────────────────────────────────────────

export interface EmailAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  savedPath: string;
}

export interface IngestedEmail {
  id: string;
  messageId: string;
  from: string;
  fromName: string;
  to: string[];
  subject: string;
  date: string;
  bodyText: string;
  bodyPreview: string;
  attachments: EmailAttachment[];
  propertyId: string | null;
  matchConfidence: 'high' | 'medium' | 'low' | 'none';
  matchReason: string;
  processedAt: string;
  isForwarded: boolean;
  originalSender?: string;
}

export interface CheckResult {
  processed: number;
  skipped: number;
  errors: number;
  lastChecked: string;
}

// ── Property matching ──────────────────────────────────────────

interface PropertyPattern {
  propertyId: string;
  names: string[];
  aliases: string[];
  addresses: string[];
  pmCompanies: string[];
  accountNumbers: string[];
}

const PROPERTY_PATTERNS: PropertyPattern[] = [
  {
    propertyId: 'chisholm',
    names: ['chisholm'],
    aliases: ['waterford', 'goldring'],
    addresses: ['19 goldring'],
    pmCompanies: ['spg asset management', 'spg asset'],
    accountNumbers: ['5599', '5604', '5612', '13605113'],
  },
  {
    propertyId: 'heddon-greta',
    names: ['heddon greta', 'heddon-greta'],
    aliases: ['avery', 'quintero'],
    addresses: ['13 quintero'],
    pmCompanies: ['spg asset management', 'spg asset'],
    accountNumbers: ['5573', '5581'],
  },
  {
    propertyId: 'bannerman',
    names: ['bannerman'],
    aliases: ['southwest rocks', 'south west rocks', 'sw rocks'],
    addresses: ['2 bannerman'],
    pmCompanies: ['harcourts'],
    accountNumbers: ['5620', '5638', '13605125', '13634421'],
  },
  {
    propertyId: 'old-bar',
    names: ['old bar', 'old-bar'],
    aliases: ['emerald fields', 'driftwood'],
    addresses: ['25 driftwood'],
    pmCompanies: [],
    accountNumbers: ['5911'],
  },
  {
    propertyId: 'lennox',
    names: ['lennox'],
    aliases: ['lennox heads', 'lennox rise'],
    addresses: ['lot 203'],
    pmCompanies: [],
    accountNumbers: ['5929'],
  },
];

function matchToProperty(subject: string, body: string, from: string): {
  propertyId: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reason: string;
} {
  const text = `${subject} ${body} ${from}`.toLowerCase();

  for (const p of PROPERTY_PATTERNS) {
    // High confidence: property name or address in subject
    const subjectLower = subject.toLowerCase();
    for (const name of p.names) {
      if (subjectLower.includes(name)) {
        return { propertyId: p.propertyId, confidence: 'high', reason: `Subject contains "${name}"` };
      }
    }
    for (const addr of p.addresses) {
      if (subjectLower.includes(addr)) {
        return { propertyId: p.propertyId, confidence: 'high', reason: `Subject contains address "${addr}"` };
      }
    }
  }

  for (const p of PROPERTY_PATTERNS) {
    const textLower = text;
    // Medium confidence: name in body or alias match
    for (const name of p.names) {
      if (textLower.includes(name)) {
        return { propertyId: p.propertyId, confidence: 'medium', reason: `Body contains "${name}"` };
      }
    }
    for (const alias of p.aliases) {
      if (textLower.includes(alias)) {
        return { propertyId: p.propertyId, confidence: 'medium', reason: `Content mentions alias "${alias}"` };
      }
    }
    for (const addr of p.addresses) {
      if (textLower.includes(addr)) {
        return { propertyId: p.propertyId, confidence: 'medium', reason: `Content contains address "${addr}"` };
      }
    }
    // PM company match (medium — SPG manages two properties, so not definitive)
    for (const pm of p.pmCompanies) {
      if (textLower.includes(pm)) {
        return { propertyId: p.propertyId, confidence: 'medium', reason: `From/content matches PM "${pm}"` };
      }
    }
  }

  for (const p of PROPERTY_PATTERNS) {
    // Low confidence: account number
    for (const acct of p.accountNumbers) {
      if (text.includes(acct)) {
        return { propertyId: p.propertyId, confidence: 'low', reason: `Content contains account number ${acct}` };
      }
    }
  }

  return { propertyId: null, confidence: 'none', reason: 'No property match found' };
}

// ── Forwarded email detection ──────────────────────────────────

function parseForwardedEmail(body: string): { isForwarded: boolean; originalSender?: string } {
  const patterns = [
    /---------- Forwarded message ---------\s*\n.*?From:\s*(.+)/i,     // Gmail
    /-----Original Message-----\s*\n.*?From:\s*(.+)/i,                  // Outlook
    /Begin forwarded message:\s*\n.*?From:\s*(.+)/i,                     // Apple Mail
  ];

  for (const pat of patterns) {
    const match = body.match(pat);
    if (match) {
      return { isForwarded: true, originalSender: match[1].trim() };
    }
  }
  return { isForwarded: false };
}

// ── Email log persistence ──────────────────────────────────────

function getDataPath(): string {
  return process.env.EMAIL_DATA_PATH || path.resolve(import.meta.dirname, '../../data/emails.json');
}

export function loadEmailLog(): IngestedEmail[] {
  const p = getDataPath();
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return [];
  }
}

function saveEmailLog(emails: IngestedEmail[]): void {
  const p = getDataPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(emails, null, 2));
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Attachment saving ──────────────────────────────────────────

function getUploadsBase(): string {
  return process.env.UPLOADS_PATH || path.resolve(import.meta.dirname, '../../uploads');
}

function saveAttachments(
  emailId: string,
  attachments: ParsedMail['attachments'],
  propertyId: string | null
): EmailAttachment[] {
  if (!attachments || attachments.length === 0) return [];

  const folder = propertyId || 'unmatched';
  const dir = path.join(getUploadsBase(), 'email', folder);
  fs.mkdirSync(dir, { recursive: true });

  const saved: EmailAttachment[] = [];
  const timestamp = new Date().toISOString().slice(0, 10);

  for (const att of attachments) {
    const safeName = (att.filename || `attachment_${genId()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${timestamp}_${safeName}`;
    const filePath = path.join(dir, filename);

    fs.writeFileSync(filePath, att.content);

    saved.push({
      id: genId(),
      filename: att.filename || safeName,
      contentType: att.contentType || 'application/octet-stream',
      size: att.size || att.content.length,
      savedPath: path.join('email', folder, filename),
    });
  }

  return saved;
}

// ── Core IMAP check ────────────────────────────────────────────

function getImapConfig(): { host: string; port: number; auth: { user: string; pass: string } } | null {
  const host = process.env.IMAP_SERVER;
  const port = parseInt(process.env.IMAP_PORT || '993', 10);
  const user = process.env.IMAP_USERNAME;
  const pass = process.env.IMAP_PASSWORD;

  if (!host || !user || !pass) return null;
  return { host, port, auth: { user, pass } };
}

export function isImapConfigured(): boolean {
  return getImapConfig() !== null;
}

export async function checkForNewEmails(): Promise<CheckResult> {
  const config = getImapConfig();
  if (!config) {
    return { processed: 0, skipped: 0, errors: 0, lastChecked: new Date().toISOString() };
  }

  const existing = loadEmailLog();
  const existingIds = new Set(existing.map((e) => e.messageId));

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: config.auth,
    logger: false,
    socketTimeout: 30_000,
  });

  // Prevent unhandled error events from crashing the process
  client.on('error', (err: Error) => {
    console.error('IMAP connection error (non-fatal):', err.message);
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Search for unseen messages
      const uids = await client.search({ seen: false });

      for (const uid of uids) {
        try {
          const msg = await client.fetchOne(uid, { source: true });
          if (!msg?.source) {
            skipped++;
            continue;
          }

          const parsed = await simpleParser(msg.source);
          const msgId = parsed.messageId || crypto.createHash('sha256').update(msg.source).digest('hex');

          // Dedup check
          if (existingIds.has(msgId)) {
            await client.messageFlagsAdd(uid, ['\\Seen']);
            skipped++;
            continue;
          }

          // Extract fields
          const from = parsed.from?.value?.[0]?.address || 'unknown';
          const fromName = parsed.from?.value?.[0]?.name || from;
          const to = parsed.to
            ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to])
                .flatMap((t) => t.value.map((v) => v.address || ''))
            : [];
          const subject = parsed.subject || '(no subject)';
          const date = parsed.date?.toISOString() || new Date().toISOString();
          const bodyText = parsed.text || '';

          // Forwarded email detection
          const forwarded = parseForwardedEmail(bodyText);

          // Property matching
          const match = matchToProperty(subject, bodyText, from);

          // Save attachments
          const savedAttachments = saveAttachments(genId(), parsed.attachments || [], match.propertyId);

          const email: IngestedEmail = {
            id: genId(),
            messageId: msgId,
            from,
            fromName,
            to,
            subject,
            date,
            bodyText,
            bodyPreview: bodyText.slice(0, 500),
            attachments: savedAttachments,
            propertyId: match.propertyId,
            matchConfidence: match.confidence,
            matchReason: match.reason,
            processedAt: new Date().toISOString(),
            isForwarded: forwarded.isForwarded,
            originalSender: forwarded.originalSender,
          };

          existing.push(email);
          existingIds.add(msgId);
          processed++;

          // Mark as seen
          await client.messageFlagsAdd(uid, ['\\Seen']);
        } catch (err) {
          console.error('Error processing email UID', uid, err);
          errors++;
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error('IMAP connection error:', err);
    errors++;
  }

  // Save updated log
  saveEmailLog(existing);

  const result: CheckResult = {
    processed,
    skipped,
    errors,
    lastChecked: new Date().toISOString(),
  };

  console.log(`Email check: ${processed} processed, ${skipped} skipped, ${errors} errors`);
  return result;
}

// ── Update property assignment ─────────────────────────────────

export function updateEmailProperty(emailId: string, propertyId: string | null): IngestedEmail | null {
  const emails = loadEmailLog();
  const email = emails.find((e) => e.id === emailId);
  if (!email) return null;

  email.propertyId = propertyId;
  email.matchConfidence = propertyId ? 'high' : 'none';
  email.matchReason = propertyId ? 'Manually assigned' : 'Unassigned';
  saveEmailLog(emails);
  return email;
}

// ── Poller ─────────────────────────────────────────────────────

let pollInterval: ReturnType<typeof setInterval> | null = null;

export function startEmailPoller(intervalMs: number = 5 * 60 * 1000): void {
  if (!isImapConfigured()) {
    console.log('IMAP not configured — email polling disabled. Set IMAP_SERVER, IMAP_USERNAME, IMAP_PASSWORD in .env');
    return;
  }

  console.log(`Email poller started (interval: ${Math.round(intervalMs / 1000)}s)`);

  // Initial check after 10 seconds (let server finish starting)
  setTimeout(() => {
    checkForNewEmails().catch((err) => console.error('Email check failed:', err));
  }, 10_000);

  pollInterval = setInterval(() => {
    checkForNewEmails().catch((err) => console.error('Email check failed:', err));
  }, intervalMs);
}

export function stopEmailPoller(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('Email poller stopped');
  }
}
