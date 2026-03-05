import fs from 'fs';
import path from 'path';

// Dynamically import pdf-parse (it's CommonJS)
let pdfParse: any = null;
async function getPdfParse() {
  if (!pdfParse) {
    pdfParse = (await import('pdf-parse')).default;
  }
  return pdfParse;
}

export async function extractPdfText(filePath: string): Promise<string> {
  try {
    const parse = await getPdfParse();
    const buffer = fs.readFileSync(filePath);
    const data = await parse(buffer);
    return data.text.slice(0, 10000); // Limit to 10K chars per PDF
  } catch (err) {
    return `[Could not extract text from ${path.basename(filePath)}]`;
  }
}

export function buildSystemPrompt(portfolioContext?: string): string {
  return `You are a property portfolio assistant embedded in Kelly and Mark Pellas's financial dashboard. You have access to ALL the data the user sees in the app — properties, loans, entities, tax returns (FY2019-20 through FY2023-24), line items, and more. This data is provided below.

Use the data to answer questions with specific numbers. Don't say "I don't have access" — if the data is in the snapshot below, use it. Be concise and direct.

Key context:
- Heddon Greta was filed as 50/50 Kelly & Mark but should be 100% Mark (verified from Bankwest mortgage)
- Interest deductibility follows PURPOSE not security
- Tax returns due 31 March 2026. Accountant: Elizabeth
- Known issue: FY2021-22 Heddon Greta holding costs may not have been claimed

${portfolioContext ? `\n${portfolioContext}` : ''}

Answer with specific dollar amounts and figures from the data. Be concise.`;
}
