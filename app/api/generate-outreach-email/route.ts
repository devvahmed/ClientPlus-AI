import { NextRequest, NextResponse } from 'next/server';

interface FirecrawlResponse {
  data?: {
    markdown?: string;
  };
}

interface DraftResponse {
  subject: string;
  body: string;
  problemInsight: string;
  confidence: 'high' | 'medium' | 'low';
}

// Dynamic Config Defaults
const OUR_COMPANY_NAME = process.env.OUR_COMPANY_NAME || "WTechX";
const OUR_PRODUCT_NAME = process.env.OUR_PRODUCT_NAME || "ClientPlus AI";
const OUR_SERVICES = process.env.OUR_SERVICES || "AI, Robotics, and Computer Vision solutions provider";

function normalizeUrl(website: string): string {
  return website.startsWith('http') ? website : `https://${website}`;
}

function cleanMarkdown(markdown: string): string {
  return markdown.replace(/\s+/g, ' ').trim().slice(0, 12000);
}

async function scrapeWebsiteContext(website: string): Promise<string> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) return '';

  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${firecrawlKey}`,
    },
    body: JSON.stringify({
      url: normalizeUrl(website),
      formats: ['markdown'],
      onlyMainContent: true,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    return '';
  }

  const data = (await res.json()) as FirecrawlResponse;
  return cleanMarkdown(data.data?.markdown ?? '');
}

async function generateWithOllama(
  input: {
    companyName: string;
    website: string;
    industry?: string;
    contactName?: string;
    contextText: string;
  },
  ourCompanyName: string,
  ourProductName: string,
  ourServices: string
): Promise<DraftResponse> {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

  const prompt = `You are an elite B2B SDR writing personalized outbound emails for ${ourProductName} (offered by ${ourCompanyName}, a leading provider of ${ourServices}).
${ourProductName} offers B2B sales intelligence, lead scoring, workflow automation, and CRM unification.

Target company:
- Name: ${input.companyName}
- Website: ${input.website}
- Industry: ${input.industry || 'Unknown'}
- Contact name: ${input.contactName || 'there'}

Website context extracted via crawl:
"""
${input.contextText || 'No reliable crawl context available.'}
"""

Rules:
1) Draft one professional cold email with strong personalization.
2) If clear inefficiencies exist in the context, mention them clearly and explain how ${ourProductName} can fix them.
3) If no obvious issue is visible, write a value-led email without forcing fake problems.
4) Keep the tone human, concise, and executive-friendly.
5) Avoid generic fluff and avoid fake claims.

You MUST respond in this exact JSON schema (do NOT include markdown fences, return pure JSON):
{
  "subject": "...",
  "body": "...",
  "problemInsight": "...",
  "confidence": "high" | "medium" | "low"
}`;

  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        prompt,
        format: 'json',
        stream: false,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      throw new Error(`Ollama returned status ${res.status}`);
    }

    const data = await res.json();
    const text = data.response;
    if (!text) throw new Error("Empty response from Ollama");

    const parsed = JSON.parse(text.trim()) as DraftResponse;
    return {
      subject: parsed.subject,
      body: parsed.body,
      problemInsight: parsed.problemInsight || 'No critical issue detected from available context.',
      confidence: parsed.confidence || 'medium',
    };
  } catch (err) {
    console.error('Ollama draft email generation failed, using default fallback:', err);
    const hasContext = input.contextText.length > 120;
    return {
      subject: `A quick idea for ${input.companyName}`,
      body:
        `Hi ${input.contactName || 'there'},\n\n` +
        (hasContext
          ? `I reviewed ${input.companyName}'s website and noticed strong growth signals. A lot of teams at this stage juggle lead discovery, qualification, and follow-up across multiple tools. `
          : `I wanted to share a quick idea for improving pipeline quality and outreach efficiency at ${input.companyName}. `) +
        `${ourProductName} helps centralize prospect discovery, lead scoring, and sales workflow automation in one place so your team can focus on high-intent opportunities.\n\n` +
        `Would you be open to a short 15-minute intro next week?\n\nBest,\n${ourProductName} Team`,
      problemInsight: 'Local AI service unavailable. Dynamic value-led fallback draft was generated.',
      confidence: 'low',
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const companyName = String(body.companyName ?? '').trim();
    const website = String(body.website ?? '').trim();
    const industry = String(body.industry ?? '').trim();
    const contactName = String(body.contactName ?? '').trim();

    if (!companyName || !website) {
      return NextResponse.json(
        { error: 'companyName and website are required' },
        { status: 400 }
      );
    }

    const contextText = await scrapeWebsiteContext(website);
    const draft = await generateWithOllama({
      companyName,
      website,
      industry,
      contactName,
      contextText,
    }, OUR_COMPANY_NAME, OUR_PRODUCT_NAME, OUR_SERVICES);

    return NextResponse.json({
      ...draft,
      websiteContextChars: contextText.length,
      usedFirecrawl: contextText.length > 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate outreach email' },
      { status: 500 }
    );
  }
}
