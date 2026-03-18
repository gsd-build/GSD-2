const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.log("SKIPPED: ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 32,
    messages: [{ role: "user", content: "Reply with exactly: LIVE_TEST_OK" }],
  }),
});

if (!response.ok) {
  const body = await response.text();
  console.error(`Anthropic API error ${response.status}: ${body}`);
  process.exit(1);
}

const data = (await response.json()) as { content: Array<{ text: string }> };
const text = data.content?.[0]?.text || "";

if (!text.includes("LIVE_TEST_OK")) {
  console.error(`Unexpected response: "${text}"`);
  process.exit(1);
}
