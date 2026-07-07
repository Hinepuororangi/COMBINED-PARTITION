// Vercel serverless function — extracts candidate evidence claims from pasted
// document text using the Anthropic API. Requires ANTHROPIC_API_KEY set in
// this project's Environment Variables (Production + Preview).
//
// Input:  POST { text: string }
// Output: { claims: [{ claim_text, page_reference, verification_status }] }

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body || {};
  if (!text || typeof text !== "string" || text.trim().length < 20) {
    return res.status(400).json({ error: "Paste more document text first — need at least a few sentences." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY. Add it in Vercel project settings." });
  }

  const systemPrompt = `You extract discrete, citable factual claims from Māori Land Court documents (hearing minutes, orders, title schedules) for a case-tracking app.

Rules:
- Each claim must be a single, self-contained fact a lawyer could rely on — not a summary of the whole document.
- Include a page or paragraph reference for each claim, taken directly from the text if visible (e.g. "p3", "para 12"). If no reference is visible in the text, use "not specified in supplied text".
- Do not invent facts not present in the text.
- Aim for 3-8 claims depending on document length. Skip boilerplate/procedural filler.
- Respond ONLY with valid JSON, no markdown fences, no preamble, in this exact shape:
{"claims":[{"claim_text":"...","page_reference":"..."}]}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: text.slice(0, 20000) }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return res.status(502).json({ error: `Claude API error (${response.status}): ${errText.slice(0, 300)}` });
    }

    const data = await response.json();
    const textBlock = (data.content || []).find(b => b.type === "text");
    if (!textBlock) {
      return res.status(502).json({ error: "Claude returned no text content." });
    }

    let parsed;
    try {
      const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return res.status(502).json({ error: "Could not parse Claude's response as JSON.", raw: textBlock.text.slice(0, 500) });
    }

    const claims = (parsed.claims || []).map(c => ({
      claim_text: String(c.claim_text || "").slice(0, 1000),
      page_reference: String(c.page_reference || "not specified in supplied text").slice(0, 200),
    }));

    return res.status(200).json({ claims });
  } catch (e) {
    return res.status(500).json({ error: "Failed to reach Claude API: " + (e.message || String(e)) });
  }
}
