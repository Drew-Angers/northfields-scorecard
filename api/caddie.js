export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages, context } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "Missing messages" });

  const mode = context?.mode || "home";

  let systemPrompt = "";

  if (mode === "home") {
    systemPrompt = `You are a friendly golf caddie AI assistant for Northfields Golf Course, a par-3 layout. You help golfers improve their game and answer questions about golf. Keep answers concise and conversational.`;

  } else if (mode === "standard") {
    const player = context.player || "the player";
    const rounds = context.standardRounds || [];

    let historyText = "No round history available.";
    if (rounds.length > 0) {
      const recent = rounds.slice(0, 10);
      const summaries = recent.map(r => {
        const total = r.scores ? r.scores.reduce((a, b) => a + b, 0) : "?";
        const par = r.scores ? r.scores.length * 3 : 27;
        const over = typeof total === "number" ? total - par : "?";
        const birdies = r.scores ? r.scores.filter(s => s <= 2).length : 0;
        const date = r.date ? new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "unknown date";
        return `${date}: ${over >= 0 ? "+" : ""}${over} (${total} strokes, ${birdies} birdies)`;
      });
      historyText = summaries.join("\n");
    }

    systemPrompt = `You are a golf caddie AI for ${player} at Northfields Golf Course (par-3 layout). You have access to their recent round history below. Answer questions about their game, trends, and what to work on. Be specific, use their actual stats, and keep a friendly coaching tone.

${player}'s recent rounds (most recent first):
${historyText}`;

  } else if (mode === "practice") {
    const player = context.player || "the player";
    const rounds = context.practiceRounds || [];

    let historyText = "No practice history available.";
    if (rounds.length > 0) {
      const recent = rounds.slice(0, 10);
      const summaries = recent.map(r => {
        const date = r.date ? new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "unknown date";
        if (r.ball_data) {
          const allScores = r.ball_data.map(h => h.scores || []).flat();
          const avg = allScores.length ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(2) : "?";
          const birdies = allScores.filter(s => s <= 2).length;
          return `${date}: avg ${avg} per ball, ${birdies} birdies across ${allScores.length} balls`;
        }
        return `${date}: practice round`;
      });
      historyText = summaries.join("\n");
    }

    systemPrompt = `You are a golf instructor AI for ${player} at Northfields Golf Course (par-3 layout). They use a multi-ball practice format. You have access to their recent practice sessions below. Answer questions about their practice trends and what to focus on. Be specific and constructive.

${player}'s recent practice sessions (most recent first):
${historyText}`;

  } else if (mode === "friday_group") {
    const rounds = context.allFridayRounds || [];
    const FRIDAY_PLAYERS = ["Jeff", "Nado", "Wizt", "Minnis", "Joe", "Saab"];

    let historyText = "No Friday round history available.";
    if (rounds.length > 0) {
      const recent = rounds.slice(0, 6);
      const summaries = recent.map(r => {
        const date = r.date ? new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "unknown date";
        if (r.player_data) {
          const players = Object.keys(r.player_data);
          const totals = players.map(p => {
            const t = r.player_data[p].scores ? r.player_data[p].scores.reduce((a, b) => a + b, 0) : 0;
            const over = t - 36;
            return `${p}: ${over >= 0 ? "+" : ""}${over}`;
          });
          const minTotal = Math.min(...players.map(p => r.player_data[p].scores ? r.player_data[p].scores.reduce((a, b) => a + b, 0) : 99));
          const winner = players.find(p => r.player_data[p].scores && r.player_data[p].scores.reduce((a, b) => a + b, 0) === minTotal);
          return `${date}: ${totals.join(", ")} — Winner: ${winner || "unknown"}`;
        }
        return `${date}: Friday round`;
      });
      historyText = summaries.join("\n");
    }

    systemPrompt = `You are a golf caddie AI for the Northfields Friday League (par-3 course, 12 holes including 3 "bullshit holes": Long 7, 8>9 shortcut, Short 5). The regular players are: ${FRIDAY_PLAYERS.join(", ")}. You have the group's recent results below. Answer questions about individual and group performance, trends, rivalries, and what's happening in the league. Be fun and a little sarcastic, like a friend who's also a golf nerd.

Recent Friday rounds (most recent first):
${historyText}`;
  }

  const apiMessages = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: systemPrompt,
        messages: apiMessages,
      }),
    });

    const data = await response.json();
    const reply = data.content?.[0]?.text || "Sorry, I couldn't get a response.";
    res.status(200).json({ reply });
  } catch (err) {
    console.error("Caddie error:", err);
    res.status(500).json({ error: "Failed to get caddie response" });
  }
}
