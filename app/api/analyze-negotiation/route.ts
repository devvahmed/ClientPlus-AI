import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedCompany } from '../auth-helper';

export async function POST(req: NextRequest) {
  try {
    const companyProfile = await getAuthenticatedCompany(req);
    if (!companyProfile) {
      return NextResponse.json(
        { error: 'Unauthorized. Valid Bearer token required.' },
        { status: 401 }
      );
    }

    const ourCompanyName = companyProfile.name;
    const ourServices = companyProfile.services || companyProfile.description || 'B2B Products & Solutions';
    const ourDescription = companyProfile.description || `${ourCompanyName} specializes in ${ourServices}.`;

    const body = await req.json();
    const company_name = body.company_name || body.companyName || 'the prospect company';
    const industry = body.industry || 'Technology';
    const country = body.country || 'Global';
    const matched_service = body.matched_service || body.matchedService || ourServices;
    const client_reply = body.client_reply || body.clientReply || body.reply || '';

    if (!client_reply || client_reply.trim().length < 5) {
      return NextResponse.json({ error: 'Client reply text is required for negotiation analysis.' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

    const systemPrompt = `You are an elite B2B Sales & Negotiation Strategist for ${ourCompanyName} (${ourDescription}).

The prospect company is: ${company_name} (${industry}, ${country}).
Our service solution: ${matched_service}.

The prospect replied to our outreach with this email/message:
"""
${client_reply}
"""

Evaluate their reply carefully and provide strategic negotiation guidance for ${ourCompanyName}:
1. Identify objection_type (pick ONE: "Price & Budget", "Technical Feasibility", "Implementation Timeline", "Competitor Comparison", "Scope & Customization", "General Interest")
2. Summarize detected_intent in one line.
3. Write strategy_hint: 1-2 actionable sales strategy tips for ${ourCompanyName} (e.g., offer phased pilot, highlight specific ROI, propose flexible milestones, or schedule a technical deep-dive).
4. Write subject: Professional counter-offer subject line under 60 chars.
5. Write body: Persuasive counter-reply email addressing their exact point (< 150 words, warm executive tone, no placeholder brackets, signed 'The ${ourCompanyName} Team').

Return ONLY pure JSON matching this exact structure:
{
  "objection_type": "Price & Budget",
  "detected_intent": "one line summary of client concern",
  "strategy_hint": "actionable sales strategy advice for ${ourCompanyName}",
  "subject": "counter-offer subject line",
  "body": "full counter-reply email body text"
}`;

    if (!apiKey) {
      return NextResponse.json({
        objection_type: 'Price & Budget',
        detected_intent: 'Client raised budget or implementation cost concerns.',
        strategy_hint: `Propose a 30-day Phased Pilot project at 40% cost to demonstrate clear ROI for ${ourCompanyName}'s solutions.`,
        subject: `Flexible Pilot Options for ${company_name}`,
        body: `Hi team at ${company_name},\n\nThank you for your response. I completely understand budget constraints are a priority.\n\nTo make this low-risk for your team, we can start with a 30-day Phased Pilot for ${matched_service}. This allows you to evaluate performance and ROI on a smaller scale before committing to full deployment.\n\nWould you be open to a quick 15-minute call next week to discuss pilot scope?\n\nBest regards,\nThe ${ourCompanyName} Team`
      });
    }

    console.log(`[Groq Negotiation Analysis] Analyzing client reply for ${company_name} on behalf of ${ourCompanyName}...`);

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: systemPrompt }],
        temperature: 0.3,
        max_tokens: 600,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text().catch(() => '');
      console.warn(`[Groq Negotiation Analysis] HTTP ${groqRes.status}: ${errText}`);
      return NextResponse.json({
        objection_type: 'Technical & Commercial Alignment',
        detected_intent: 'Client replied with questions regarding implementation and terms.',
        strategy_hint: `Offer a technical alignment call with ${ourCompanyName}'s engineering lead and flexible pilot milestones.`,
        subject: `Re: ${ourCompanyName} & ${company_name} Collaboration Options`,
        body: `Hi team at ${company_name},\n\nThank you for sharing your feedback. We would be happy to adapt our implementation schedule to fit your team's exact requirements for ${matched_service}.\n\nWould you be open to a brief 15-minute call with our team next week to explore tailored options?\n\nBest regards,\nThe ${ourCompanyName} Team`
      });
    }

    const data = await groqRes.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim() || '{}';
    let parsed: {
      objection_type?: string;
      detected_intent?: string;
      strategy_hint?: string;
      subject?: string;
      body?: string;
    } = {};

    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = { body: rawContent };
    }

    return NextResponse.json({
      objection_type: parsed.objection_type || 'General Interest',
      detected_intent: parsed.detected_intent || 'Client responded to outreach.',
      strategy_hint: parsed.strategy_hint || `Highlight ${ourCompanyName}'s specialized ${matched_service} capabilities and offer a flexible pilot roadmap.`,
      subject: parsed.subject || `Re: ${ourCompanyName} & ${company_name} Options`,
      body: parsed.body || rawContent,
    });
  } catch (err) {
    console.error('Negotiation analysis error:', err);
    return NextResponse.json({ error: 'Failed to analyze negotiation' }, { status: 500 });
  }
}
