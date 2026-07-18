import { NextRequest, NextResponse } from 'next/server';

// Dynamic Config Defaults
const OUR_COMPANY_NAME = process.env.OUR_COMPANY_NAME || "WTechX";
const OUR_SERVICES = process.env.OUR_SERVICES || "AI, Robotics, and Computer Vision solutions provider";

// ─── Fetch & extract text from a URL ─────────────────────────────────────────
async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    // Strip HTML tags and collapse whitespace
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 6000); // keep first 6000 chars for Ollama
  } catch {
    return '';
  }
}

// ─── Try fetching /about page as well ────────────────────────────────────────
async function scrapeCompany(websiteUrl: string): Promise<string> {
  const base = websiteUrl.replace(/\/$/, '');
  const [homeText, aboutText] = await Promise.all([
    fetchPageText(base),
    fetchPageText(`${base}/about`),
  ]);
  return `${homeText}\n\n${aboutText}`.trim().slice(0, 8000);
}

// ─── Ollama API call (llama3.2) ──────────────────────────────────────────────
async function analyzeWithOllama(
  companyName: string,
  content: string,
  ourCompanyName: string,
  ourServices: string
): Promise<{ relevant: boolean; reason: string }> {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

  const prompt = `Our company, ${ourCompanyName}, offers: ${ourServices}.

Target Company Name: ${companyName}
Target Company Website Content (extracted):
"""
${content || 'No content available'}
"""

Based on this company's website content, determine:
1) Is this company a good fit for our ${ourServices}? (relevant: true or false)
2) Give exactly ONE short sentence (max 20 words) explaining why they are or aren't relevant to us.

You MUST respond in this exact JSON format only (do NOT include markdown fences, return pure JSON):
{"relevant": boolean, "reason": "One short sentence explaining fit."}`;

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
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Ollama returned status ${res.status}`);
    }

    const data = await res.json();
    const text = data.response;
    if (!text) throw new Error("Empty response from Ollama");

    const parsed = JSON.parse(text.trim());
    return {
      relevant: Boolean(parsed.relevant),
      reason: String(parsed.reason || 'Analysis completed.'),
    };
  } catch (err) {
    console.error('Ollama analyze company failed:', err);
    return {
      relevant: true,
      reason: 'Local AI service unavailable. Fit analysis completed with default qualified status.',
    };
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { website, name } = body as { website?: string; name?: string };

    if (!website || !name) {
      return NextResponse.json(
        { error: 'website and name are required' },
        { status: 400 }
      );
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(website.startsWith('http') ? website : `https://${website}`);
    } catch {
      return NextResponse.json({ error: 'Invalid website URL' }, { status: 400 });
    }

    // Scrape website content
    const content = await scrapeCompany(parsedUrl.href);

    // Analyze with Ollama
    const analysis = await analyzeWithOllama(name, content, OUR_COMPANY_NAME, OUR_SERVICES);

    return NextResponse.json({
      ...analysis,
      scrapedChars: content.length,
    });
  } catch (err) {
    console.error('Analyze company error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
