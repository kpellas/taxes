import fs from 'fs';
import path from 'path';

export interface IndexedDocument {
  id: string;
  relativePath: string;
  absolutePath: string;
  filename: string;
  extension: string;
  propertyId: string | null;
  category: string;
  subcategory: string | null;
  dateFromFilename: string | null;
  sizeBytes: number;
  lastModified: string;
  accountNumbers: string[];
}

const PROPERTY_FOLDER_MAP: Record<string, string> = {
  '1 - chisholm': 'chisholm',
  '1 - purchase': 'chisholm',  // will be overridden by parent
  'chisholm': 'chisholm',
  'waterford': 'chisholm',
  '2 - heddon greta': 'heddon-greta',
  'heddon greta': 'heddon-greta',
  'avery': 'heddon-greta',
  '3 - southwest rocks': 'bannerman',
  'southwest rocks': 'bannerman',
  'bannerman': 'bannerman',
  '4 - old bar': 'old-bar',
  'old bar': 'old-bar',
  'emerald fields': 'old-bar',
  'driftwood': 'old-bar',
  '5 - lennox': 'lennox',
  'lennox': 'lennox',
  'lennox heads': 'lennox',
};

const CATEGORY_MAP: Record<string, string> = {
  '1 - purchase': 'purchase',
  '1 - caifu_ncl': 'contracts',
  '1 - contracts': 'contracts',
  '2 - finance': 'finance',
  '2 - correspondance': 'correspondence',
  '3 - solicitor': 'solicitor',
  '3 - settlement': 'settlement',
  '4 - insurance': 'insurance',
  '4 - loan docs': 'loan_docs',
  '5 - handover': 'handover',
  '6 - depreciation': 'depreciation',
  '2 - leasing': 'leasing',
  '2 - ongoing': 'leasing',
  '1 - agreements': 'agreements',
  '2 - income statements': 'income_statements',
  '3 - maintenance': 'maintenance',
  '4 - expenses': 'expenses',
  '5 - reports': 'reports',
  '3 - refinance': 'refinance',
  '4 - valuations': 'valuations',
  '1 - beyond': 'finance_beyond',
  '1 - macquarie': 'finance_macquarie',
  '1 - bankwest': 'finance_bankwest',
  '2024 refinance': 'refinance',
  'loan docs': 'loan_docs',
  'loan prep': 'loan_prep',
  'old loans': 'old_loans',
  'data': 'data',
  'statements': 'statements',
};

// Known account numbers to search for in filenames
const KNOWN_ACCOUNTS = [
  '5599', '5604', '5612', '5573', '5581', '5620', '5638', '5911', '5929', '6189',
  '13605113', '13605125', '13634421',
  '120068179', '718701068', '007913338',
];

let cachedIndex: IndexedDocument[] | null = null;

function hashPath(p: string): string {
  let hash = 0;
  for (let i = 0; i < p.length; i++) {
    const char = p.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function extractDateFromFilename(filename: string): string | null {
  // Match YYYY.MM.DD or YYYY.M.DD patterns
  const match = filename.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})\s*-/);
  if (match) {
    const [, y, m, d] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function extractAccountNumbers(filepath: string): string[] {
  const found: string[] = [];
  const lower = filepath.toLowerCase();
  for (const acct of KNOWN_ACCOUNTS) {
    if (lower.includes(acct)) {
      found.push(acct);
    }
  }
  return found;
}

function identifyProperty(relativePath: string): string | null {
  const parts = relativePath.split(path.sep);
  const topFolder = parts[0]?.toLowerCase() || '';

  // Check top-level folder first
  for (const [key, propId] of Object.entries(PROPERTY_FOLDER_MAP)) {
    if (topFolder.includes(key)) {
      return propId;
    }
  }

  // Check deeper path segments
  const fullLower = relativePath.toLowerCase();
  if (fullLower.includes('chisholm') || fullLower.includes('waterford') || fullLower.includes('goldring')) return 'chisholm';
  if (fullLower.includes('heddon') || fullLower.includes('avery') || fullLower.includes('quintero')) return 'heddon-greta';
  if (fullLower.includes('bannerman') || fullLower.includes('southwest') || fullLower.includes('south west')) return 'bannerman';
  if (fullLower.includes('old bar') || fullLower.includes('driftwood') || fullLower.includes('emerald')) return 'old-bar';
  if (fullLower.includes('lennox')) return 'lennox';

  return null;
}

function identifyCategory(relativePath: string): { category: string; subcategory: string | null } {
  const parts = relativePath.split(path.sep).map(p => p.toLowerCase());
  let category = 'general';
  let subcategory: string | null = null;

  for (const part of parts) {
    for (const [key, cat] of Object.entries(CATEGORY_MAP)) {
      if (part.includes(key) || part === key) {
        if (category === 'general') {
          category = cat;
        } else {
          subcategory = cat;
        }
      }
    }
  }

  return { category, subcategory };
}

function walkDir(dir: string, basePath: string): IndexedDocument[] {
  const docs: IndexedDocument[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return docs;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.name.startsWith('.') || entry.name.startsWith('~$')) continue;

    if (entry.isDirectory()) {
      docs.push(...walkDir(fullPath, basePath));
    } else if (entry.isFile()) {
      const relativePath = path.relative(basePath, fullPath);
      const ext = path.extname(entry.name).toLowerCase().slice(1);

      // Skip non-document files
      if (['ds_store', 'thumbs', 'db'].includes(ext)) continue;

      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      const propertyId = identifyProperty(relativePath);
      const { category, subcategory } = identifyCategory(relativePath);

      docs.push({
        id: hashPath(relativePath),
        relativePath,
        absolutePath: fullPath,
        filename: entry.name,
        extension: ext,
        propertyId,
        category,
        subcategory,
        dateFromFilename: extractDateFromFilename(entry.name),
        sizeBytes: stat.size,
        lastModified: stat.mtime.toISOString(),
        accountNumbers: extractAccountNumbers(relativePath),
      });
    }
  }

  return docs;
}

export function buildDocumentIndex(propertiesPath: string): IndexedDocument[] {
  if (cachedIndex) return cachedIndex;

  console.log(`Scanning documents in: ${propertiesPath}`);
  const startTime = Date.now();

  cachedIndex = walkDir(propertiesPath, propertiesPath);

  console.log(`Indexed ${cachedIndex.length} documents in ${Date.now() - startTime}ms`);
  return cachedIndex;
}

export function refreshIndex(propertiesPath: string): IndexedDocument[] {
  cachedIndex = null;
  return buildDocumentIndex(propertiesPath);
}

export function searchDocuments(propertiesPath: string, query: string): IndexedDocument[] {
  const index = buildDocumentIndex(propertiesPath);
  const lower = query.toLowerCase();
  return index.filter(doc =>
    doc.filename.toLowerCase().includes(lower) ||
    doc.relativePath.toLowerCase().includes(lower) ||
    doc.accountNumbers.some(a => a.includes(lower))
  );
}

export function getDocumentsForProperty(propertiesPath: string, propertyId: string): IndexedDocument[] {
  const index = buildDocumentIndex(propertiesPath);
  return index.filter(doc => doc.propertyId === propertyId);
}

export function getDocumentsForAccount(propertiesPath: string, accountNumber: string): IndexedDocument[] {
  const index = buildDocumentIndex(propertiesPath);
  return index.filter(doc => doc.accountNumbers.includes(accountNumber));
}
