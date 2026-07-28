import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const company_name = body.company_name || body.companyName || 'the target company';
    const industry = body.industry || 'Technology';
    const country = body.country || 'Global';
    const company_summary = body.company_summary || body.description || body.relevance_reason || `${company_name} is a leading provider in the ${industry} industry.`;
    const matched_service = body.matched_service || body.matchedService || 'AI perception and robotics R&D';
    const match_reason = body.match_reason || body.matchReason || `optimizing and automating operations for ${company_name}`;
    const isFollowup = Boolean(body.is_followup || body.isFollowup);

    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

    const systemPrompt = isFollowup
      ? `Write a short, polite 2-3 sentence cold follow-up nudge email to ${company_name}, a company in the ${industry} industry (${country}). 

About them: ${company_summary}
Our service offered: ${matched_service}

Write a follow-up nudge email that:
1. Briefly references our initial email regarding WTechX's ${matched_service} solutions
2. Asks politely if they had a chance to review it or if there is a better person on their engineering/R&D team to connect with
3. Suggests a brief, low-friction 15-minute intro call
4. Keep it under 75 words, professional, warm, and zero fluff
5. Signed simply as 'The WTechX Team'

Return ONLY pure JSON matching this exact structure:
{
  "subject": "Following up: AI & Robotics R&D for ${company_name}",
  "body": "full follow-up email body text ready to send"
}`
      : `Write a short, compelling cold outreach email to ${company_name}, a company in the ${industry} industry (${country}). 

About them: ${company_summary}

We believe they need: ${matched_service} because ${match_reason}

About us: We are WTechX, a PhD-founded robotics R&D company specializing in LiDAR-inertial SLAM, AI perception, multi-sensor fusion, and robotics simulation.

Write an email that:
1. Opens with a specific, genuine hook referencing their actual business/product (not generic greetings like 'Dear Sir/Madam')
2. Identifies their specific pain point/need in one line
3. Positions our ${matched_service} service as the solution, briefly and confidently
4. Ends with a clear, low-friction call-to-action (e.g. suggesting a short 15-minute call)
5. Keep it under 150 words, professional but warm tone, no corporate jargon or generic filler phrases
6. Do not use placeholder brackets like [Your Name] — write it ready to send, signed simply as 'The WTechX Team'

Return ONLY pure JSON matching this exact structure:
{
  "subject": "short, specific subject line under 60 characters",
  "body": "full email body text ready to send"
}`;

    if (!apiKey) {
      console.warn('[Groq Email Gen] GROQ_API_KEY missing — using fallback draft');
      return NextResponse.json({
        subject: isFollowup ? `Following up: AI & Robotics R&D for ${company_name}` : `AI & Robotics R&D for ${company_name}`,
        body: isFollowup
          ? `Hi team at ${company_name},\n\nI wanted to quickly follow up on my previous message regarding WTechX's ${matched_service} solutions. I know things can get busy!\n\nWould you or someone on your engineering team have 15 minutes next week for a brief intro call?\n\nBest regards,\nThe WTechX Team`
          : `Hi team at ${company_name},\n\nI was following ${company_name}'s work in ${industry} and noticed your technical focus. Companies scaling in this space often face operational bottlenecks when ${match_reason}.\n\nAt WTechX, we specialize in ${matched_service} to help engineering teams automate perception, SLAM navigation, and sensor fusion tasks.\n\nWould you be open to a brief 15-minute intro call next week to discuss your R&D roadmap?\n\nBest regards,\nThe WTechX Team`
      });
    }

    console.log(`[Groq Email Gen] Generating ${isFollowup ? 'follow-up' : 'initial'} email for ${company_name}...`);

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
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text().catch(() => '');
      console.warn(`[Groq Email Gen] HTTP ${groqRes.status}: ${errText}`);
      return NextResponse.json({
        subject: isFollowup ? `Following up: AI & Robotics R&D for ${company_name}` : `AI & Robotics R&D for ${company_name}`,
        body: isFollowup
          ? `Hi team at ${company_name},\n\nFollowing up on my previous email regarding WTechX's ${matched_service} capabilities.\n\nWould you be open to a quick 15-minute call next week to see if there is alignment for your R&D roadmap?\n\nBest regards,\nThe WTechX Team`
          : `Hi team at ${company_name},\n\nI was reviewing ${company_name}'s operations in ${industry} and was impressed by your team's work. Teams expanding in this domain often look for specialized support when ${match_reason}.\n\nAt WTechX, we provide ${matched_service} to help accelerate production and R&D pipelines through advanced perception and multi-sensor fusion.\n\nWould you be available for a short 15-minute call next week to see if there is an alignment?\n\nBest regards,\nThe WTechX Team`
      });
    }

    const data = await groqRes.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim() || '{}';
    let parsed: { subject?: string; body?: string } = {};
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = { body: rawContent };
    }

    return NextResponse.json({
      subject: parsed.subject || (isFollowup ? `Following up: AI & Robotics R&D for ${company_name}` : `AI & Robotics R&D for ${company_name}`),
      body: parsed.body || rawContent,
    });
  } catch (err) {
    console.error('[Generate Email API] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate email' },
      { status: 500 }
    );
  }
}
