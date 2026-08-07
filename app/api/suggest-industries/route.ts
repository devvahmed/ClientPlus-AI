import { NextRequest, NextResponse } from 'next/server';

function getBackendUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!envUrl || envUrl.startsWith('/')) {
    return 'http://localhost:8000';
  }
  return envUrl.replace(/\/$/, '');
}

// ─── GET /api/suggest-industries (Profile-Aware Quick Tags for Authenticated Company) ───
export async function GET(req: NextRequest) {
  const defaultFallback = ["Fintech", "Healthcare", "E-Commerce & Retail", "Software & SaaS", "Logistics & Supply Chain", "Industrial Manufacturing"];

  try {
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({
        success: true,
        suggested_industries: defaultFallback,
      });
    }

    const backendUrl = `${getBackendUrl()}/auth/suggest-industries`;
    const resp = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!resp.ok) {
      console.warn(`[Suggest Industries GET Proxy] Backend returned status ${resp.status}`);
      return NextResponse.json({
        success: true,
        suggested_industries: defaultFallback,
      });
    }

    const data = await resp.json();
    return NextResponse.json({
      success: true,
      company_name: data.company_name,
      suggested_industries: data.suggested_industries || defaultFallback,
    });
  } catch (err) {
    console.error('[Suggest Industries GET Proxy Error]:', err);
    return NextResponse.json({
      success: true,
      suggested_industries: defaultFallback,
    });
  }
}

// ─── POST /api/suggest-industries (Typed Keyword / Service Target Industry Suggestions) ───
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const service = (body.service || body.input || '').toString().trim();

    if (!service) {
      return NextResponse.json(
        { error: 'Technology or service name is required.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey.length < 10) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY is missing or invalid in environment variables.' },
        { status: 500 }
      );
    }

    const prompt = `We offer this technology/service: '${service}'. Suggest 5-8 real-world industries where companies would genuinely need this technology, with a one-line reason for each. Focus on industries where this creates clear business value. Return as JSON: [{"industry": "", "reason": ""}]`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[Suggest Industries] Groq API error HTTP ${response.status}: ${errText}`);
      return NextResponse.json(
        { error: `Groq API error (${response.status}): ${errText || 'Failed to generate suggestions'}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    let rawContent = data.choices?.[0]?.message?.content || '';
    rawContent = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();

    let suggestions: Array<{ industry: string; reason: string }> = [];

    try {
      const parsed = JSON.parse(rawContent);
      if (Array.isArray(parsed)) {
        suggestions = parsed;
      } else if (typeof parsed === 'object' && parsed !== null) {
        const possibleArray = Object.values(parsed).find((val) => Array.isArray(val));
        if (possibleArray && Array.isArray(possibleArray)) {
          suggestions = possibleArray as Array<{ industry: string; reason: string }>;
        }
      }
    } catch {
      const matches = [...rawContent.matchAll(/\{\s*"industry"\s*:\s*"([^"]+)"\s*,\s*"reason"\s*:\s*"([^"]+)"\s*\}/gi)];
      suggestions = matches.map((m) => ({ industry: m[1], reason: m[2] }));
    }

    const cleanedSuggestions = suggestions
      .filter((item) => item && typeof item.industry === 'string' && item.industry.trim().length > 0)
      .map((item) => ({
        industry: item.industry.trim(),
        reason: (item.reason || '').trim(),
      }));

    return NextResponse.json({
      success: true,
      service,
      suggestions: cleanedSuggestions,
    });
  } catch (error) {
    console.error('[Suggest Industries POST Error]:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unexpected server error occurred.' },
      { status: 500 }
    );
  }
}
