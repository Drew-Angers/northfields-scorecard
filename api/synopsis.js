module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { mode, round, history, players } = req.body;

  if (!round) return res.status(400).json({ error: "Missing round data" });

  let prompt = "";

  if (mode === "friday") {
    // Friday League — full group storyteller treatment
    const roundPlayers = players || Object.keys(round.player_data);
    const totals = Object.fromEntries(
      roundPlayers.map(p => [p, round.player_data[p].scores.reduce((a, b) => a + b, 0)])
    );
    const minTotal = Math.min(...Object.values(totals));
    const maxTotal = Math.max(...Object.values(totals));
    const winners = roundPlayers.filter(p => totals[p] === minTotal);
    const lastPlace = roundPlayers.filter(p => totals[p] === maxTotal);

    // Build per-player scorecard text
    const scorecards = roundPlayers.map(p => {
      const pd = round.player_data[p];
      const over = totals[p] - 36; // par 36 for 12 holes
      const birdies = pd.scores.filter(s => s <= 2).length;
      const threePutts = pd.threePutts ? pd.threePutts.filter(Boolean).length : 0;
      const girs = pd.girs.filter(Boolean).length;
      return `${p}: ${over >= 0 ? "+" : ""}${over} (${totals[p]} strokes) | ${birdies} birdies | ${girs} GIR | ${threePutts} 3-putts`;
    }).join("\n");

    // Detect dramatic moments
    const EXPANDED_12_LABELS = ["6","Long 7","7","8","8>9","9","1","2","3","4","5","Short 5"];
    const dramaticMoments = [];

    // Check each hole for interesting moments
    for (let i = 0; i < 12; i++) {
      const holeLabel = EXPANDED_12_LABELS[i];
      const holeScores = Object.fromEntries(roundPlayers.map(p => [p, round.player_data[p].scores[i]]));
      const holeGirs = Object.fromEntries(roundPlayers.map(p => [p, round.player_data[p].girs[i]]));
      const minHoleScore = Math.min(...Object.values(holeScores));

      // Birdies (score of 2 on par 3)
      const birdiers = roundPlayers.filter(p => holeScores[p] <= 2);
      if (birdiers.length > 0) {
        const chipIns = birdiers.filter(p => !holeGirs[p]); // birdie without GIR = chip-in or putt from off green
        if (chipIns.length > 0) {
          // Last hole chip-in is especially dramatic
          if (i === 11 || i === 10) {
            dramaticMoments.push(`DRAMATIC: ${chipIns.join(" & ")} chipped in for birdie on hole ${holeLabel} (no GIR) — late heroics`);
          } else {
            dramaticMoments.push(`${chipIns.join(" & ")} made birdie on ${holeLabel} without hitting the green (chip-in or scramble)`);
          }
        } else {
          dramaticMoments.push(`${birdiers.join(" & ")} birdied hole ${holeLabel}`);
        }
      }

      // Blow-ups (double bogey or worse = 5+)
      const blowups = roundPlayers.filter(p => holeScores[p] >= 5);
      if (blowups.length > 0) {
        dramaticMoments.push(`${blowups.join(" & ")} carded ${blowups.map(p => holeScores[p]).join("/")} on hole ${holeLabel} (double bogey+)`);
      }
    }

    // Last hole three-putters
    for (let h = 11; h >= 0; h--) {
      const tp = roundPlayers.filter(p => round.player_data[p].threePutts && round.player_data[p].threePutts[h]);
      if (tp.length > 0) {
        dramaticMoments.push(`${tp.join(" & ")} three-putted last (hole ${EXPANDED_12_LABELS[h]}) — owes vig`);
        break;
      }
    }

    prompt = `You are a golf commentator writing a round recap for a casual Friday league at Northfields Golf Course. The course is a par-3 layout and the group plays 12 holes (including 3 "bullshit holes": Long 7, 8>9 shortcut, and Short 5).

Write a tight 2-paragraph round recap. Paragraph 1: set the scene and tell the story of who won and how. Paragraph 2: pick out 2-3 specific moments from the "Dramatic Moments" list below — especially any chip-ins, late heroics, or blow-ups that changed the outcome. If the list is empty, invent plausible commentary based on the scorecards. Use a voice that's like a slightly sarcastic but warm friend, not a formal announcer.

Round date: ${round.date ? new Date(round.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "today"}
Players: ${roundPlayers.join(", ")}
Winner(s): ${winners.join(" & ")} at ${fmtOver(minTotal - 36)}
Last place: ${lastPlace.join(" & ")} at ${fmtOver(maxTotal - 36)}

Scorecards:
${scorecards}

Dramatic Moments (use these specifically):
${dramaticMoments.length > 0 ? dramaticMoments.join("\n") : "No standout moments detected — use the scorecards to infer the story."}

Write only the two paragraphs, no headers, no bullet points.`;

  } else if (mode === "standard") {
    // Standard round — individual player synopsis with history context
    const { player, scores, girs, putts, course } = round;
    const totalHoles = scores.length;
    const par = totalHoles * 3;
    const total = scores.reduce((a, b) => a + b, 0);
    const overUnder = total - par;
    const birdies = scores.filter(s => s <= 2).length;
    const bogeys = scores.filter(s => s === 4).length;
    const doubles = scores.filter(s => s >= 5).length;
    const girCount = girs.filter(Boolean).length;

    let historyContext = "";
    if (history && history.length > 0) {
      const recent = history.slice(0, 5);
      const avgScore = recent.reduce((s, r) => s + r.scores.reduce((a, b) => a + b, 0), 0) / recent.length;
      const avgOver = avgScore - (recent[0].scores.length * 3);
      historyContext = `\nPlayer's last ${recent.length} rounds avg: ${avgOver >= 0 ? "+" : ""}${avgOver.toFixed(1)} per round. Today's score vs their average: ${overUnder - avgOver >= 0 ? "+" : ""}${(overUnder - avgOver).toFixed(1)}.`;
    }

    prompt = `You are a golf caddie giving a brief post-round debrief for a player at Northfields Golf Course (par-3 layout). 

Write exactly 2 short paragraphs: what went well, and what to work on. Be honest but not brutal. Reference specific stats from this round. Use a conversational, coach-y tone — like a good playing partner, not a stat robot.

Player: ${player}
Course: ${course === "expanded12" ? "Expanded 12 holes (Par 36)" : "Original 9 holes (Par 27)"}
Score: ${fmtOver(overUnder)} (${total} strokes)
Birdies: ${birdies} | Bogeys: ${bogeys} | Doubles+: ${doubles}
GIR: ${girCount}/${totalHoles} (${Math.round(girCount/totalHoles*100)}%)
${historyContext}

Write only the two paragraphs. No headers, no bullet points.`;

  } else if (mode === "practice") {
    // Practice round synopsis
    const { player, ball_data, balls_per_hole, course } = round;
    const bph = balls_per_hole || 5;
    const allScores = ball_data.map(h => h.scores).flat();
    const total = allScores.reduce((a, b) => a + b, 0);
    const avg = (total / allScores.length).toFixed(2);
    const birdies = allScores.filter(s => s <= 2).length;
    const doubles = allScores.filter(s => s >= 5).length;
    const girCount = ball_data.map(h => h.girs).flat().filter(Boolean).length;
    const totalBalls = allScores.length;

    // Find best and worst holes by average
    const holeAvgs = ball_data.map((h, i) => ({
      hole: i + 1,
      avg: h.scores.reduce((a, b) => a + b, 0) / bph,
    }));
    const bestHole = holeAvgs.reduce((a, b) => a.avg < b.avg ? a : b);
    const worstHole = holeAvgs.reduce((a, b) => a.avg > b.avg ? a : b);

    let historyContext = "";
    if (history && history.length > 0) {
      const recent = history.slice(0, 5);
      const recentAvgs = recent.map(r => {
        const s = r.ball_data.map(h => h.scores).flat();
        return s.reduce((a, b) => a + b, 0) / s.length;
      });
      const histAvg = (recentAvgs.reduce((a, b) => a + b, 0) / recentAvgs.length).toFixed(2);
      historyContext = `\nRecent average per ball: ${histAvg}. Today's average: ${avg}. ${parseFloat(avg) < parseFloat(histAvg) ? "Better than usual." : parseFloat(avg) > parseFloat(histAvg) ? "Below recent form." : "Right on average."}`;
    }

    prompt = `You are a golf instructor giving a brief debrief after a multi-ball practice session at Northfields Golf Course.

Write exactly 2 short paragraphs: what the session revealed and what to focus on next time. Be specific and constructive. Use a coaching tone.

Player: ${player}
Session: ${bph} balls per hole, ${course === "expanded12" ? "Expanded 12" : "Original 9"} holes
Average score per ball: ${avg}
Birdies: ${birdies}/${totalBalls} balls | Doubles+: ${doubles}/${totalBalls} balls
GIR: ${girCount}/${totalBalls} (${Math.round(girCount/totalBalls*100)}%)
Best hole avg: Hole ${bestHole.hole} (${bestHole.avg.toFixed(2)}) | Worst: Hole ${worstHole.hole} (${worstHole.avg.toFixed(2)})
${historyContext}

Write only the two paragraphs. No headers, no bullet points.`;
  }

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
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    res.status(200).json({ synopsis: text });
  } catch (err) {
    console.error("Synopsis error:", err);
    res.status(500).json({ error: "Failed to generate synopsis" });
  }
}

function fmtOver(val) {
  if (val > 0) return `+${val}`;
  if (val === 0) return "E";
  return `${val}`;
}
