import React, { useState, useMemo, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import emailjs from "@emailjs/browser";

const SUPABASE_URL = "https://hybvcewrzmjchttfcmtf.supabase.co";
const SUPABASE_KEY = "sb_publishable_IJk_K2xsCTRTwSew1n_SwQ_KULWljka";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const EMAILJS_SERVICE = "service_uyv5jqh";
const EMAILJS_TEMPLATE = "template_sj5odqn";
const EMAILJS_KEY = "PBPIBzF5UxnwU1QPR";

const PAR = 3;
const APP_NAME = "⛳ Northfields Scorecard";
const FRIDAY_PLAYERS = ["Jeff", "Nado", "Wizt", "Minnis", "Joe", "Saab"];
const ADMIN_PIN = "0523";

// Original 9 holes
const ORIGINAL_9 = [1,2,3,4,5,6,7,8,9];

// Expanded 12 holes - Friday layout
const EXPANDED_12 = [
  { num: 6, label: "6", real: true },
  { num: "L7", label: "Long 7", real: false },
  { num: 7, label: "7", real: true },
  { num: 8, label: "8", real: true },
  { num: "89", label: "8>9", real: false },
  { num: 9, label: "9", real: true },
  { num: 1, label: "1", real: true },
  { num: 2, label: "2", real: true },
  { num: 3, label: "3", real: true },
  { num: 4, label: "4", real: true },
  { num: 5, label: "5", real: true },
  { num: "S5", label: "Short 5", real: false },
];

// Indices of real holes in expanded 12 array (not bullshit holes)
const REAL_HOLE_INDICES = EXPANDED_12.map((h, i) => h.real ? i : -1).filter(i => i >= 0);
// Maps expanded 12 index to actual hole number for stat extraction
const REAL_HOLE_NUMS = EXPANDED_12.filter(h => h.real).map(h => h.num);

function getHoleOrder(startHole, course = "original9") {
  if (course === "expanded12") return EXPANDED_12.map(h => h.num);
  const idx = ORIGINAL_9.indexOf(startHole);
  return [...ORIGINAL_9.slice(idx), ...ORIGINAL_9.slice(0, idx)];
}

// Extract 9 real hole scores from an expanded 12 round, mapped to holes 1-9
function extractRealHoleScores(scores12, girs12, putts12) {
  const scores = Array(9).fill(PAR);
  const girs = Array(9).fill(0);
  const putts = Array(9).fill(2);
  REAL_HOLE_INDICES.forEach((idx, i) => {
    const holeNum = REAL_HOLE_NUMS[i];
    const slot = holeNum - 1; // 0-indexed position in standard 9
    if (slot >= 0 && slot < 9) {
      scores[slot] = scores12[idx];
      girs[slot] = girs12[idx];
      if (putts12) putts[slot] = putts12[idx];
    }
  });
  return { scores, girs, putts };
}

async function saveDraft(key, data) {
  await supabase.from("drafts").upsert({ key, data, updated_at: new Date().toISOString() }, { onConflict: "key" });
}
async function loadDraft(key) {
  const { data } = await supabase.from("drafts").select("*").eq("key", key).single();
  return data ? data.data : null;
}
async function clearDraft(key) {
  await supabase.from("drafts").delete().eq("key", key);
}

function fmtDate(iso) { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function daysDiff(iso) { return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); }
function scoreLabel(s) {
  if (s === 1) return "No fucking way";
  if (s === 2) return "Tweet Tweet 🐦";
  if (s === 3) return "Nice";
  if (s === 4) return "Meh";
  return "You suck";
}
function scoreColor(s) {
  if (s <= PAR - 1) return "#facc15";
  if (s === PAR) return "#4ade80";
  if (s === PAR + 1) return "#fb923c";
  return "#f87171";
}
function recentHoleColor(s) {
  if (s <= PAR - 1) return "#facc15";
  if (s === PAR) return "#4ade80";
  if (s === PAR + 1) return "#fb923c";
  return "#f87171";
}
function fmtOver(val) {
  if (val > 0) return `+${val}`;
  if (val === 0) return "E";
  return `${val}`;
}
function fmtOverAvg(val) {
  if (val > 0) return `+${val.toFixed(1)}`;
  if (val === 0) return "E";
  return val.toFixed(1);
}

function suggestPutts(score, gir) {
  if (gir) {
    if (score <= PAR - 1) return 1;
    if (score === PAR) return 2;
    return 3;
  } else {
    if (score <= PAR - 1) return 0;
    if (score === PAR) return 1;
    return 2;
  }
}

function inferPuttsFromBool(score, gir, threePutt) {
  if (threePutt) return 3;
  if (score === 1) return 0;
  if (gir) { if (score <= PAR - 1) return 1; if (score === PAR) return 2; return 3; }
  else { if (score <= PAR - 1) return 0; if (score === PAR) return 1; return 2; }
}

function filterByPeriod(rounds, period) {
  if (period === "all") return rounds;
  if (period === "recent") return rounds.length > 0 ? [rounds[0]] : [];
  const now = new Date();
  const tm = now.getMonth(), ty = now.getFullYear();
  return rounds.filter(r => {
    const d = new Date(r.date);
    if (period === "thisMonth") return d.getMonth() === tm && d.getFullYear() === ty;
    if (period === "lastMonth") {
      const lm = tm === 0 ? 11 : tm - 1;
      const ly = tm === 0 ? ty - 1 : ty;
      return d.getMonth() === lm && d.getFullYear() === ly;
    }
    return true;
  });
}

function calcStats(scores, girs, threePuttsOrPutts, isPuttCounts = false) {
  const n = scores.length;
  const totalScore = scores.reduce((a, b) => a + b, 0);
  const overUnder = totalScore - PAR * n;
  const totalGIRs = girs.filter(Boolean).length;
  const girPct = Math.round(totalGIRs / n * 100);
  const missedGIR = girs.map((g, i) => g === 0 ? i : -1).filter(i => i >= 0);
  const upAndDowns = missedGIR.filter(i => scores[i] <= PAR).length;
  const upAndDownPct = missedGIR.length > 0 ? Math.round(upAndDowns / missedGIR.length * 100) : 100;
  const birdies = scores.filter(s => s <= PAR - 1).length;
  const bogeyOrWorse = scores.filter(s => s >= PAR + 1).length;
  const birdieConvPct = totalGIRs > 0 ? Math.round(scores.filter((s, i) => girs[i] === 1 && s <= PAR - 1).length / totalGIRs * 100) : 0;
  const blowups = scores.filter(s => s >= PAR + 2).length;
  const blowupPct = Math.round(blowups / n * 100);
  const birdieBogeRatio = bogeyOrWorse > 0 ? Math.round((birdies / bogeyOrWorse) * 100) / 100 : birdies > 0 ? 999 : 0;
  const consistencyPct = Math.round((n - blowups) / n * 100);
  let maxGIRStreak = 0, curGIRStreak = 0;
  girs.forEach(g => { if (g) { curGIRStreak++; maxGIRStreak = Math.max(maxGIRStreak, curGIRStreak); } else curGIRStreak = 0; });
  let puttsArr;
  if (isPuttCounts) { puttsArr = threePuttsOrPutts; }
  else {
    const tp = threePuttsOrPutts || Array(n).fill(false);
    puttsArr = scores.map((s, i) => inferPuttsFromBool(s, girs[i], tp[i]));
  }
  const totalPutts = puttsArr.reduce((a, b) => a + b, 0);
  const avgPutts = totalPutts / n;
  const totalThreePutts = isPuttCounts ? puttsArr.filter(p => p >= 3).length : (threePuttsOrPutts || []).filter(Boolean).length;
  const girPuttHoles = girs.map((g, i) => g ? puttsArr[i] : null).filter(v => v !== null);
  const nonGIRPuttHoles = girs.map((g, i) => !g ? puttsArr[i] : null).filter(v => v !== null);
  const puttsPerGIR = girPuttHoles.length > 0 ? girPuttHoles.reduce((a, b) => a + b, 0) / girPuttHoles.length : null;
  const puttsPerNonGIR = nonGIRPuttHoles.length > 0 ? nonGIRPuttHoles.reduce((a, b) => a + b, 0) / nonGIRPuttHoles.length : null;
  return {
    totalScore, overUnder, totalGIRs, girPct, upAndDownPct, upAndDowns,
    missedGIRCount: missedGIR.length, birdieConvPct, birdies, bogeyOrWorse,
    birdieBogeRatio, blowups, blowupPct, consistencyPct, maxGIRStreak,
    totalThreePutts, totalPutts, avgPutts, puttsArr, puttsPerGIR, puttsPerNonGIR, n,
  };
}

function calcHandicap(rounds, extractor) {
  if (rounds.length < 5) return null;
  const diffs = rounds.map(r => {
    const { scores, girs, putts, isPuttCounts } = extractor(r);
    const st = calcStats(scores, girs, putts, isPuttCounts);
    return (st.totalScore - PAR * scores.length) + (scores.length - st.totalGIRs) * 0.4 + st.blowups * 1.0 - st.birdies * 0.5 - (st.upAndDownPct / 100) * 0.8 + (st.avgPutts - 2) * 0.3;
  });
  const best = diffs.slice().sort((a, b) => a - b).slice(0, Math.max(1, Math.floor(diffs.length * 0.4)));
  return Math.max(0, Math.round(best.reduce((a, b) => a + b, 0) / best.length * 10) / 10);
}

function getHardestHoles(rounds, playerName, count) {
  const myRounds = rounds.filter(r => r.player_name === playerName);
  if (myRounds.length < 3) return [3,4,5,8].slice(0, count);
  const holeAvgs = ORIGINAL_9.map(h => {
    const idx = h - 1;
    const scores = myRounds.map(r => r.scores[idx]).filter(s => s != null);
    return { hole: h, avg: scores.length ? scores.reduce((a,b) => a+b,0)/scores.length : PAR };
  });
  return holeAvgs.sort((a,b) => b.avg - a.avg).slice(0, count).map(h => h.hole);
}

function calcNetScore(scores, holeOrder, strokeHoles) {
  return scores.map((s, i) => {
    const hole = holeOrder[i];
    return strokeHoles.includes(hole) ? s - 1 : s;
  });
}

function updateCricket(cricket, round, players) {
  const closed = { ...cricket.closed };
  EXPANDED_12.forEach((h, i) => {
    if (closed[h.label]) return;
    const birdiers = players.filter(p => round.playerData[p] && round.playerData[p].scores[i] <= PAR - 1);
    if (birdiers.length === 1) closed[h.label] = birdiers[0];
  });
  return { ...cricket, closed };
}

function calcVig(round, players) {
  const totals = Object.fromEntries(players.map(p => [p, round.playerData[p].scores.reduce((a, b) => a + b, 0)]));
  const minScore = Math.min(...Object.values(totals));
  const maxScore = Math.max(...Object.values(totals));
  const vigOwed = Object.fromEntries(players.map(p => [p, 5]));
  players.filter(p => totals[p] === minScore).forEach(p => { vigOwed[p] -= 5; });
  players.filter(p => totals[p] === maxScore).forEach(p => { vigOwed[p] += 5; });
  for (let h = EXPANDED_12.length - 1; h >= 0; h--) {
    const tp = players.filter(p => round.playerData[p].threePutts[h]);
    if (tp.length > 0) { tp.forEach(p => { vigOwed[p] += 5; }); break; }
  }
  return { vigOwed, totals };
}

function getLastThreePutters(round, players) {
  const pd = round.playerData || round.player_data;
  for (let h = EXPANDED_12.length - 1; h >= 0; h--) {
    const tp = players.filter(p => pd[p].threePutts[h]);
    if (tp.length > 0) return tp;
  }
  return [];
}

function countThreePuttVigs(rounds, playerName) {
  let count = 0;
  rounds.forEach(r => {
    const players = r.players || FRIDAY_PLAYERS;
    if (!players.includes(playerName)) return;
    if (getLastThreePutters({ playerData: r.player_data }, players).includes(playerName)) count++;
  });
  return count;
}

function calcSkins(playerScores, holeOrder, skinAmt) {
  const players = Object.keys(playerScores);
  const skins = [];
  let carryover = skinAmt;
  holeOrder.forEach((hole, i) => {
    const scores = Object.fromEntries(players.map(p => [p, playerScores[p][i]]));
    const minScore = Math.min(...Object.values(scores));
    const winners = players.filter(p => scores[p] === minScore);
    if (winners.length === 1) {
      skins.push({ hole, winner: winners[0], value: carryover });
      carryover = skinAmt;
    } else {
      carryover += skinAmt;
    }
  });
  return { skins, carryover: carryover > skinAmt ? carryover - skinAmt : 0 };
}

function calcBirdieSettlement(playerScores, holeOrder, birdieAmt) {
  const players = Object.keys(playerScores);
  const settlements = Object.fromEntries(players.map(p => [p, 0]));
  holeOrder.forEach((hole, i) => {
    const birdiers = players.filter(p => playerScores[p][i] <= PAR - 1);
    const nonBirdiers = players.filter(p => playerScores[p][i] > PAR - 1);
    if (birdiers.length > 0 && birdiers.length < players.length) {
      birdiers.forEach(b => { nonBirdiers.forEach(nb => { settlements[b] += birdieAmt; settlements[nb] -= birdieAmt; }); });
    }
  });
  return settlements;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const M = {
  page: { minHeight: "100vh", background: "#0a0a0a", color: "white", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: 480, margin: "0 auto", paddingBottom: 40 },
  header: { padding: "48px 20px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 8 },
  btn: { background: "#4ade80", color: "#000", fontWeight: 800, fontSize: "1rem", border: "none", borderRadius: 14, padding: "18px 16px", cursor: "pointer", width: "100%", minHeight: 56, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, WebkitTapHighlightColor: "transparent" },
  btnSm: { background: "rgba(255,255,255,0.07)", color: "white", fontWeight: 700, fontSize: "0.85rem", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "14px 12px", cursor: "pointer", minHeight: 48, WebkitTapHighlightColor: "transparent" },
  ghost: { background: "transparent", border: "none", color: "#666", fontSize: "0.9rem", cursor: "pointer", padding: "12px 0", fontWeight: 600, display: "flex", alignItems: "center", gap: 6, WebkitTapHighlightColor: "transparent" },
  scoreBtn: { width: 52, height: 52, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "white", fontSize: "1.5rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0, WebkitTapHighlightColor: "transparent", minWidth: 52 },
  toggle: (active, activeColor, activeBg) => ({ flex: 1, padding: "16px 8px", borderRadius: 12, border: "1px solid", borderColor: active ? activeColor : "rgba(255,255,255,0.1)", background: active ? activeBg : "rgba(255,255,255,0.03)", color: active ? activeColor : "#555", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", minHeight: 52, WebkitTapHighlightColor: "transparent" }),
  statBox: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "16px 10px", textAlign: "center" },
  th: { padding: "8px 4px", color: "#444", fontWeight: 600, fontSize: "0.72rem", borderBottom: "1px solid rgba(255,255,255,0.06)", textAlign: "center" },
  td: { padding: "8px 4px", borderBottom: "1px solid rgba(255,255,255,0.04)", textAlign: "center", color: "#bbb", fontSize: "0.8rem" },
};

function StatBox({ val, label, accent }) {
  return (
    <div style={M.statBox}>
      <div style={{ fontSize: "1.4rem", fontWeight: 800, color: accent || "#4ade80", fontFamily: "monospace" }}>{val}</div>
      <div style={{ fontSize: "0.62rem", color: "#666", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function StatsGrid({ st }) {
  const bbRatio = st.birdieBogeRatio === 999 ? "∞" : st.birdieBogeRatio === 0 ? "0" : st.birdieBogeRatio.toFixed(2);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 20 }}>
      <StatBox val={fmtOver(st.overUnder)} label="Score vs Par" accent="#fff" />
      <StatBox val={`${st.girPct}%`} label="GIR %" />
      <StatBox val={`${st.upAndDownPct}%`} label="Scramble %" accent="#4ade80" />
      <StatBox val={`${st.birdieConvPct}%`} label="Birdie Conv %" accent="#facc15" />
      <StatBox val={`${st.blowupPct}%`} label="Blow-up %" accent="#f87171" />
      <StatBox val={bbRatio} label="Birdie:Bogey+" />
      <StatBox val={`${st.consistencyPct}%`} label="Consistency" accent="#4ade80" />
      <StatBox val={st.avgPutts.toFixed(2)} label="Avg Putts" />
      <StatBox val={st.puttsPerGIR !== null ? st.puttsPerGIR.toFixed(2) : "—"} label="Putts/GIR" />
      <StatBox val={st.puttsPerNonGIR !== null ? st.puttsPerNonGIR.toFixed(2) : "—"} label="Putts/No GIR" />
      <StatBox val={st.maxGIRStreak} label="GIR Streak" />
      <StatBox val={st.birdies} label="Birdies" accent="#facc15" />
    </div>
  );
}

function ProgressBar({ total, current, color }) {
  return (
    <div style={{ display: "flex", gap: 3, padding: "0 16px 16px" }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ flex: 1, height: 5, borderRadius: 4, background: i < current ? color : i === current ? color + "66" : "rgba(255,255,255,0.1)" }} />
      ))}
    </div>
  );
}

function BackBtn({ onBack, label = "Back" }) {
  return <button style={M.ghost} onClick={onBack}>‹ {label}</button>;
}

function LoadingScreen() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: "2rem" }}>⛳</div>
      <div style={{ color: "#444", fontSize: "0.9rem" }}>Loading...</div>
    </div>
  );
}

function PeriodFilter({ period, onChange }) {
  const opts = [
    { val: "recent", label: "Most Recent" },
    { val: "thisMonth", label: "This Month" },
    { val: "lastMonth", label: "Last Month" },
    { val: "all", label: "All Time" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
      {opts.map(o => (
        <button key={o.val} onClick={() => onChange(o.val)} style={{ flex: 1, padding: "10px 4px", borderRadius: 10, border: "1px solid", borderColor: period === o.val ? "#4ade80" : "rgba(255,255,255,0.1)", background: period === o.val ? "rgba(74,222,128,0.1)" : "transparent", color: period === o.val ? "#4ade80" : "#555", fontWeight: 700, fontSize: "0.65rem", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DraftResumeModal({ draftDate, onResume, onDiscard }) {
  const days = daysDiff(draftDate);
  const label = days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }}>
      <div style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 28, maxWidth: 360, width: "100%" }}>
        <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>🏌️</div>
        <div style={{ fontWeight: 900, fontSize: "1.2rem", marginBottom: 8 }}>Unfinished Round</div>
        <div style={{ color: "#666", fontSize: "0.88rem", marginBottom: 24 }}>
          You have an unfinished round from <span style={{ color: "#fff", fontWeight: 700 }}>{fmtDate(draftDate)}</span> ({label}). Resume or start fresh?
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onDiscard} style={{ ...M.btnSm, flex: 1, color: "#f87171", borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)" }}>Discard</button>
          <button onClick={onResume} style={{ ...M.btn, flex: 2 }}>Resume →</button>
        </div>
      </div>
    </div>
  );
}

function CourseSelector({ onSelect }) {
  return (
    <div style={{ padding: "0 12px" }}>
      <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 16 }}>Which course?</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <button onClick={() => onSelect("original9")} style={{ ...M.btn, justifyContent: "space-between", padding: "20px 18px" }}>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 900 }}>Original 9</div>
            <div style={{ fontSize: "0.78rem", opacity: 0.7, fontWeight: 400, marginTop: 2 }}>Holes 1–9 · Par 27</div>
          </div>
          <span>→</span>
        </button>
        <button onClick={() => onSelect("expanded12")} style={{ ...M.btn, background: "rgba(167,139,250,0.12)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.25)", justifyContent: "space-between", padding: "20px 18px" }}>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 900 }}>Expanded 12</div>
            <div style={{ fontSize: "0.78rem", opacity: 0.7, fontWeight: 400, marginTop: 2 }}>Long 7, 8&gt;9, Short 5 · Par 36</div>
          </div>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}

function StartingHoleSelector({ onSelect }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
      <button onClick={() => onSelect(1)} style={{ ...M.btn, flex: 1 }}>Start Hole 1</button>
      <button onClick={() => onSelect(6)} style={{ ...M.btn, flex: 1, background: "rgba(74,222,128,0.12)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>Start Hole 6 ?</button>
    </div>
  );
}

function MoneyStepper({ label, value, onChange, increment, min = 0, color = "#4ade80" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button style={M.scoreBtn} onClick={() => onChange(Math.max(min, value - increment))}>−</button>
        <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: "1.4rem", minWidth: 52, textAlign: "center", color: value > 0 ? color : "#444" }}>
          {value > 0 ? `$${value}` : "Off"}
        </span>
        <button style={M.scoreBtn} onClick={() => onChange(value + increment)}>+</button>
      </div>
    </div>
  );
}

// ─── Bug Reporter ─────────────────────────────────────────────────────────────
function BugReporter({ onBack }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("Bug");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!message.trim()) return;
    setSending(true);
    const payload = {
      name: name.trim() || "Anonymous",
      type,
      message: message.trim(),
      time: new Date().toLocaleString(),
    };
    // Save to Supabase
    await supabase.from("feedback").insert(payload);
    // Send email
    try {
      await emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, payload, EMAILJS_KEY);
    } catch (e) { console.error("Email failed", e); }
    setSending(false);
    setSent(true);
  };

  if (sent) return (
    <div>
      <div style={M.header}><BackBtn onBack={onBack} label="Home" /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>Thanks! 🙏</div></div>
      <div style={{ padding: "0 12px", textAlign: "center", paddingTop: 40 }}>
        <div style={{ fontSize: "3rem", marginBottom: 16 }}>✅</div>
        <div style={{ color: "#4ade80", fontWeight: 700, fontSize: "1.1rem", marginBottom: 8 }}>Submitted!</div>
        <div style={{ color: "#555", fontSize: "0.85rem" }}>Drew will see this shortly.</div>
        <button style={{ ...M.btn, marginTop: 32 }} onClick={onBack}>Back to Home</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={M.header}><BackBtn onBack={onBack} label="Home" /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>📣 Feedback</div><div style={{ color: "#555", fontSize: "0.85rem", marginTop: 4 }}>Bugs, suggestions, complaints</div></div>
      <div style={{ padding: "0 12px" }}>
        <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 10 }}>Your Name (optional)</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Leave blank to stay anonymous" style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "14px 16px", color: "white", fontSize: "0.95rem", outline: "none", marginBottom: 20, boxSizing: "border-box" }} />

        <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 10 }}>Type</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          {["Bug", "Suggestion", "Other"].map(t => (
            <button key={t} onClick={() => setType(t)} style={{ flex: 1, padding: "14px 8px", borderRadius: 12, border: "1px solid", borderColor: type === t ? "#4ade80" : "rgba(255,255,255,0.1)", background: type === t ? "rgba(74,222,128,0.1)" : "transparent", color: type === t ? "#4ade80" : "#555", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>{t}</button>
          ))}
        </div>

        <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 10 }}>Message</div>
        <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Describe the bug or suggestion..." rows={5} style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "14px 16px", color: "white", fontSize: "0.95rem", outline: "none", marginBottom: 20, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />

        <button style={{ ...M.btn, opacity: sending || !message.trim() ? 0.5 : 1 }} onClick={submit} disabled={sending || !message.trim()}>
          {sending ? "Sending..." : "Submit →"}
        </button>
      </div>
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function Home({ onMode }) {
  const [showCaddie, setShowCaddie] = useState(false);
  return (
    <div>
      {showCaddie && <CaddieChat context={{ mode: "home" }} onClose={() => setShowCaddie(false)} />}
      <div style={M.header}>
        <div style={{ fontSize: "0.65rem", color: "#444", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 8 }}>Golf Tracker</div>
        <div style={{ fontSize: "1.8rem", fontWeight: 900 }}>{APP_NAME}</div>
      </div>
      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
        <button style={{ ...M.btn, justifyContent: "space-between", padding: "20px 18px" }} onClick={() => onMode("standard")}>
          <div style={{ textAlign: "left" }}><div style={{ fontWeight: 900, fontSize: "1.05rem" }}>Standard Round</div><div style={{ fontSize: "0.78rem", opacity: 0.7, fontWeight: 400, marginTop: 2 }}>Solo or multiplayer · stroke play</div></div><span>→</span>
        </button>
        <button style={{ ...M.btn, background: "rgba(250,204,21,0.12)", color: "#facc15", border: "1px solid rgba(250,204,21,0.25)", justifyContent: "space-between", padding: "20px 18px" }} onClick={() => onMode("practice")}>
          <div style={{ textAlign: "left" }}><div style={{ fontWeight: 900, fontSize: "1.05rem" }}>Practice Mode</div><div style={{ fontSize: "0.78rem", opacity: 0.7, fontWeight: 400, marginTop: 2 }}>Multi-ball · advanced stats</div></div><span>→</span>
        </button>
        <button style={{ ...M.btn, background: "rgba(139,92,246,0.12)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.25)", justifyContent: "space-between", padding: "20px 18px" }} onClick={() => onMode("friday")}>
          <div style={{ textAlign: "left" }}><div style={{ fontWeight: 900, fontSize: "1.05rem" }}>Friday League</div><div style={{ fontSize: "0.78rem", opacity: 0.7, fontWeight: 400, marginTop: 2 }}>12 holes · 6 players · vig + birdies</div></div><span>→</span>
        </button>
        <button style={{ ...M.btn, background: "rgba(255,200,100,0.08)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.2)", justifyContent: "space-between", padding: "20px 18px" }} onClick={() => onMode("feedback")}>
          <div style={{ textAlign: "left" }}><div style={{ fontWeight: 900, fontSize: "1.05rem" }}>📣 Feedback</div><div style={{ fontSize: "0.78rem", opacity: 0.7, fontWeight: 400, marginTop: 2 }}>Report bugs · make suggestions</div></div><span>→</span>
        </button>
        <button style={{ ...M.btn, background: "rgba(255,255,255,0.04)", color: "#666", border: "1px solid rgba(255,255,255,0.08)", justifyContent: "space-between", padding: "20px 18px" }} onClick={() => onMode("admin")}>
          <div style={{ textAlign: "left" }}><div style={{ fontWeight: 900, fontSize: "1.05rem" }}>⚙️ Admin</div><div style={{ fontSize: "0.78rem", opacity: 0.7, fontWeight: 400, marginTop: 2 }}>Manage players · view feedback</div></div><span>→</span>
        </button>
        <button style={{ ...M.btn, background: "rgba(74,222,128,0.08)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)", justifyContent: "space-between", padding: "20px 18px" }} onClick={() => setShowCaddie(true)}>
          <div style={{ textAlign: "left" }}><div style={{ fontWeight: 900, fontSize: "1.05rem" }}>🎒 Ask the Caddie</div><div style={{ fontSize: "0.78rem", opacity: 0.7, fontWeight: 400, marginTop: 2 }}>AI golf assistant · stats · advice</div></div><span>→</span>
        </button>
      </div>
    </div>
  );
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
function AdminPanel({ players, onPlayersChange, onHome }) {
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [shake, setShake] = useState(false);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState([]);
  const [tab, setTab] = useState("players");

  const tryPin = () => {
    if (pin === ADMIN_PIN) {
      setUnlocked(true);
      supabase.from("feedback").select("*").order("created_at", { ascending: false }).then(({ data }) => { if (data) setFeedback(data); });
    } else { setShake(true); setPin(""); setTimeout(() => setShake(false), 500); }
  };

  if (!unlocked) return (
    <div>
      <div style={M.header}><BackBtn onBack={onHome} label="Home" /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>⚙️ Admin</div></div>
      <div style={{ padding: "0 12px", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 40 }}>
        <div style={{ color: "#555", fontSize: "0.85rem", marginBottom: 24 }}>Enter PIN to continue</div>
        <input type="password" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === "Enter" && tryPin()} maxLength={4} placeholder="••••" style={{ width: 120, textAlign: "center", fontSize: "2rem", letterSpacing: "0.3em", background: shake ? "rgba(248,113,113,0.1)" : "rgba(255,255,255,0.06)", border: `1px solid ${shake ? "#f87171" : "rgba(255,255,255,0.1)"}`, borderRadius: 14, padding: "16px", color: "white", outline: "none", marginBottom: 16, transition: "all 0.2s" }} />
        <button style={{ ...M.btn, width: 120 }} onClick={tryPin}>Enter</button>
      </div>
    </div>
  );

  const addPlayer = async () => {
    const name = newName.trim();
    if (!name) return;
    setLoading(true);
    await supabase.from("players").insert({ name, is_active: true });
    onPlayersChange(); setNewName("");
    setLoading(false);
  };

  const togglePlayer = async (player) => {
    setLoading(true);
    await supabase.from("players").update({ is_active: !player.is_active }).eq("id", player.id);
    onPlayersChange();
    setLoading(false);
  };

  const deletePlayer = async (player) => {
    if (!window.confirm(`Delete ${player.name}?`)) return;
    setLoading(true);
    await supabase.from("players").delete().eq("id", player.id);
    onPlayersChange();
    setLoading(false);
  };

  const deleteFeedback = async (id) => {
    await supabase.from("feedback").delete().eq("id", id);
    setFeedback(f => f.filter(x => x.id !== id));
  };

  return (
    <div>
      <div style={M.header}><BackBtn onBack={onHome} label="Home" /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>⚙️ Admin</div></div>
      <div style={{ padding: "0 12px" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          {["players", "feedback"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1px solid", borderColor: tab === t ? "#4ade80" : "rgba(255,255,255,0.1)", background: tab === t ? "rgba(74,222,128,0.1)" : "transparent", color: tab === t ? "#4ade80" : "#555", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", textTransform: "capitalize" }}>{t}</button>
          ))}
        </div>

        {tab === "players" && (
          <>
            <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12 }}>Add Player</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
              <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addPlayer()} placeholder="Player name..." style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "14px 16px", color: "white", fontSize: "1rem", outline: "none" }} />
              <button style={{ ...M.btn, width: "auto", padding: "14px 20px" }} onClick={addPlayer} disabled={loading}>Add</button>
            </div>
            <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12 }}>Players</div>
            {players.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: p.is_active ? "#4ade80" : "#333" }} />
                  <span style={{ fontWeight: 700, color: p.is_active ? "white" : "#444" }}>{p.name}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => togglePlayer(p)} style={{ ...M.btnSm, padding: "8px 14px", fontSize: "0.75rem", color: p.is_active ? "#fb923c" : "#4ade80" }}>{p.is_active ? "Deactivate" : "Activate"}</button>
                  <button onClick={() => deletePlayer(p)} style={{ ...M.btnSm, padding: "8px 14px", fontSize: "0.75rem", color: "#f87171", borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)" }}>Delete</button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === "feedback" && (
          <>
            <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12 }}>{feedback.length} items</div>
            {feedback.length === 0 && <div style={{ color: "#444", textAlign: "center", padding: "40px 0" }}>No feedback yet.</div>}
            {feedback.map(f => (
              <div key={f.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: "16px", marginBottom: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontWeight: 700, color: f.type === "Bug" ? "#f87171" : f.type === "Suggestion" ? "#4ade80" : "#facc15", fontSize: "0.75rem", background: "rgba(255,255,255,0.06)", padding: "4px 10px", borderRadius: 8 }}>{f.type}</span>
                    <span style={{ color: "#666", fontSize: "0.78rem" }}>{f.name}</span>
                  </div>
                  <button onClick={() => deleteFeedback(f.id)} style={{ ...M.ghost, color: "#f87171", fontSize: "0.75rem", padding: 0 }}>Delete</button>
                </div>
                <div style={{ color: "#ccc", fontSize: "0.88rem", lineHeight: 1.5 }}>{f.message}</div>
                <div style={{ color: "#444", fontSize: "0.7rem", marginTop: 8 }}>{f.time}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STANDARD MODE
// ═══════════════════════════════════════════════════════════════════════════════
function StandardApp({ players, onHome }) {
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("modeSelect");
  const [player, setPlayer] = useState(null);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [pendingDraft, setPendingDraft] = useState(null);
  const [multiConfig, setMultiConfig] = useState(null);
  const [courseChoice, setCourseChoice] = useState(null);
  const [startHole, setStartHole] = useState(1);

  const activePlayers = players.filter(p => p.is_active).map(p => p.name);
  const myRounds = player ? rounds.filter(r => r.player_name === player).sort((a, b) => new Date(b.date) - new Date(a.date)) : [];

  useEffect(() => {
    supabase.from("standard_rounds").select("*").order("date", { ascending: false }).then(({ data }) => {
      if (data) setRounds(data);
      setLoading(false);
    });
  }, []);

  const handleSelectPlayer = async (p) => {
    setPlayer(p);
    const draft = await loadDraft(`standard_${p}`);
    if (draft) { setPendingDraft(draft); }
    else setView("menu");
  };

  const handleSave = async (data) => {
    const row = {
      player_name: player,
      date: new Date().toISOString(),
      scores: data.scores,
      girs: data.girs,
      putts: data.putts,
      course: data.course || "original9",
    };
    const { data: inserted } = await supabase.from("standard_rounds").insert(row).select().single();
    if (inserted) setRounds(r => [inserted, ...r]);
    await clearDraft(`standard_${player}`);
    setPendingDraft(null);
    setView("history");
  };

  const handleMultiSave = async (playerDataMap, holeOrder, course) => {
    const inserts = Object.entries(playerDataMap).map(([pname, d]) => ({
      player_name: pname,
      date: new Date().toISOString(),
      scores: d.scores,
      girs: d.girs,
      putts: d.putts,
      course: course || "original9",
    }));
    const { data: inserted } = await supabase.from("standard_rounds").insert(inserts).select();
    if (inserted) setRounds(r => [...inserted, ...r]);
    await clearDraft("multiplayer_draft");
    setView("modeSelect");
  };

  const handleEdit = async (data) => {
    const { data: updated } = await supabase.from("standard_rounds").update({ scores: data.scores, girs: data.girs, putts: data.putts }).eq("id", editing.id).select().single();
    if (updated) { setRounds(r => r.map(x => x.id === editing.id ? updated : x)); setSelected(updated); }
    setEditing(null); setView("detail");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this round?")) return;
    await supabase.from("standard_rounds").delete().eq("id", id);
    setRounds(r => r.filter(x => x.id !== id));
    setView("history");
  };

  if (loading) return <LoadingScreen />;

  // Draft resume flow
  if (pendingDraft && view !== "menu" && view !== "history" && view !== "detail" && view !== "handicap" && view !== "log" && view !== "log_resume" && view !== "edit") {
    return (
      <DraftResumeModal
        draftDate={pendingDraft.savedAt}
        onResume={() => setView("log_resume")}
        onDiscard={async () => {
          await clearDraft(`standard_${player}`);
          setPendingDraft(null);
          setView("menu");
        }}
      />
    );
  }

  if (view === "modeSelect") return (
    <div>
      <div style={M.header}><BackBtn onBack={onHome} label="Home" /><div style={{ fontSize: "1.6rem", fontWeight: 900, marginTop: 8 }}>⛳ Standard Round</div><div style={{ color: "#555", fontSize: "0.85rem", marginTop: 4 }}>How are you playing?</div></div>
      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
        <button style={{ ...M.btn, justifyContent: "space-between", padding: "20px 18px" }} onClick={() => setView("playerSelect")}>
          <div style={{ textAlign: "left" }}><div style={{ fontWeight: 900 }}>Solo Round</div><div style={{ fontSize: "0.78rem", opacity: 0.7, fontWeight: 400, marginTop: 2 }}>Just you · stats + handicap</div></div><span>→</span>
        </button>
        <button style={{ ...M.btn, background: "rgba(250,204,21,0.12)", color: "#facc15", border: "1px solid rgba(250,204,21,0.25)", justifyContent: "space-between", padding: "20px 18px" }} onClick={() => setView("multiSetup")}>
          <div style={{ textAlign: "left" }}><div style={{ fontWeight: 900 }}>Multiplayer</div><div style={{ fontSize: "0.78rem", opacity: 0.7, fontWeight: 400, marginTop: 2 }}>Stroke play · betting · skins</div></div><span>→</span>
        </button>
      </div>
    </div>
  );

  if (view === "playerSelect") return (
    <div>
      <div style={M.header}><BackBtn onBack={() => setView("modeSelect")} /><div style={{ fontSize: "1.6rem", fontWeight: 900, marginTop: 8 }}>⛳ Solo Round</div><div style={{ color: "#555", fontSize: "0.85rem", marginTop: 4 }}>Who's playing?</div></div>
      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {activePlayers.map(p => <button key={p} onClick={() => handleSelectPlayer(p)} style={{ ...M.btn, fontSize: "1.1rem" }}>{p}</button>)}
      </div>
    </div>
  );

  if (view === "multiSetup") return (
    <MultiSetup players={activePlayers} allRounds={rounds} onStart={(config) => { setMultiConfig(config); setView("multiRound"); }} onBack={() => setView("modeSelect")} />
  );

  if (view === "multiRound" && multiConfig) return (
    <MultiStrokePlay config={multiConfig} allRounds={rounds} onComplete={handleMultiSave} onCancel={() => setView("modeSelect")} />
  );

  return (
    <div>
      {view === "menu" && (
        <div>
          <div style={M.header}>
            <BackBtn onBack={() => setView("playerSelect")} label="Players" />
            <div style={{ fontSize: "1.5rem", fontWeight: 900, marginTop: 8 }}>⛳ Standard Round</div>
            <div style={{ color: "#4ade80", fontSize: "0.85rem", marginTop: 4 }}>Playing as {player}</div>
          </div>
          <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
            <button style={M.btn} onClick={() => setView("courseSelect")}>+ Log New Round</button>
            <button style={{ ...M.btn, background: "rgba(255,255,255,0.06)", color: "white" }} onClick={() => setView("history")}>My History</button>
            <button style={{ ...M.btn, background: "rgba(74,222,128,0.09)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)" }} onClick={() => setView("handicap")}>My Stats & Handicap</button>
          </div>
          {myRounds.slice(0, 3).map(r => {
            const st = calcStats(r.scores, r.girs, r.putts, true);
            const c = st.overUnder < 0 ? "#facc15" : st.overUnder === 0 ? "#4ade80" : "#fb923c";
            return (
              <div key={r.id} onClick={() => { setSelected(r); setView("detail"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer" }}>
                <div><div style={{ fontWeight: 700 }}>{fmtDate(r.date)}</div><div style={{ color: "#555", fontSize: "0.75rem", marginTop: 2 }}>{r.course === "expanded12" ? "Expanded 12" : "Original 9"} · GIR {st.girPct}%</div></div>
                <div style={{ textAlign: "right" }}><div style={{ fontFamily: "monospace", fontWeight: 900, fontSize: "1.3rem", color: c }}>{fmtOver(st.overUnder)}</div><div style={{ color: "#555", fontSize: "0.72rem" }}>{st.totalScore} strokes</div></div>
              </div>
            );
          })}
        </div>
      )}

      {view === "courseSelect" && (
        <div>
          <div style={M.header}><BackBtn onBack={() => setView("menu")} /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>Which Course?</div></div>
          <CourseSelector onSelect={c => { setCourseChoice(c); setView("startHole"); }} />
        </div>
      )}

      {view === "startHole" && (
        <div>
          <div style={M.header}><BackBtn onBack={() => setView("courseSelect")} /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>Starting Hole</div></div>
          <div style={{ padding: "0 12px" }}>
            {courseChoice === "expanded12" ? (
              <StartingHoleSelector onSelect={h => { setStartHole(h); setView("log"); }} />
            ) : (
              <StartingHoleSelector onSelect={h => { setStartHole(h); setView("log"); }} />
            )}
          </div>
        </div>
      )}

      {view === "log" && (
        <StandardEntry draftKey={`standard_${player}`} course={courseChoice || "original9"} startHole={startHole} onComplete={handleSave} onCancel={() => setView("menu")} />
      )}
      {view === "log_resume" && pendingDraft && (
        <StandardEntry draftKey={`standard_${player}`} initialDraft={pendingDraft} course={pendingDraft.course || "original9"} startHole={pendingDraft.startHole || 1} onComplete={handleSave} onCancel={() => { clearDraft(`standard_${player}`); setPendingDraft(null); setView("menu"); }} />
      )}
      {view === "edit" && editing && <StandardEntry initial={editing} course={editing.course || "original9"} onComplete={handleEdit} onCancel={() => { setEditing(null); setView("detail"); }} />}
      {view === "history" && <StandardHistory rounds={myRounds} player={player} onSelect={r => { setSelected(r); setView("detail"); }} onBack={() => setView("menu")} />}
      {view === "detail" && selected && <StandardDetail round={selected} allRounds={myRounds} onBack={() => setView("history")} onDelete={() => handleDelete(selected.id)} onEdit={() => { setEditing(selected); setView("edit"); }} />}
      {view === "handicap" && <StandardHandicap rounds={myRounds} player={player} allRounds={myRounds} onBack={() => setView("menu")} />}
    </div>
  );
}

function StandardEntry({ draftKey, initialDraft, initial, course = "original9", startHole = 1, onComplete, onCancel }) {
  const isExpanded = course === "expanded12";
  const holeList = isExpanded ? EXPANDED_12 : null;
  const holeOrder = isExpanded ? EXPANDED_12.map(h => h.num) : getHoleOrder(startHole);
  const totalHoles = isExpanded ? 12 : 9;
  const totalPar = isExpanded ? 36 : 27;

  const blank = {
    scores: Array(totalHoles).fill(PAR),
    girs: Array(totalHoles).fill(0),
    putts: Array(totalHoles).fill(2),
    course,
    startHole,
    savedAt: new Date().toISOString(),
  };
  const startData = initialDraft || (initial ? { scores: initial.scores, girs: initial.girs, putts: initial.putts, course: initial.course || "original9", startHole: 1, savedAt: new Date().toISOString() } : blank);
  const [data, setData] = useState(startData);
  const [hole, setHole] = useState(initialDraft?.hole || 0);
  const isEditing = !!initial && !draftKey;

  const set = (field, val) => {
    setData(d => {
      const a = [...d[field]];
      a[hole] = val;
      const newData = { ...d, [field]: a };
      if (field === "scores" || field === "girs") {
        const score = field === "scores" ? val : newData.scores[hole];
        const gir = field === "girs" ? val : newData.girs[hole];
        const puttsArr = [...newData.putts];
        puttsArr[hole] = suggestPutts(score, gir);
        newData.putts = puttsArr;
      }
      return newData;
    });
  };

  useEffect(() => {
    if (!draftKey || isEditing) return;
    saveDraft(draftKey, { ...data, hole, savedAt: data.savedAt });
  }, [data, hole]);

  const currentHoleLabel = isExpanded ? EXPANDED_12[hole]?.label : holeOrder[hole];
  const isBullshit = isExpanded && EXPANDED_12[hole] && !EXPANDED_12[hole].real;

  if (hole >= totalHoles) {
    const st = calcStats(data.scores, data.girs, data.putts, true);
    return (
      <div>
        <div style={M.header}>
          <div style={{ fontSize: "1.4rem", fontWeight: 900 }}>Round Summary</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
            <div style={{ fontSize: "3rem", fontWeight: 900, fontFamily: "monospace", color: "#4ade80" }}>{fmtOver(st.overUnder)}</div>
            <div style={{ color: "#666", fontSize: "1rem" }}>{st.totalScore} / {totalPar}</div>
          </div>
        </div>
        <div style={{ padding: "0 12px" }}>
          <div style={{ overflowX: "auto", marginBottom: 16 }}>
            <table style={{ borderCollapse: "collapse", fontSize: "0.75rem", minWidth: "100%" }}>
              <thead><tr><th style={M.th}>H</th>{holeOrder.map((h, i) => <th key={i} style={{ ...M.th, fontSize: "0.6rem", color: isExpanded && !EXPANDED_12[i]?.real ? "#a78bfa" : "#444" }}>{isExpanded ? EXPANDED_12[i]?.label : h}</th>)}</tr></thead>
              <tbody>
                <tr><td style={M.td}>Score</td>{data.scores.map((s, i) => <td key={i} style={{ ...M.td, color: scoreColor(s), fontWeight: 700 }}>{s}</td>)}</tr>
                <tr><td style={M.td}>GIR</td>{data.girs.map((g, i) => <td key={i} style={{ ...M.td, color: g ? "#4ade80" : "#444" }}>{g ? "✓" : "–"}</td>)}</tr>
                <tr><td style={M.td}>Putts</td>{data.putts.map((p, i) => <td key={i} style={{ ...M.td, color: p >= 3 ? "#f87171" : p === 1 ? "#4ade80" : "#bbb" }}>{p}</td>)}</tr>
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <button style={{ ...M.btnSm, flex: 1 }} onClick={() => setHole(totalHoles - 1)}>← Edit</button>
            <button style={{ ...M.btn, flex: 2 }} onClick={() => onComplete(data)}>Save Round</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ProgressBar total={totalHoles} current={hole} color="#4ade80" />
      <div style={{ padding: "0 16px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em" }}>Hole</div>
            <div style={{ fontSize: "3rem", fontWeight: 900, fontFamily: "monospace", lineHeight: 1, color: isBullshit ? "#a78bfa" : "white" }}>{currentHoleLabel}</div>
            {isBullshit && <div style={{ color: "#a78bfa", fontSize: "0.7rem", fontWeight: 700 }}>Bullshit Hole</div>}
            <div style={{ color: "#555", fontSize: "0.8rem" }}>Par {PAR} · {hole + 1}/{totalHoles}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>Score</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button style={M.scoreBtn} onClick={() => set("scores", Math.max(1, data.scores[hole] - 1))}>−</button>
              <span style={{ fontSize: "3.5rem", fontWeight: 900, fontFamily: "monospace", minWidth: 60, textAlign: "center", lineHeight: 1, color: scoreColor(data.scores[hole]) }}>{data.scores[hole]}</span>
              <button style={M.scoreBtn} onClick={() => set("scores", Math.min(9, data.scores[hole] + 1))}>+</button>
            </div>
            <div style={{ color: scoreColor(data.scores[hole]), fontSize: "0.82rem", marginTop: 8, fontWeight: 600 }}>{scoreLabel(data.scores[hole])}</div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>Green in Regulation</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => set("girs", 1)} style={M.toggle(data.girs[hole] === 1, "#4ade80", "rgba(74,222,128,0.12)")}>Hit ✓</button>
            <button onClick={() => set("girs", 0)} style={M.toggle(data.girs[hole] === 0, "#f87171", "rgba(248,113,113,0.12)")}>Missed ✗</button>
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em" }}>Putts</div>
            <div style={{ color: "#555", fontSize: "0.65rem" }}>suggested: {suggestPutts(data.scores[hole], data.girs[hole])}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button style={M.scoreBtn} onClick={() => setData(d => { const a = [...d.putts]; a[hole] = Math.max(0, a[hole] - 1); return { ...d, putts: a }; })}>−</button>
            <span style={{ fontSize: "2.8rem", fontWeight: 900, fontFamily: "monospace", minWidth: 48, textAlign: "center", lineHeight: 1, color: data.putts[hole] >= 3 ? "#f87171" : data.putts[hole] === 1 ? "#4ade80" : "#fff" }}>{data.putts[hole]}</span>
            <button style={M.scoreBtn} onClick={() => setData(d => { const a = [...d.putts]; a[hole] = Math.min(3, a[hole] + 1); return { ...d, putts: a }; })}>+</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {hole > 0 && <button style={{ ...M.btnSm, flex: 1 }} onClick={() => setHole(h => h - 1)}>← Back</button>}
          {hole === 0 && <button style={{ ...M.btnSm, flex: 1, color: "#f87171", borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)" }} onClick={onCancel}>Cancel</button>}
          <button style={{ ...M.btn, flex: 2 }} onClick={() => setHole(h => h + 1)}>{hole < totalHoles - 1 ? "Next →" : "Finish Round"}</button>
        </div>
      </div>
    </div>
  );
}

function StandardHistory({ rounds, player, onSelect, onBack }) {
  return (
    <div>
      <div style={M.header}><BackBtn onBack={onBack} /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>{player}'s History</div></div>
      <div style={{ padding: "0 12px" }}>
        {rounds.length === 0 && <div style={{ color: "#444", textAlign: "center", padding: "60px 0" }}>No rounds yet.</div>}
        {rounds.map(r => {
          const st = calcStats(r.scores, r.girs, r.putts, true);
          const c = st.overUnder < 0 ? "#facc15" : st.overUnder === 0 ? "#4ade80" : "#fb923c";
          return (
            <div key={r.id} onClick={() => onSelect(r)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 4px", borderBottom: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: "1rem" }}>{fmtDate(r.date)}</div>
                <div style={{ color: "#555", fontSize: "0.75rem", marginTop: 3 }}>{r.course === "expanded12" ? "🟣 Expanded 12" : "⚪ Original 9"} · GIR {st.girPct}%</div>
              </div>
              <div style={{ textAlign: "right" }}><div style={{ fontFamily: "monospace", fontWeight: 900, fontSize: "1.5rem", color: c }}>{fmtOver(st.overUnder)}</div><div style={{ color: "#555", fontSize: "0.72rem" }}>{st.totalScore} strokes</div></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StandardDetail({ round, allRounds, onBack, onDelete, onEdit }) {
  const isExpanded = round.course === "expanded12";
  const st = calcStats(round.scores, round.girs, round.putts, true);
  const c = st.overUnder < 0 ? "#facc15" : st.overUnder === 0 ? "#4ade80" : st.overUnder <= 3 ? "#fb923c" : "#f87171";
  const holeLabels = isExpanded ? EXPANDED_12.map(h => h.label) : Array.from({length:9},(_,i) => `${i+1}`);
  const [synopsis, setSynopsis] = useState(round.synopsis || null);
  const [synopsisLoading, setSynopsisLoading] = useState(!round.synopsis);
  const [showCaddie, setShowCaddie] = useState(false);

  useEffect(() => {
    if (round.synopsis) { setSynopsis(round.synopsis); setSynopsisLoading(false); return; }
    const history = (allRounds || []).filter(r => r.id !== round.id && r.player_name === round.player_name).slice(0, 5);
    fetch("/api/synopsis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "standard", round: { ...round, player: round.player_name }, history }),
    })
      .then(r => r.json())
      .then(d => { setSynopsis(d.synopsis || null); setSynopsisLoading(false); })
      .catch(() => setSynopsisLoading(false));
  }, [round.id]);

  const caddieContext = { mode: "standard", player: round.player_name, standardRounds: allRounds || [] };

  return (
    <div>
      {showCaddie && <CaddieChat context={caddieContext} onClose={() => setShowCaddie(false)} />}
      <div style={M.header}>
        <BackBtn onBack={onBack} label="History" />
        <div style={{ color: "#555", fontSize: "0.75rem", marginTop: 8 }}>{fmtDate(round.date)} · {isExpanded ? "Expanded 12" : "Original 9"}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
          <div style={{ fontSize: "3.5rem", fontWeight: 900, fontFamily: "monospace", color: c, lineHeight: 1 }}>{fmtOver(st.overUnder)}</div>
          <div style={{ color: "#555", fontSize: "1rem" }}>{st.totalScore} strokes</div>
        </div>
      </div>
      <div style={{ padding: "0 12px" }}>
        {/* Synopsis */}
        <div style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ color: "#4ade80", fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 8, fontWeight: 700 }}>🎒 Caddie's Take</div>
          {synopsisLoading ? (
            <div style={{ color: "#444", fontSize: "0.82rem" }}>Reading your round…</div>
          ) : synopsis ? (
            <div style={{ color: "#ccc", fontSize: "0.85rem", lineHeight: 1.6 }}>{synopsis}</div>
          ) : (
            <div style={{ color: "#444", fontSize: "0.82rem" }}>Synopsis unavailable.</div>
          )}
        </div>

        {isExpanded && (
          <div style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: "0.75rem", color: "#a78bfa" }}>
            🟣 Purple labels = Bullshit Holes (Long 7, 8&gt;9, Short 5) — not counted in handicap
          </div>
        )}
        <div style={{ overflowX: "auto", marginBottom: 16 }}>
          <table style={{ borderCollapse: "collapse", fontSize: "0.75rem", minWidth: "100%" }}>
            <thead>
              <tr>
                <th style={M.th}>H</th>
                {holeLabels.map((h, i) => <th key={i} style={{ ...M.th, fontSize: "0.6rem", color: isExpanded && !EXPANDED_12[i]?.real ? "#a78bfa" : "#444" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr><td style={M.td}>Score</td>{round.scores.map((s, i) => <td key={i} style={{ ...M.td, color: scoreColor(s), fontWeight: 700 }}>{s}</td>)}</tr>
              <tr><td style={M.td}>GIR</td>{round.girs.map((g, i) => <td key={i} style={{ ...M.td, color: g ? "#4ade80" : "#444" }}>{g ? "✓" : "–"}</td>)}</tr>
              <tr><td style={M.td}>Putts</td>{(round.putts || []).map((p, i) => <td key={i} style={{ ...M.td, color: p >= 3 ? "#f87171" : p === 1 ? "#4ade80" : "#bbb" }}>{p}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <StatsGrid st={st} />
        <button onClick={() => setShowCaddie(true)} style={{ ...M.btn, background: "rgba(74,222,128,0.08)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)", marginBottom: 10 }}>
          🎒 Ask the Caddie
        </button>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ ...M.btnSm, flex: 1 }} onClick={onEdit}>Edit</button>
          <button style={{ ...M.btnSm, flex: 1, color: "#f87171", borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)" }} onClick={onDelete}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function StandardHandicap({ rounds, player, allRounds, onBack }) {
  const [period, setPeriod] = useState("recent");
  const [showCaddie, setShowCaddie] = useState(false);
  const caddieContext = { mode: "standard", player, standardRounds: allRounds || rounds };

  // Separate rounds by course
  const original9Rounds = rounds.filter(r => r.course !== "expanded12").sort((a,b) => new Date(b.date)-new Date(a.date));
  const expanded12Rounds = rounds.filter(r => r.course === "expanded12").sort((a,b) => new Date(b.date)-new Date(a.date));

  // For handicap: use original9 rounds + extract real holes from expanded12
  const expanded12AsReal = expanded12Rounds.map(r => {
    const { scores, girs, putts } = extractRealHoleScores(r.scores, r.girs, r.putts);
    return { ...r, scores, girs, putts, course: "original9_extracted" };
  });
  const allForHandicap = [...original9Rounds, ...expanded12AsReal].sort((a,b) => new Date(b.date)-new Date(a.date));

  const filtered = useMemo(() => filterByPeriod(allForHandicap, period), [allForHandicap, period]);
  const isRecent = period === "recent";

  const hcp = calcHandicap(filtered, r => ({ scores: r.scores, girs: r.girs, putts: r.putts, isPuttCounts: true }));
  const allSt = filtered.map(r => calcStats(r.scores, r.girs, r.putts, true));
  const avgFn = fn => allSt.length === 0 ? null : allSt.reduce((s, r) => s + fn(r), 0) / allSt.length;
  const avgOverUnder = avgFn(r => r.overUnder);

  // Hole averages for original 9
  const holeScoreAvgs = Array.from({length:9},(_,i) =>
    filtered.length ? filtered.reduce((sum, r) => sum + (r.scores[i] ?? PAR), 0) / filtered.length : null
  );
  const holeGirPcts = Array.from({length:9},(_,i) =>
    filtered.length ? Math.round(filtered.reduce((sum, r) => sum + (r.girs[i] ?? 0), 0) / filtered.length * 100) : null
  );
  const validAvgs = holeScoreAvgs.filter(v => v !== null);
  const minAvg = validAvgs.length ? Math.min(...validAvgs) : null;
  const maxAvg = validAvgs.length ? Math.max(...validAvgs) : null;
  function holeAvgColor(a) {
    if (a === null) return "#555";
    if (a === minAvg) return "#4ade80";
    if (a === maxAvg) return "#f87171";
    return "#fb923c";
  }

  // Bullshit hole averages from expanded12 rounds
  const bullshitHoles = [
    { label: "Long 7", idx: 1 },
    { label: "8>9", idx: 4 },
    { label: "Short 5", idx: 11 },
  ];
  const bullshitAvgs = bullshitHoles.map(bh => {
    if (!expanded12Rounds.length) return { ...bh, avg: null, girPct: null };
    const scores = expanded12Rounds.map(r => r.scores[bh.idx]).filter(s => s != null);
    const girs = expanded12Rounds.map(r => r.girs[bh.idx]).filter(g => g != null);
    return {
      ...bh,
      avg: scores.length ? scores.reduce((a,b) => a+b,0)/scores.length : null,
      girPct: girs.length ? Math.round(girs.filter(Boolean).length/girs.length*100) : null,
    };
  });

  return (
    <div>
      {showCaddie && <CaddieChat context={caddieContext} onClose={() => setShowCaddie(false)} />}
      <div style={M.header}><BackBtn onBack={onBack} /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>{player}'s Stats</div></div>
      <div style={{ padding: "0 12px" }}>
        <PeriodFilter period={period} onChange={setPeriod} />
        <div style={{ textAlign: "center", padding: "12px 0 24px" }}>
          <div style={{ color: "#444", fontSize: "0.65rem", letterSpacing: "0.2em", textTransform: "uppercase" }}>9-Hole Handicap</div>
          <div style={{ fontSize: "5rem", fontWeight: 900, fontFamily: "monospace", color: "#4ade80", lineHeight: 1.1 }}>{hcp ?? "—"}</div>
          {hcp === null && <div style={{ color: "#444", fontSize: "0.8rem", marginTop: 8 }}>{allForHandicap.length < 5 ? `${5 - allForHandicap.length} more round${5 - allForHandicap.length !== 1 ? "s" : ""} needed` : ""}</div>}
          <div style={{ color: "#444", fontSize: "0.75rem", marginTop: 4 }}>{filtered.length} round{filtered.length !== 1 ? "s" : ""} · best 40%</div>
        </div>

        {allSt.length > 0 && (
          <>
            <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12 }}>Stats</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 20 }}>
              <StatBox val={isRecent ? fmtOver(allSt[0].overUnder) : (avgOverUnder !== null ? fmtOverAvg(avgOverUnder) : "—")} label="Avg +/- Per Round" accent="#fff" />
              <StatBox val={`${isRecent ? allSt[0].girPct : Math.round(avgFn(r => r.girPct))}%`} label="GIR %" />
              <StatBox val={`${isRecent ? allSt[0].upAndDownPct : Math.round(avgFn(r => r.upAndDownPct))}%`} label="Scramble %" accent="#4ade80" />
              <StatBox val={`${isRecent ? allSt[0].birdieConvPct : Math.round(avgFn(r => r.birdieConvPct))}%`} label="Birdie Conv %" accent="#facc15" />
              <StatBox val={`${isRecent ? allSt[0].blowupPct : Math.round(avgFn(r => r.blowupPct))}%`} label="Blow-up %" accent="#f87171" />
              <StatBox val={isRecent ? (allSt[0].birdieBogeRatio === 999 ? "∞" : allSt[0].birdieBogeRatio.toFixed(2)) : (avgFn(r => r.birdieBogeRatio === 999 ? 0 : r.birdieBogeRatio)?.toFixed(2) ?? "—")} label="Birdie:Bogey+" />
              <StatBox val={`${isRecent ? allSt[0].consistencyPct : Math.round(avgFn(r => r.consistencyPct))}%`} label="Consistency" />
              <StatBox val={isRecent ? allSt[0].avgPutts.toFixed(2) : avgFn(r => r.avgPutts)?.toFixed(2) ?? "—"} label="Avg Putts" />
              <StatBox val={isRecent ? (allSt[0].puttsPerGIR?.toFixed(2) ?? "—") : (avgFn(r => r.puttsPerGIR ?? 0)?.toFixed(2) ?? "—")} label="Putts/GIR" />
              <StatBox val={isRecent ? (allSt[0].puttsPerNonGIR?.toFixed(2) ?? "—") : (avgFn(r => r.puttsPerNonGIR ?? 0)?.toFixed(2) ?? "—")} label="Putts/No GIR" />
              <StatBox val={isRecent ? allSt[0].maxGIRStreak : avgFn(r => r.maxGIRStreak)?.toFixed(1) ?? "—"} label="GIR Streak" />
              <StatBox val={isRecent ? allSt[0].birdies : avgFn(r => r.birdies)?.toFixed(1) ?? "—"} label={isRecent ? "Birdies" : "Avg Birdies"} accent="#facc15" />
            </div>

            <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12 }}>{isRecent ? "Scorecard (Original 9)" : "Hole Averages (Original 9)"}</div>
            <div style={{ overflowX: "auto", marginBottom: 24 }}>
              <table style={{ borderCollapse: "collapse", fontSize: "0.78rem", minWidth: "100%" }}>
                <thead><tr><th style={M.th}>H</th>{Array.from({length:9},(_,i)=><th key={i} style={M.th}>{i+1}</th>)}</tr></thead>
                <tbody>
                  {isRecent ? (
                    <>
                      <tr><td style={M.td}>Score</td>{filtered[0].scores.map((s, i) => <td key={i} style={{ ...M.td, color: recentHoleColor(s), fontWeight: 700 }}>{s}</td>)}</tr>
                      <tr><td style={M.td}>GIR</td>{filtered[0].girs.map((g, i) => <td key={i} style={{ ...M.td }}>{g ? "✅" : "–"}</td>)}</tr>
                      <tr><td style={M.td}>Putts</td>{filtered[0].putts.map((p, i) => <td key={i} style={{ ...M.td, color: p >= 3 ? "#f87171" : p === 1 ? "#4ade80" : "#bbb" }}>{p}</td>)}</tr>
                    </>
                  ) : (
                    <>
                      <tr><td style={M.td}>Avg</td>{holeScoreAvgs.map((a, i) => <td key={i} style={{ ...M.td, color: holeAvgColor(a), fontWeight: 600 }}>{a !== null ? a.toFixed(2) : "—"}</td>)}</tr>
                      <tr><td style={M.td}>GIR%</td>{holeGirPcts.map((g, i) => <td key={i} style={{ ...M.td, color: g !== null ? (g >= 50 ? "#4ade80" : g >= 25 ? "#fb923c" : "#f87171") : "#555", fontWeight: 600 }}>{g !== null ? `${g}%` : "—"}</td>)}</tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {expanded12Rounds.length > 0 && (
              <>
                <div style={{ color: "#a78bfa", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12 }}>💩 Bullshit Holes (All Time)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 20 }}>
                  {bullshitAvgs.map(bh => (
                    <div key={bh.label} style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 12, padding: "14px 8px", textAlign: "center" }}>
                      <div style={{ color: "#a78bfa", fontWeight: 800, fontSize: "0.85rem", marginBottom: 6 }}>{bh.label}</div>
                      <div style={{ fontFamily: "monospace", fontWeight: 900, fontSize: "1.3rem", color: "#fff" }}>{bh.avg !== null ? bh.avg.toFixed(2) : "—"}</div>
                      <div style={{ color: "#555", fontSize: "0.65rem", marginTop: 4 }}>GIR {bh.girPct !== null ? `${bh.girPct}%` : "—"}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {allSt.length === 0 && <div style={{ color: "#444", textAlign: "center", padding: "40px 0" }}>No rounds in this period.</div>}
        <button onClick={() => setShowCaddie(true)} style={{ ...M.btn, background: "rgba(74,222,128,0.08)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)", marginTop: 8 }}>
          🎒 Ask the Caddie
        </button>
      </div>
    </div>
  );
}

// ─── Multiplayer Setup ────────────────────────────────────────────────────────
function MultiSetup({ players, allRounds, onStart, onBack }) {
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [matchAmt, setMatchAmt] = useState(0);
  const [skinAmt, setSkinAmt] = useState(0);
  const [birdieAmt, setBirdieAmt] = useState(0);
  const [ctpAmt, setCtpAmt] = useState(0);
  const [useHandicap, setUseHandicap] = useState(false);
  const [step, setStep] = useState("players");
  const [course, setCourse] = useState(null);
  const [startHole, setStartHole] = useState(1);

  const togglePlayer = p => setSelectedPlayers(s => s.includes(p) ? s.filter(x => x !== p) : [...s, p]);

  const playerHcps = Object.fromEntries(selectedPlayers.map(p => {
    const pRounds = allRounds.filter(r => r.player_name === p);
    const hcp = calcHandicap(pRounds, r => ({ scores: r.scores, girs: r.girs, putts: r.putts, isPuttCounts: true }));
    return [p, hcp];
  }));
  const anyHasHandicap = Object.values(playerHcps).some(h => h !== null);

  const ctpHole = useMemo(() => {
    const hOrder = course === "expanded12" ? EXPANDED_12.map(h => h.num) : getHoleOrder(startHole);
    return hOrder[Math.floor(Math.random() * hOrder.length)];
  }, [ctpAmt, course, startHole]);

  const totalHoles = course === "expanded12" ? 12 : 9;

  if (step === "players") return (
    <div>
      <div style={M.header}><BackBtn onBack={onBack} /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>Who's Playing?</div></div>
      <div style={{ padding: "0 12px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {players.map(p => (
            <button key={p} onClick={() => togglePlayer(p)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 16px", borderRadius: 14, border: "1px solid", borderColor: selectedPlayers.includes(p) ? "#facc15" : "rgba(255,255,255,0.1)", background: selectedPlayers.includes(p) ? "rgba(250,204,21,0.12)" : "rgba(255,255,255,0.03)", color: selectedPlayers.includes(p) ? "#facc15" : "#666", fontWeight: 700, fontSize: "1rem", cursor: "pointer", minHeight: 56, WebkitTapHighlightColor: "transparent" }}>
              {p} {selectedPlayers.includes(p) && <span>✓</span>}
            </button>
          ))}
        </div>
        <button style={{ ...M.btn, background: "#facc15", color: "#000" }} onClick={() => selectedPlayers.length >= 2 && setStep("course")} disabled={selectedPlayers.length < 2}>
          Next → {selectedPlayers.length >= 2 ? `(${selectedPlayers.length} players)` : "(select 2+)"}
        </button>
      </div>
    </div>
  );

  if (step === "course") return (
    <div>
      <div style={M.header}><BackBtn onBack={() => setStep("players")} /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>Which Course?</div></div>
      <CourseSelector onSelect={c => { setCourse(c); setStep("bets"); }} />
    </div>
  );

  if (step === "bets") return (
    <div>
      <div style={M.header}><BackBtn onBack={() => setStep("course")} /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>Game Setup</div><div style={{ color: "#555", fontSize: "0.82rem", marginTop: 4 }}>{selectedPlayers.join(", ")} · {course === "expanded12" ? "Expanded 12" : "Original 9"}</div></div>
      <div style={{ padding: "0 12px" }}>
        <MoneyStepper label="Match Wager" value={matchAmt} onChange={setMatchAmt} increment={5} color="#facc15" />
        <MoneyStepper label="Skins (per hole)" value={skinAmt} onChange={setSkinAmt} increment={1} color="#4ade80" />
        <MoneyStepper label="Birdies (per birdie)" value={birdieAmt} onChange={setBirdieAmt} increment={1} color="#fb923c" />
        <MoneyStepper label="Closest to Pin" value={ctpAmt} onChange={setCtpAmt} increment={5} color="#a78bfa" />
        {ctpAmt > 0 && (
          <div style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.25)", borderRadius: 12, padding: "12px 16px", marginTop: 8, marginBottom: 8 }}>
            <div style={{ color: "#a78bfa", fontWeight: 700, fontSize: "0.85rem" }}>📍 Closest to Pin: Hole {typeof ctpHole === "string" ? EXPANDED_12.find(h => h.num === ctpHole)?.label : ctpHole}</div>
            <div style={{ color: "#555", fontSize: "0.75rem", marginTop: 4 }}>Pushes to next hole if no GIR winner</div>
          </div>
        )}
        {anyHasHandicap ? (
          <div style={{ padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ fontWeight: 700 }}>Use Handicaps</div><div style={{ color: "#555", fontSize: "0.72rem", marginTop: 2 }}>Net scoring on hardest holes</div></div>
              <button onClick={() => setUseHandicap(h => !h)} style={{ ...M.toggle(useHandicap, "#4ade80", "rgba(74,222,128,0.12)"), flex: "none", width: 80 }}>{useHandicap ? "On ✓" : "Off"}</button>
            </div>
            {useHandicap && selectedPlayers.map(p => (
              <div key={p} style={{ fontSize: "0.75rem", color: "#555", marginTop: 6 }}>
                {p}: {playerHcps[p] !== null ? `Hcp ${playerHcps[p]}` : "No handicap (scratch)"}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ color: "#444", fontSize: "0.82rem" }}>Handicaps available after 5 rounds each</div>
          </div>
        )}
        <div style={{ marginTop: 20 }}>
          <button style={{ ...M.btn, background: "#facc15", color: "#000" }} onClick={() => setStep("starthole")}>Next → Starting Hole</button>
        </div>
      </div>
    </div>
  );

  if (step === "starthole") return (
    <div>
      <div style={M.header}><BackBtn onBack={() => setStep("bets")} /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>Starting Hole</div></div>
      <div style={{ padding: "0 12px" }}>
        <StartingHoleSelector onSelect={h => {
          setStartHole(h);
          onStart({
            players: selectedPlayers, matchAmt, skinAmt, birdieAmt, ctpAmt,
            ctpHole: ctpAmt > 0 ? ctpHole : null,
            useHandicap, playerHcps, course,
            startHole: h,
            holeOrder: getHoleOrder(h, course),
            totalHoles,
          });
        }} />
      </div>
    </div>
  );
}

// ─── Multiplayer Stroke Play ───────────────────────────────────────────────────
function MultiStrokePlay({ config, allRounds, onComplete, onCancel }) {
  const { players, matchAmt, skinAmt, birdieAmt, ctpAmt, useHandicap, playerHcps, course, startHole, holeOrder, totalHoles } = config;
  const isExpanded = course === "expanded12";
  const blank = () => ({ scores: Array(totalHoles).fill(PAR), girs: Array(totalHoles).fill(0), putts: Array(totalHoles).fill(2) });
  const [playerData, setPlayerData] = useState(() => Object.fromEntries(players.map(p => [p, blank()])));
  const [holeIdx, setHoleIdx] = useState(0);
  const [ctpWinner, setCtpWinner] = useState(null);
  const [ctpCurrentHole, setCtpCurrentHole] = useState(config.ctpHole);
  const [showSettlement, setShowSettlement] = useState(false);

  useEffect(() => {
    saveDraft("multiplayer_draft", { playerData, holeIdx, config, savedAt: new Date().toISOString() });
  }, [playerData, holeIdx]);

  const currentHole = holeOrder[holeIdx];
  const currentHoleLabel = isExpanded ? EXPANDED_12[holeIdx]?.label : currentHole;
  const isBullshit = isExpanded && EXPANDED_12[holeIdx] && !EXPANDED_12[holeIdx].real;
  const isCtpHole = currentHole === ctpCurrentHole && ctpAmt > 0;

  const setVal = (player, field, val) => {
    setPlayerData(d => {
      const updated = { ...d[player], [field]: [...d[player][field]] };
      updated[field][holeIdx] = val;
      if (field === "scores" || field === "girs") {
        const s = field === "scores" ? val : updated.scores[holeIdx];
        const g = field === "girs" ? val : updated.girs[holeIdx];
        updated.putts[holeIdx] = suggestPutts(s, g);
      }
      return { ...d, [player]: updated };
    });
  };

  const strokeHoles = useMemo(() => {
    if (!useHandicap) return {};
    return Object.fromEntries(players.map(p => {
      const hcp = playerHcps[p];
      if (!hcp) return [p, []];
      const pRounds = allRounds.filter(r => r.player_name === p);
      return [p, getHardestHoles(pRounds, p, Math.round(hcp))];
    }));
  }, [useHandicap, players, playerHcps, allRounds]);

  const leaderboard = useMemo(() => {
    return players.map(p => {
      const played = holeIdx + 1;
      const gross = playerData[p].scores.slice(0, played).reduce((a, b) => a + b, 0);
      const grossOver = gross - PAR * played;
      let netOver = grossOver;
      if (useHandicap) {
        const netScores = calcNetScore(playerData[p].scores.slice(0, played), holeOrder.slice(0, played), strokeHoles[p] || []);
        netOver = netScores.reduce((a, b) => a + b, 0) - PAR * played;
      }
      return { name: p, grossOver, netOver };
    }).sort((a, b) => (useHandicap ? a.netOver : a.grossOver) - (useHandicap ? b.netOver : b.grossOver));
  }, [playerData, holeIdx, useHandicap, strokeHoles]);

  const skinsData = useMemo(() => {
    if (!skinAmt) return { skins: [], carryover: 0 };
    const playerScores = Object.fromEntries(players.map(p => [p, playerData[p].scores.slice(0, holeIdx + 1)]));
    return calcSkins(playerScores, holeOrder.slice(0, holeIdx + 1), skinAmt);
  }, [playerData, holeIdx, skinAmt]);

  const checkCTP = () => {
    if (!isCtpHole) return;
    const girPlayers = players.filter(p => playerData[p].girs[holeIdx] === 1);
    if (girPlayers.length === 0) {
      const currentIdx = holeOrder.indexOf(ctpCurrentHole);
      if (currentIdx + 1 < totalHoles) setCtpCurrentHole(holeOrder[currentIdx + 1]);
    }
  };

  const handleNext = () => { checkCTP(); if (holeIdx < totalHoles - 1) setHoleIdx(h => h + 1); else setShowSettlement(true); };

  if (showSettlement) {
    const grossTotals = Object.fromEntries(players.map(p => [p, playerData[p].scores.reduce((a, b) => a + b, 0)]));
    const netTotals = useHandicap ? Object.fromEntries(players.map(p => {
      const netScores = calcNetScore(playerData[p].scores, holeOrder, strokeHoles[p] || []);
      return [p, netScores.reduce((a, b) => a + b, 0)];
    })) : grossTotals;
    const sorted = [...players].sort((a, b) => netTotals[a] - netTotals[b]);
    const minNet = Math.min(...Object.values(netTotals));
    const maxNet = Math.max(...Object.values(netTotals));
    const { skins: finalSkins, carryover } = calcSkins(Object.fromEntries(players.map(p => [p, playerData[p].scores])), holeOrder, skinAmt || 1);
    const birdieSettlement = birdieAmt > 0 ? calcBirdieSettlement(Object.fromEntries(players.map(p => [p, playerData[p].scores])), holeOrder, birdieAmt) : null;
    const matchSettlement = Object.fromEntries(players.map(p => [p, 0]));
    if (matchAmt > 0) {
      const winners = players.filter(p => netTotals[p] === minNet);
      const losers = players.filter(p => netTotals[p] === maxNet);
      winners.forEach(w => { matchSettlement[w] += matchAmt * losers.length / winners.length; });
      losers.forEach(l => { matchSettlement[l] -= matchAmt; });
    }
    const skinsSettlement = Object.fromEntries(players.map(p => [p, 0]));
    if (skinAmt > 0) {
      finalSkins.forEach(s => { skinsSettlement[s.winner] += s.value; });
      players.forEach(p => { skinsSettlement[p] -= skinAmt * totalHoles; });
    }
    const totalSettlement = Object.fromEntries(players.map(p => [p,
      (matchSettlement[p] || 0) + (skinsSettlement[p] || 0) + (birdieSettlement ? birdieSettlement[p] : 0)
    ]));

    if (skinAmt > 0 && carryover > 0 && !ctpWinner) {
      return <SuddenDeath players={players} carryover={carryover} onWinner={(w) => { skinsSettlement[w] += carryover; setCtpWinner(w); setShowSettlement(true); }} />;
    }

    return (
      <div>
        <div style={M.header}>
          <div style={{ fontSize: "1.4rem", fontWeight: 900 }}>Round Complete 🏁</div>
          <div style={{ background: "rgba(250,204,21,0.12)", border: "1px solid rgba(250,204,21,0.25)", borderRadius: 14, padding: "16px", marginTop: 16, textAlign: "center" }}>
            <div style={{ color: "#666", fontSize: "0.65rem", textTransform: "uppercase" }}>Winner</div>
            <div style={{ fontSize: "2rem", fontWeight: 900, color: "#facc15", marginTop: 4 }}>{players.filter(p => netTotals[p] === minNet).join(" & ")} 🏆</div>
            <div style={{ color: "#555", fontSize: "0.82rem" }}>{fmtOver(minNet - PAR * totalHoles)}{useHandicap ? " (net)" : ""}</div>
          </div>
        </div>
        <div style={{ padding: "0 12px" }}>
          <div style={{ overflowX: "auto", marginBottom: 20 }}>
            <table style={{ borderCollapse: "collapse", fontSize: "0.72rem", minWidth: "100%" }}>
              <thead>
                <tr>
                  <th style={M.th}>Player</th>
                  {holeOrder.map((h, i) => <th key={i} style={{ ...M.th, fontSize: "0.58rem", color: isExpanded && !EXPANDED_12[i]?.real ? "#a78bfa" : "#444" }}>{isExpanded ? EXPANDED_12[i]?.label : h}</th>)}
                  <th style={M.th}>Gross</th>
                  {useHandicap && <th style={M.th}>Net</th>}
                </tr>
              </thead>
              <tbody>
                {players.map(p => (
                  <tr key={p}>
                    <td style={{ ...M.td, fontWeight: 700, color: "#ccc" }}>{p}</td>
                    {playerData[p].scores.map((s, i) => {
                      const hole = isExpanded ? EXPANDED_12[i]?.num : holeOrder[i];
                      const hasStroke = useHandicap && !isExpanded && (strokeHoles[p] || []).includes(hole);
                      return <td key={i} style={{ ...M.td, color: scoreColor(s), fontWeight: 600, padding: "6px 2px" }}>{s}{hasStroke ? "•" : ""}</td>;
                    })}
                    <td style={{ ...M.td, fontWeight: 900, color: grossTotals[p] - PAR * totalHoles > 0 ? "#fb923c" : "#4ade80" }}>{fmtOver(grossTotals[p] - PAR * totalHoles)}</td>
                    {useHandicap && <td style={{ ...M.td, fontWeight: 900, color: netTotals[p] - PAR * totalHoles > 0 ? "#fb923c" : "#4ade80" }}>{fmtOver(netTotals[p] - PAR * totalHoles)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {skinAmt > 0 && finalSkins.length > 0 && (
            <>
              <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12 }}>🎰 Skins</div>
              {finalSkins.map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ color: "#888" }}>Hole {isExpanded ? EXPANDED_12.find(h => h.num === s.hole)?.label : s.hole}</span>
                  <span style={{ fontWeight: 700, color: "#4ade80" }}>{s.winner} +${s.value}</span>
                </div>
              ))}
            </>
          )}

          {ctpAmt > 0 && (
            <>
              <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", margin: "16px 0 12px" }}>📍 Closest to Pin</div>
              {ctpWinner && ctpWinner !== "push" ? (
                <div style={{ color: "#a78bfa", fontWeight: 700, padding: "10px 0" }}>🏆 {ctpWinner} wins ${ctpAmt}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ color: "#555", fontSize: "0.82rem" }}>Select winner:</div>
                  {players.map(p => <button key={p} onClick={() => setCtpWinner(p)} style={{ ...M.btnSm, color: "#a78bfa", borderColor: "rgba(167,139,250,0.3)", background: "rgba(167,139,250,0.08)" }}>{p}</button>)}
                  <button onClick={() => setCtpWinner("push")} style={{ ...M.btnSm, color: "#555" }}>Push (no winner)</button>
                </div>
              )}
            </>
          )}

          <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", margin: "16px 0 12px" }}>💸 Settlement</div>
          {players.map(p => {
            const ctpAdj = ctpWinner === p ? ctpAmt : (ctpWinner && ctpWinner !== "push") ? -(ctpAmt / (players.length - 1)) : 0;
            const total = totalSettlement[p] + ctpAdj;
            return (
              <div key={p} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ fontWeight: 700 }}>{p}</span>
                <span style={{ fontFamily: "monospace", fontWeight: 800, color: total >= 0 ? "#4ade80" : "#f87171", fontSize: "1.1rem" }}>{total >= 0 ? `+$${Math.round(total)}` : `-$${Math.abs(Math.round(total))}`}</span>
              </div>
            );
          })}

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button style={{ ...M.btnSm, flex: 1 }} onClick={() => setShowSettlement(false)}>← Edit</button>
            <button style={{ ...M.btn, flex: 2, background: "#facc15", color: "#000" }} onClick={() => onComplete(playerData, holeOrder, course)}>Save Round</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ProgressBar total={totalHoles} current={holeIdx} color="#facc15" />
      <div style={{ padding: "0 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em" }}>Hole</div>
            <div style={{ fontSize: "2.8rem", fontWeight: 900, fontFamily: "monospace", color: isBullshit ? "#a78bfa" : "#facc15", lineHeight: 1 }}>{currentHoleLabel}</div>
            {isBullshit && <div style={{ color: "#a78bfa", fontSize: "0.65rem", fontWeight: 700 }}>Bullshit Hole</div>}
            <div style={{ color: "#555", fontSize: "0.78rem" }}>Par {PAR} · {holeIdx + 1}/{totalHoles}</div>
            {isCtpHole && <div style={{ color: "#a78bfa", fontSize: "0.72rem", fontWeight: 700, marginTop: 2 }}>📍 CTP Hole</div>}
            {skinAmt > 0 && skinsData.carryover > 0 && <div style={{ color: "#4ade80", fontSize: "0.72rem", fontWeight: 700, marginTop: 2 }}>💰 Skin: ${skinsData.carryover + skinAmt}</div>}
          </div>
          <div style={{ background: "rgba(250,204,21,0.08)", borderRadius: 12, padding: "10px 12px", border: "1px solid rgba(250,204,21,0.15)", minWidth: 148 }}>
            <div style={{ color: "#555", fontSize: "0.58rem", textTransform: "uppercase", marginBottom: 6 }}>Leaderboard</div>
            {leaderboard.map((p, i) => (
              <div key={p.name} style={{ fontSize: "0.78rem", color: i === 0 ? "#facc15" : "#555", fontWeight: i === 0 ? 800 : 400, marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                {i === 0 ? "🏆" : `${i + 1}.`} {p.name}
                <span style={{ fontFamily: "monospace", marginLeft: "auto" }}>{fmtOver(useHandicap ? p.netOver : p.grossOver)}</span>
              </div>
            ))}
          </div>
        </div>

        {players.map(p => {
          const hasStroke = useHandicap && !isExpanded && (strokeHoles[p] || []).includes(currentHole);
          return (
            <div key={p} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: "14px", marginBottom: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: "1rem" }}>{p}</div>
                  {hasStroke && <div style={{ color: "#4ade80", fontSize: "0.65rem", marginTop: 2 }}>• Stroke hole</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <button style={M.scoreBtn} onClick={() => setVal(p, "scores", Math.max(1, playerData[p].scores[holeIdx] - 1))}>−</button>
                  <span style={{ color: scoreColor(playerData[p].scores[holeIdx]), fontFamily: "monospace", fontWeight: 900, fontSize: "2rem", minWidth: 36, textAlign: "center" }}>{playerData[p].scores[holeIdx]}</span>
                  <button style={M.scoreBtn} onClick={() => setVal(p, "scores", Math.min(9, playerData[p].scores[holeIdx] + 1))}>+</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setVal(p, "girs", playerData[p].girs[holeIdx] === 1 ? 0 : 1)} style={M.toggle(playerData[p].girs[holeIdx] === 1, "#4ade80", "rgba(74,222,128,0.1)")}>
                  {playerData[p].girs[holeIdx] ? "GIR ✓" : "GIR ✗"}
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end" }}>
                  <button style={{ ...M.scoreBtn, width: 36, height: 36, minWidth: 36, fontSize: "1rem" }} onClick={() => setVal(p, "putts", Math.max(0, playerData[p].putts[holeIdx] - 1))}>−</button>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, minWidth: 20, textAlign: "center", color: playerData[p].putts[holeIdx] >= 3 ? "#f87171" : "#bbb" }}>{playerData[p].putts[holeIdx]}p</span>
                  <button style={{ ...M.scoreBtn, width: 36, height: 36, minWidth: 36, fontSize: "1rem" }} onClick={() => setVal(p, "putts", Math.min(3, playerData[p].putts[holeIdx] + 1))}>+</button>
                </div>
              </div>
            </div>
          );
        })}

        <div style={{ display: "flex", gap: 10, paddingBottom: 24 }}>
          {holeIdx > 0 && <button style={{ ...M.btnSm, flex: 1 }} onClick={() => setHoleIdx(h => h - 1)}>← Back</button>}
          {holeIdx === 0 && <button style={{ ...M.btnSm, flex: 1, color: "#f87171", borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)" }} onClick={onCancel}>Cancel</button>}
          <button style={{ ...M.btn, flex: 2, background: "#facc15", color: "#000" }} onClick={handleNext}>{holeIdx < totalHoles - 1 ? "Next →" : "Finish"}</button>
        </div>
      </div>
    </div>
  );
}

function SuddenDeath({ players, carryover, onWinner }) {
  const [scores, setScores] = useState(Object.fromEntries(players.map(p => [p, PAR])));
  const [round, setRound] = useState(1);
  const playHole = () => {
    const minScore = Math.min(...Object.values(scores));
    const winners = players.filter(p => scores[p] === minScore);
    if (winners.length === 1) { onWinner(winners[0]); }
    else { setRound(r => r + 1); setScores(Object.fromEntries(players.map(p => [p, PAR]))); }
  };
  return (
    <div>
      <div style={M.header}>
        <div style={{ fontSize: "1.4rem", fontWeight: 900 }}>⚡ Sudden Death</div>
        <div style={{ color: "#4ade80", fontWeight: 700, fontSize: "1.1rem", marginTop: 4 }}>Hole 1 · Round {round}</div>
        <div style={{ color: "#555", fontSize: "0.82rem", marginTop: 4 }}>Pot: ${carryover} · Win this hole to take it</div>
      </div>
      <div style={{ padding: "0 12px" }}>
        {players.map(p => (
          <div key={p} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: "14px", marginBottom: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontWeight: 800, fontSize: "1rem" }}>{p}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button style={M.scoreBtn} onClick={() => setScores(s => ({ ...s, [p]: Math.max(1, s[p] - 1) }))}>−</button>
              <span style={{ color: scoreColor(scores[p]), fontFamily: "monospace", fontWeight: 900, fontSize: "2rem", minWidth: 36, textAlign: "center" }}>{scores[p]}</span>
              <button style={M.scoreBtn} onClick={() => setScores(s => ({ ...s, [p]: Math.min(9, s[p] + 1) }))}>+</button>
            </div>
          </div>
        ))}
        <button style={{ ...M.btn, background: "#4ade80", color: "#000" }} onClick={playHole}>Decide Winner →</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRACTICE MODE
// ═══════════════════════════════════════════════════════════════════════════════
function PracticeApp({ players, onHome }) {
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("playerSelect");
  const [player, setPlayer] = useState(null);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [pendingDraft, setPendingDraft] = useState(null);
  const [practiceConfig, setPracticeConfig] = useState({ course: "original9", startHole: 1, ballsPerHole: 5 });

  const activePlayers = players.filter(p => p.is_active).map(p => p.name);
  const myRounds = player ? rounds.filter(r => r.player_name === player).sort((a, b) => new Date(b.date) - new Date(a.date)) : [];

  useEffect(() => {
    supabase.from("practice_rounds").select("*").order("date", { ascending: false }).then(({ data }) => {
      if (data) setRounds(data);
      setLoading(false);
    });
  }, []);

  const handleSelectPlayer = async (p) => {
    setPlayer(p);
    const draft = await loadDraft(`practice_${p}`);
    if (draft) setPendingDraft(draft);
    else setView("menu");
  };

  const handleSave = async (data) => {
    const row = { player_name: player, date: new Date().toISOString(), ball_data: data.ballData, course: data.course || "original9", balls_per_hole: data.ballsPerHole || 5 };
    const { data: inserted } = await supabase.from("practice_rounds").insert(row).select().single();
    if (inserted) setRounds(r => [inserted, ...r]);
    await clearDraft(`practice_${player}`);
    setPendingDraft(null);
    setView("history");
  };

  const handleEdit = async (data) => {
    const { data: updated } = await supabase.from("practice_rounds").update({ ball_data: data.ballData }).eq("id", editing.id).select().single();
    if (updated) { setRounds(r => r.map(x => x.id === editing.id ? updated : x)); setSelected(updated); }
    setEditing(null); setView("detail");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete?")) return;
    await supabase.from("practice_rounds").delete().eq("id", id);
    setRounds(r => r.filter(x => x.id !== id));
    setView("history");
  };

  if (loading) return <LoadingScreen />;

  if (pendingDraft) return (
    <DraftResumeModal
      draftDate={pendingDraft.savedAt}
      onResume={() => setView("log_resume")}
      onDiscard={async () => { await clearDraft(`practice_${player}`); setPendingDraft(null); setView("menu"); }}
    />
  );

  if (view === "playerSelect") return (
    <div>
      <div style={M.header}><BackBtn onBack={onHome} label="Home" /><div style={{ fontSize: "1.6rem", fontWeight: 900, marginTop: 8 }}>🏌️ Practice Mode</div><div style={{ color: "#555", fontSize: "0.85rem", marginTop: 4 }}>Who's practicing?</div></div>
      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {activePlayers.map(p => <button key={p} onClick={() => handleSelectPlayer(p)} style={{ ...M.btn, background: "rgba(250,204,21,0.15)", color: "#facc15", border: "1px solid rgba(250,204,21,0.3)", fontSize: "1.1rem" }}>{p}</button>)}
      </div>
    </div>
  );

  return (
    <div>
      {view === "menu" && (
        <div>
          <div style={M.header}>
            <BackBtn onBack={() => setView("playerSelect")} label="Players" />
            <div style={{ fontSize: "1.5rem", fontWeight: 900, marginTop: 8 }}>🏌️ Practice Mode</div>
            <div style={{ color: "#facc15", fontSize: "0.85rem", marginTop: 4 }}>Practicing as {player}</div>
          </div>
          <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
            <button style={{ ...M.btn, background: "rgba(250,204,21,0.15)", color: "#facc15", border: "1px solid rgba(250,204,21,0.3)" }} onClick={() => setView("practiceSetup")}>+ Log Practice Round</button>
            <button style={{ ...M.btn, background: "rgba(255,255,255,0.06)", color: "white" }} onClick={() => setView("history")}>My History</button>
            <button style={{ ...M.btn, background: "rgba(74,222,128,0.09)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)" }} onClick={() => setView("stats")}>Practice Stats</button>
          </div>
        </div>
      )}

      {view === "practiceSetup" && (
        <PracticeSetup
          onStart={config => { setPracticeConfig(config); setView("log"); }}
          onBack={() => setView("menu")}
        />
      )}

      {view === "log" && <PracticeEntry draftKey={`practice_${player}`} config={practiceConfig} onComplete={handleSave} onCancel={() => setView("menu")} />}
      {view === "log_resume" && pendingDraft && (
        <PracticeEntry draftKey={`practice_${player}`} config={pendingDraft.config || practiceConfig} initialDraft={pendingDraft} onComplete={handleSave} onCancel={() => { clearDraft(`practice_${player}`); setPendingDraft(null); setView("menu"); }} />
      )}
      {view === "edit" && editing && <PracticeEntry config={{ course: editing.course || "original9", startHole: 1, ballsPerHole: editing.balls_per_hole || 5 }} initial={editing} onComplete={handleEdit} onCancel={() => { setEditing(null); setView("detail"); }} />}
      {view === "history" && (
        <div>
          <div style={M.header}><BackBtn onBack={() => setView("menu")} /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>{player}'s Practice</div></div>
          <div style={{ padding: "0 12px" }}>
            {myRounds.length === 0 && <div style={{ color: "#444", textAlign: "center", padding: "60px 0" }}>No sessions yet.</div>}
            {myRounds.map(r => {
              const bph = r.balls_per_hole || 5;
              const all = r.ball_data.map(h => h.scores).flat();
              const avg = (all.reduce((a, b) => a + b, 0) / all.length).toFixed(2);
              return <div key={r.id} onClick={() => { setSelected(r); setView("detail"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 4px", borderBottom: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
                <div><div style={{ fontWeight: 700, fontSize: "1rem" }}>{fmtDate(r.date)}</div><div style={{ color: "#555", fontSize: "0.75rem", marginTop: 3 }}>{r.course === "expanded12" ? "Expanded 12" : "Original 9"} · {bph} balls · avg {avg}</div></div>
                <div style={{ color: "#facc15", fontSize: "1.2rem" }}>→</div>
              </div>;
            })}
          </div>
        </div>
      )}
      {view === "detail" && selected && <PracticeDetail round={selected} allRounds={myRounds} onBack={() => setView("history")} onDelete={() => handleDelete(selected.id)} onEdit={() => { setEditing(selected); setView("edit"); }} />}
      {view === "stats" && <PracticeStats rounds={myRounds} player={player} onBack={() => setView("menu")} />}
    </div>
  );
}

function PracticeSetup({ onStart, onBack }) {
  const [ballsPerHole, setBallsPerHole] = useState(5);
  const [course, setCourse] = useState(null);
  const [startHole, setStartHole] = useState(null);
  const [step, setStep] = useState("balls");

  if (step === "balls") return (
    <div>
      <div style={M.header}><BackBtn onBack={onBack} /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>Practice Setup</div></div>
      <div style={{ padding: "0 12px" }}>
        <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 20 }}>Balls per hole</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 40 }}>
          <button style={M.scoreBtn} onClick={() => setBallsPerHole(b => Math.max(1, b - 1))}>−</button>
          <span style={{ fontSize: "4rem", fontWeight: 900, fontFamily: "monospace", color: "#facc15", minWidth: 80, textAlign: "center" }}>{ballsPerHole}</span>
          <button style={M.scoreBtn} onClick={() => setBallsPerHole(b => Math.min(10, b + 1))}>+</button>
        </div>
        <button style={{ ...M.btn, background: "#facc15", color: "#000" }} onClick={() => setStep("course")}>Next → Course</button>
      </div>
    </div>
  );

  if (step === "course") return (
    <div>
      <div style={M.header}><BackBtn onBack={() => setStep("balls")} /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>Which Course?</div></div>
      <CourseSelector onSelect={c => { setCourse(c); setStep("starthole"); }} />
    </div>
  );

  if (step === "starthole") return (
    <div>
      <div style={M.header}><BackBtn onBack={() => setStep("course")} /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>Starting Hole</div></div>
      <div style={{ padding: "0 12px" }}>
        <StartingHoleSelector onSelect={h => onStart({ ballsPerHole, course, startHole: h })} />
      </div>
    </div>
  );
}

function PracticeEntry({ draftKey, config, initialDraft, initial, onComplete, onCancel }) {
  const { ballsPerHole = 5, course = "original9", startHole = 1 } = config || {};
  const isExpanded = course === "expanded12";
  const totalHoles = isExpanded ? 12 : 9;
  const holeOrder = isExpanded ? EXPANDED_12.map(h => h.num) : getHoleOrder(startHole);
  const blankHole = () => ({ scores: Array(ballsPerHole).fill(PAR), girs: Array(ballsPerHole).fill(0), threePutts: Array(ballsPerHole).fill(false) });
  const [ballData, setBallData] = useState(initialDraft?.ballData || initial?.ball_data || Array(totalHoles).fill(null).map(blankHole));
  const [hole, setHole] = useState(initialDraft?.hole || 0);
  const isEditing = !!initial && !draftKey;

  const setVal = (field, ball, val) => setBallData(d => {
    const nd = d.map(h => ({ ...h, scores: [...h.scores], girs: [...h.girs], threePutts: [...(h.threePutts || Array(ballsPerHole).fill(false))] }));
    nd[hole][field][ball] = val;
    return nd;
  });

  useEffect(() => {
    if (!draftKey || isEditing) return;
    saveDraft(draftKey, { ballData, hole, config, savedAt: new Date().toISOString() });
  }, [ballData, hole]);

  const currentHoleLabel = isExpanded ? EXPANDED_12[hole]?.label : holeOrder[hole];
  const isBullshit = isExpanded && EXPANDED_12[hole] && !EXPANDED_12[hole].real;

  if (hole >= totalHoles) {
    return (
      <div>
        <div style={M.header}><div style={{ fontSize: "1.4rem", fontWeight: 900 }}>Practice Summary</div></div>
        <div style={{ padding: "0 12px" }}>
          {ballData.map((h, i) => {
            const avg = (h.scores.reduce((a, b) => a + b, 0) / ballsPerHole).toFixed(2);
            const label = isExpanded ? EXPANDED_12[i]?.label : holeOrder[i];
            return <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 4px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ color: isExpanded && !EXPANDED_12[i]?.real ? "#a78bfa" : "#888" }}>Hole {label}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {h.scores.map((s, j) => <span key={j} style={{ color: scoreColor(s), fontFamily: "monospace", fontWeight: 700 }}>{s}</span>)}
                <span style={{ color: "#444", fontSize: "0.8rem", marginLeft: 6 }}>avg {avg}</span>
              </div>
            </div>;
          })}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button style={{ ...M.btnSm, flex: 1 }} onClick={() => setHole(totalHoles - 1)}>← Edit</button>
            <button style={{ ...M.btn, flex: 2, background: "#facc15", color: "#000" }} onClick={() => onComplete({ ballData, course, ballsPerHole })}>Save</button>
          </div>
        </div>
      </div>
    );
  }

  const h = ballData[hole];
  return (
    <div>
      <ProgressBar total={totalHoles} current={hole} color="#facc15" />
      <div style={{ padding: "0 16px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em" }}>Hole</div>
            <div style={{ fontSize: "3rem", fontWeight: 900, fontFamily: "monospace", lineHeight: 1, color: isBullshit ? "#a78bfa" : "white" }}>{currentHoleLabel}</div>
            {isBullshit && <div style={{ color: "#a78bfa", fontSize: "0.7rem", fontWeight: 700 }}>Bullshit Hole</div>}
            <div style={{ color: "#facc15", fontSize: "0.8rem" }}>{ballsPerHole} balls · Par {PAR}</div>
          </div>
          <div style={{ color: "#facc15", fontWeight: 700 }}>Avg: {(h.scores.reduce((a, b) => a + b, 0) / ballsPerHole).toFixed(2)}</div>
        </div>
        {Array.from({length: ballsPerHole}, (_, b) => (
          <div key={b} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: "14px", marginBottom: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ color: "#666", fontWeight: 700 }}>Ball {b + 1}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <button style={M.scoreBtn} onClick={() => setVal("scores", b, Math.max(1, h.scores[b] - 1))}>−</button>
                <span style={{ color: scoreColor(h.scores[b]), fontFamily: "monospace", fontWeight: 900, fontSize: "1.8rem", minWidth: 32, textAlign: "center" }}>{h.scores[b]}</span>
                <button style={M.scoreBtn} onClick={() => setVal("scores", b, Math.min(9, h.scores[b] + 1))}>+</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setVal("girs", b, h.girs[b] === 1 ? 0 : 1)} style={M.toggle(h.girs[b] === 1, "#4ade80", "rgba(74,222,128,0.1)")}>
                {h.girs[b] ? "GIR ✓" : "GIR ✗"}
              </button>
              <button onClick={() => setVal("threePutts", b, !h.threePutts[b])} style={M.toggle(h.threePutts[b], "#f87171", "rgba(248,113,113,0.12)")}>
                {h.threePutts[b] ? "🚽 3-Putt" : "3-Putt"}
              </button>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          {hole > 0 && <button style={{ ...M.btnSm, flex: 1 }} onClick={() => setHole(h => h - 1)}>← Back</button>}
          {hole === 0 && <button style={{ ...M.btnSm, flex: 1, color: "#f87171", borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)" }} onClick={onCancel}>Cancel</button>}
          <button style={{ ...M.btn, flex: 2, background: "#facc15", color: "#000" }} onClick={() => setHole(h => h + 1)}>{hole < totalHoles - 1 ? "Next →" : "Finish"}</button>
        </div>
      </div>
    </div>
  );
}

function PracticeDetail({ round, allRounds, onBack, onDelete, onEdit }) {
  const ballData = round.ball_data;
  const bph = round.balls_per_hole || 5;
  const isExpanded = round.course === "expanded12";
  const allScores = ballData.map(h => h.scores).flat();
  const allGirs = ballData.map(h => h.girs).flat();
  const allTP = ballData.map(h => h.threePutts || Array(bph).fill(false)).flat();
  const st = calcStats(allScores, allGirs, allTP, false);
  const [synopsis, setSynopsis] = useState(null);
  const [synopsisLoading, setSynopsisLoading] = useState(true);
  const [showCaddie, setShowCaddie] = useState(false);

  useEffect(() => {
    const history = (allRounds || []).filter(r => r.id !== round.id).slice(0, 5);
    fetch("/api/synopsis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "practice", round: { ...round, player: round.player_name }, history }),
    })
      .then(r => r.json())
      .then(d => { setSynopsis(d.synopsis || null); setSynopsisLoading(false); })
      .catch(() => setSynopsisLoading(false));
  }, [round.id]);

  const caddieContext = { mode: "practice", player: round.player_name, practiceRounds: allRounds || [] };

  return (
    <div>
      {showCaddie && <CaddieChat context={caddieContext} onClose={() => setShowCaddie(false)} />}
      <div style={M.header}>
        <BackBtn onBack={onBack} label="History" />
        <div style={{ color: "#555", fontSize: "0.75rem", marginTop: 8 }}>{fmtDate(round.date)} · {isExpanded ? "Expanded 12" : "Original 9"} · {bph} balls</div>
        <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "#facc15", marginTop: 4 }}>Practice Session</div>
      </div>
      <div style={{ padding: "0 12px" }}>
        {/* Synopsis */}
        <div style={{ background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.15)", borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ color: "#facc15", fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 8, fontWeight: 700 }}>🎒 Caddie's Take</div>
          {synopsisLoading ? (
            <div style={{ color: "#444", fontSize: "0.82rem" }}>Reading your session…</div>
          ) : synopsis ? (
            <div style={{ color: "#ccc", fontSize: "0.85rem", lineHeight: 1.6 }}>{synopsis}</div>
          ) : (
            <div style={{ color: "#444", fontSize: "0.82rem" }}>Synopsis unavailable.</div>
          )}
        </div>

        {ballData.map((h, i) => {
          const avg = (h.scores.reduce((a, b) => a + b, 0) / bph).toFixed(2);
          const label = isExpanded ? EXPANDED_12[i]?.label : `${i + 1}`;
          const isBullshit = isExpanded && EXPANDED_12[i] && !EXPANDED_12[i].real;
          return (
            <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: "14px", marginBottom: 10, border: `1px solid ${isBullshit ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.06)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontWeight: 700, color: isBullshit ? "#a78bfa" : "white" }}>Hole {label}{isBullshit ? " 💩" : ""}</div>
                <div style={{ fontSize: "0.78rem", color: "#555" }}>Avg: <span style={{ color: "#facc15" }}>{avg}</span></div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {h.scores.map((s, j) => (
                  <div key={j} style={{ flex: "0 0 calc(20% - 5px)", textAlign: "center", background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 0" }}>
                    <div style={{ color: scoreColor(s), fontWeight: 900, fontFamily: "monospace", fontSize: "1.1rem" }}>{s}</div>
                    <div style={{ fontSize: "0.58rem", color: h.girs[j] ? "#4ade80" : "#333", marginTop: 2 }}>{h.girs[j] ? "GIR" : "–"}</div>
                    {h.threePutts && h.threePutts[j] && <div style={{ fontSize: "0.7rem" }}>🚽</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", margin: "16px 0 12px" }}>Combined Stats ({allScores.length} balls)</div>
        <StatsGrid st={st} />
        <button onClick={() => setShowCaddie(true)} style={{ ...M.btn, background: "rgba(250,204,21,0.08)", color: "#facc15", border: "1px solid rgba(250,204,21,0.2)", marginBottom: 10 }}>
          🎒 Ask the Caddie
        </button>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ ...M.btnSm, flex: 1 }} onClick={onEdit}>Edit</button>
          <button style={{ ...M.btnSm, flex: 1, color: "#f87171", borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)" }} onClick={onDelete}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function PracticeStats({ rounds, player, onBack }) {
  const [period, setPeriod] = useState("recent");
  const [showCaddie, setShowCaddie] = useState(false);
  const filtered = useMemo(() => filterByPeriod(rounds, period), [rounds, period]);
  const isRecent = period === "recent";
  const caddieContext = { mode: "practice", player, practiceRounds: rounds };

  const allSt = filtered.map(r => calcStats(
    r.ball_data.map(h => h.scores).flat(),
    r.ball_data.map(h => h.girs).flat(),
    r.ball_data.map(h => h.threePutts || Array(r.balls_per_hole || 5).fill(false)).flat(),
    false
  ));

  const hcp = calcHandicap(filtered, r => ({
    scores: r.ball_data.map(h => h.scores).flat(),
    girs: r.ball_data.map(h => h.girs).flat(),
    putts: r.ball_data.map(h => h.threePutts || Array(r.balls_per_hole || 5).fill(false)).flat(),
    isPuttCounts: false,
  }));

  const avgFn = fn => allSt.length === 0 ? null : allSt.reduce((s, r) => s + fn(r), 0) / allSt.length;
  const avgOverUnder = avgFn(r => r.overUnder);

  return (
    <div>
      {showCaddie && <CaddieChat context={caddieContext} onClose={() => setShowCaddie(false)} />}
      <div style={M.header}><BackBtn onBack={onBack} /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>{player}'s Practice Stats</div></div>
      <div style={{ padding: "0 12px" }}>
        <PeriodFilter period={period} onChange={setPeriod} />
        <div style={{ textAlign: "center", padding: "12px 0 24px" }}>
          <div style={{ color: "#444", fontSize: "0.65rem", letterSpacing: "0.2em", textTransform: "uppercase" }}>Practice Handicap</div>
          <div style={{ fontSize: "5rem", fontWeight: 900, fontFamily: "monospace", color: "#facc15", lineHeight: 1.1 }}>{hcp ?? "—"}</div>
          {hcp === null && filtered.length < 5 && <div style={{ color: "#444", fontSize: "0.8rem", marginTop: 8 }}>{5 - filtered.length} more needed</div>}
        </div>
        {allSt.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 20 }}>
            <StatBox val={isRecent ? fmtOver(allSt[0].overUnder) : (avgOverUnder !== null ? fmtOverAvg(avgOverUnder) : "—")} label="Avg +/- Per Round" accent="#fff" />
            <StatBox val={`${isRecent ? allSt[0].girPct : Math.round(avgFn(r => r.girPct))}%`} label="GIR %" />
            <StatBox val={`${isRecent ? allSt[0].upAndDownPct : Math.round(avgFn(r => r.upAndDownPct))}%`} label="Scramble %" accent="#4ade80" />
            <StatBox val={`${isRecent ? allSt[0].birdieConvPct : Math.round(avgFn(r => r.birdieConvPct))}%`} label="Birdie Conv %" accent="#facc15" />
            <StatBox val={`${isRecent ? allSt[0].blowupPct : Math.round(avgFn(r => r.blowupPct))}%`} label="Blow-up %" accent="#f87171" />
            <StatBox val={isRecent ? (allSt[0].birdieBogeRatio === 999 ? "∞" : allSt[0].birdieBogeRatio.toFixed(2)) : (avgFn(r => r.birdieBogeRatio === 999 ? 0 : r.birdieBogeRatio)?.toFixed(2) ?? "—")} label="Birdie:Bogey+" />
            <StatBox val={`${isRecent ? allSt[0].consistencyPct : Math.round(avgFn(r => r.consistencyPct))}%`} label="Consistency" />
            <StatBox val={isRecent ? allSt[0].avgPutts.toFixed(2) : avgFn(r => r.avgPutts)?.toFixed(2) ?? "—"} label="Avg Putts" />
          </div>
        )}
        {allSt.length === 0 && <div style={{ color: "#444", textAlign: "center", padding: "40px 0" }}>No sessions in this period.</div>}
        <button onClick={() => setShowCaddie(true)} style={{ ...M.btn, background: "rgba(250,204,21,0.08)", color: "#facc15", border: "1px solid rgba(250,204,21,0.2)", marginTop: 8 }}>
          🎒 Ask the Caddie
        </button>
      </div>
    </div>
  );
}
// ═══════════════════════════════════════════════════════════════════════════════
function FridayApp({ onHome }) {
  const [rounds, setRounds] = useState([]);
  const [cricket, setCricket] = useState({ year: new Date().getFullYear(), closed: {} });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("menu");
  const [selected, setSelected] = useState(null);
  const [pendingDraft, setPendingDraft] = useState(null);

  useEffect(() => {
    const year = new Date().getFullYear();
    Promise.all([
      supabase.from("friday_rounds").select("*").order("date", { ascending: false }),
      supabase.from("cricket").select("*").eq("id", 1).single(),
      loadDraft("friday_draft"),
    ]).then(([{ data: roundData }, { data: cricketData }, draft]) => {
      if (roundData) setRounds(roundData);
      if (cricketData && cricketData.year === year) setCricket(cricketData);
      else if (!cricketData) supabase.from("cricket").insert({ id: 1, year, closed: {} });
      if (draft) setPendingDraft(draft);
      setLoading(false);
    });
  }, []);

  const persistCricket = async (updated) => {
    setCricket(updated);
    await supabase.from("cricket").upsert({ id: 1, year: updated.year, closed: updated.closed });
  };

 const handleSave = async (data, roundPlayers) => {
  const row = { date: new Date().toISOString(), players: roundPlayers, player_data: data };
  const { data: inserted, error } = await supabase.from("friday_rounds").insert(row).select().single();
  
  if (error || !inserted) {
    alert("Failed to save round. Please try again.");
    return; // don't clear the draft
  }

  setRounds(r => [inserted, ...r]);
  await persistCricket(updateCricket(cricket, { playerData: data }, roundPlayers));

  for (const p of roundPlayers) {
    const pd = data[p];
    const { scores, girs, putts } = extractRealHoleScores(pd.scores, pd.girs, null);
    const inferredPutts = scores.map((s, i) => 
      inferPuttsFromBool(s, girs[i], pd.threePutts[REAL_HOLE_INDICES[i]] || false)
    );
    const { error: stdError } = await supabase.from("standard_rounds").insert({
      player_name: p,
      date: new Date().toISOString(),
      scores, girs,
      putts: inferredPutts,
      course: "original9",
      source: "friday_extracted",
    });
    if (stdError) console.error(`Failed to save standard round for ${p}`, stdError);
  }

  await clearDraft("friday_draft");
  setPendingDraft(null);
  setView("history");
};

  const handleDelete = async (id) => {
    if (!window.confirm("Delete?")) return;
    await supabase.from("friday_rounds").delete().eq("id", id);
    setRounds(r => r.filter(x => x.id !== id));
    setView("history");
  };

  if (loading) return <LoadingScreen />;

  if (pendingDraft && view === "menu") {
    const draftDays = daysDiff(pendingDraft.savedAt);
    if (draftDays === 0) {
      return (
        <div>
          <div style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 14, margin: "16px 12px", padding: "16px" }}>
            <div style={{ fontWeight: 800, color: "#a78bfa", marginBottom: 4 }}>Round in Progress</div>
            <div style={{ color: "#666", fontSize: "0.82rem", marginBottom: 14 }}>Unfinished round today with {pendingDraft.players?.join(", ")}.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={async () => { await clearDraft("friday_draft"); setPendingDraft(null); }} style={{ ...M.btnSm, flex: 1, color: "#f87171", borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)", fontSize: "0.8rem" }}>Discard</button>
              <button onClick={() => setView("log_resume")} style={{ ...M.btn, flex: 2, background: "#a78bfa", color: "#000", fontSize: "0.9rem" }}>Resume →</button>
            </div>
          </div>
          <FridayMenu onHome={onHome} setView={setView} />
        </div>
      );
    } else {
      return (
        <DraftResumeModal
          draftDate={pendingDraft.savedAt}
          onResume={() => { setPendingDraft(null); setView("log_resume"); }}
          onDiscard={async () => { await clearDraft("friday_draft"); setPendingDraft(null); }}
        />
      );
    }
  }

  return (
    <div>
      {view === "menu" && <FridayMenu onHome={onHome} setView={setView} />}
      {view === "setup" && <FridaySetup onStart={players => setView({ name: "log", players })} onCancel={() => setView("menu")} />}
      {view?.name === "log" && <FridayEntry players={view.players} onComplete={(data) => handleSave(data, view.players)} onCancel={() => setView("menu")} />}
      {view === "log_resume" && pendingDraft && <FridayEntry players={pendingDraft.players} initialDraft={pendingDraft} onComplete={(data) => handleSave(data, pendingDraft.players)} onCancel={() => { clearDraft("friday_draft"); setPendingDraft(null); setView("menu"); }} />}
      {view === "history" && <FridayHistory rounds={rounds} onSelect={r => { setSelected(r); setView("detail"); }} onBack={() => setView("menu")} />}
      {view === "detail" && selected && <FridayDetail round={selected} allRounds={rounds} onBack={() => setView("history")} onDelete={() => handleDelete(selected.id)} />}
      {view === "leaderboard" && <FridayLeaderboard rounds={rounds} cricket={cricket} onBack={() => setView("menu")} />}
      {view === "groupstats" && <FridayGroupStats rounds={rounds} onBack={() => setView("menu")} />}
    </div>
  );
}

function FridayMenu({ onHome, setView }) {
  return (
    <div>
      <div style={M.header}>
        <BackBtn onBack={onHome} label="Home" />
        <div style={{ fontSize: "1.5rem", fontWeight: 900, marginTop: 8 }}>🍺 Friday League</div>
        <div style={{ color: "#555", fontSize: "0.85rem", marginTop: 4 }}>12 holes · vig · birdie contest</div>
      </div>
      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        <button style={{ ...M.btn, background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }} onClick={() => setView("setup")}>+ Start Friday Round</button>
        <button style={{ ...M.btn, background: "rgba(255,255,255,0.06)", color: "white" }} onClick={() => setView("leaderboard")}>📊 Season Leaderboard</button>
        <button style={{ ...M.btn, background: "rgba(255,255,255,0.06)", color: "white" }} onClick={() => setView("history")}>History</button>
        <button style={{ ...M.btn, background: "rgba(74,222,128,0.09)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)" }} onClick={() => setView("groupstats")}>Group Stats</button>
      </div>
    </div>
  );
}

function FridaySetup({ onStart, onCancel }) {
  const [selected, setSelected] = useState([...FRIDAY_PLAYERS]);
  const toggle = p => setSelected(s => s.includes(p) ? s.filter(x => x !== p) : [...s, p]);
  return (
    <div>
      <div style={M.header}><BackBtn onBack={onCancel} /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>Who's Playing?</div></div>
      <div style={{ padding: "0 12px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {FRIDAY_PLAYERS.map(p => (
            <button key={p} onClick={() => toggle(p)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 16px", borderRadius: 14, border: "1px solid", borderColor: selected.includes(p) ? "#a78bfa" : "rgba(255,255,255,0.1)", background: selected.includes(p) ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.03)", color: selected.includes(p) ? "#a78bfa" : "#666", fontWeight: 700, fontSize: "1rem", cursor: "pointer", minHeight: 56, WebkitTapHighlightColor: "transparent" }}>
              {p} {selected.includes(p) && <span>✓</span>}
            </button>
          ))}
        </div>
        <button style={{ ...M.btn, background: "#a78bfa", color: "#000" }} onClick={() => selected.length >= 2 && onStart(selected)}>
          Start with {selected.length} Players →
        </button>
      </div>
    </div>
  );
}

function FridayEntry({ players, initialDraft, onComplete, onCancel }) {
  const blank = () => ({ scores: Array(12).fill(PAR), girs: Array(12).fill(0), threePutts: Array(12).fill(false) });
  const [playerData, setPlayerData] = useState(() => initialDraft?.playerData || Object.fromEntries(players.map(p => [p, blank()])));
  const [hole, setHole] = useState(initialDraft?.hole || 0);

  const setVal = (player, field, val) => {
    setPlayerData(d => {
      const updated = { ...d[player], [field]: [...d[player][field]] };
      updated[field][hole] = val;
      if (field === "scores" || field === "girs") {
        const s = field === "scores" ? val : updated.scores[hole];
        const g = field === "girs" ? val : updated.girs[hole];
        if (g && s >= 4) updated.threePutts[hole] = true;
        else if (g && s < 4) updated.threePutts[hole] = false;
      }
      return { ...d, [player]: updated };
    });
  };

  useEffect(() => {
    saveDraft("friday_draft", { playerData, hole, players, savedAt: new Date().toISOString() });
  }, [playerData, hole]);

  const holeInfo = EXPANDED_12[Math.min(hole, 11)];
  const leaderboard = [...players].map(p => {
    const played = Math.min(hole + 1, 12);
    const total = playerData[p].scores.slice(0, played).reduce((a, b) => a + b, 0);
    return { name: p, over: total - PAR * played };
  }).sort((a, b) => a.over - b.over);

  const minOver = leaderboard[0]?.over;
  const maxOver = leaderboard[leaderboard.length - 1]?.over;
  const leadingPlayers = leaderboard.filter(l => l.over === minOver).map(l => l.name);
  const lastPlayers = leaderboard.filter(l => l.over === maxOver && leaderboard.length > 1).map(l => l.name);
  let lastThreePutters = [];
  for (let h = Math.min(hole, 11); h >= 0; h--) {
    const tp = players.filter(p => playerData[p].threePutts[h]);
    if (tp.length > 0) { lastThreePutters = tp; break; }
  }

  if (hole >= 12) {
    const { vigOwed, totals } = calcVig({ playerData }, players);
    const sorted = [...players].sort((a, b) => (totals[a] - PAR * 12) - (totals[b] - PAR * 12));
    const minTotal = Math.min(...sorted.map(p => totals[p]));
    const maxTotal = Math.max(...sorted.map(p => totals[p]));
    return (
      <div>
        <div style={M.header}>
          <div style={{ fontSize: "1.4rem", fontWeight: 900 }}>Round Complete 🏁</div>
          <div style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 14, padding: "16px", marginTop: 16, textAlign: "center" }}>
            <div style={{ color: "#666", fontSize: "0.65rem", textTransform: "uppercase" }}>Winner 🏆</div>
            <div style={{ fontSize: "2rem", fontWeight: 900, color: "#a78bfa", marginTop: 4 }}>{sorted.filter(p => totals[p] === minTotal).join(" & ")}</div>
            <div style={{ color: "#555", fontSize: "0.82rem" }}>{fmtOver(minTotal - PAR * 12)}</div>
          </div>
        </div>
        <div style={{ padding: "0 12px" }}>
          <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontSize: "0.78rem", color: "#4ade80" }}>
            ✓ Real hole scores will be automatically saved to each player's standard stats
          </div>
          <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12 }}>💸 Vig</div>
          {sorted.map(p => {
            const over = totals[p] - PAR * 12;
            const isLast = totals[p] === maxTotal && sorted.length > 1;
            const isFirst = totals[p] === minTotal;
            return (
              <div key={p} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 4px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ fontWeight: 700, fontSize: "1rem" }}>{isFirst ? "🏆 " : isLast ? "💩 " : ""}{p} <span style={{ color: "#555", fontWeight: 400, fontSize: "0.8rem" }}>({fmtOver(over)})</span></span>
                <span style={{ color: vigOwed[p] > 0 ? "#f87171" : "#4ade80", fontFamily: "monospace", fontWeight: 800, fontSize: "1rem" }}>{vigOwed[p] > 0 ? `-$${vigOwed[p]}` : "$0"}</span>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button style={{ ...M.btnSm, flex: 1 }} onClick={() => setHole(11)}>← Edit</button>
            <button style={{ ...M.btn, flex: 2, background: "#a78bfa", color: "#000" }} onClick={() => onComplete(playerData)}>Save Round</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ProgressBar total={12} current={hole} color="#a78bfa" />
      <div style={{ padding: "0 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em" }}>Hole</div>
            <div style={{ fontSize: "2.5rem", fontWeight: 900, fontFamily: "monospace", color: holeInfo.real ? "#a78bfa" : "#fb923c", lineHeight: 1 }}>{holeInfo.label}</div>
            {!holeInfo.real && <div style={{ color: "#fb923c", fontSize: "0.65rem", fontWeight: 700 }}>Bullshit Hole</div>}
            <div style={{ color: "#555", fontSize: "0.78rem" }}>Par {PAR} · {hole + 1}/12</div>
          </div>
          <div style={{ background: "rgba(139,92,246,0.08)", borderRadius: 12, padding: "10px 12px", border: "1px solid rgba(139,92,246,0.15)", minWidth: 148 }}>
            <div style={{ color: "#555", fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Leaderboard</div>
            {leaderboard.map((p, i) => {
              const isLeading = leadingPlayers.includes(p.name);
              const isLast = lastPlayers.includes(p.name);
              const isThreePutt = lastThreePutters.includes(p.name);
              return (
                <div key={p.name} style={{ fontSize: "0.78rem", color: isLeading ? "#a78bfa" : "#555", fontWeight: isLeading ? 800 : 400, marginBottom: 3, display: "flex", alignItems: "center", gap: 3 }}>
                  {isLeading ? "🏆" : `${i + 1}.`} {p.name}
                  {isLast && <span>💩</span>}
                  {isThreePutt && <span>🚽</span>}
                  <span style={{ fontFamily: "monospace", marginLeft: "auto" }}>{fmtOver(p.over)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {players.map(p => (
          <div key={p} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: "14px", marginBottom: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: "1rem" }}>{p}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <button style={M.scoreBtn} onClick={() => setVal(p, "scores", Math.max(1, playerData[p].scores[hole] - 1))}>−</button>
                <span style={{ color: scoreColor(playerData[p].scores[hole]), fontFamily: "monospace", fontWeight: 900, fontSize: "2rem", minWidth: 36, textAlign: "center", lineHeight: 1 }}>{playerData[p].scores[hole]}</span>
                <button style={M.scoreBtn} onClick={() => setVal(p, "scores", Math.min(9, playerData[p].scores[hole] + 1))}>+</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setVal(p, "girs", playerData[p].girs[hole] === 1 ? 0 : 1)} style={M.toggle(playerData[p].girs[hole] === 1, "#4ade80", "rgba(74,222,128,0.1)")}>
                {playerData[p].girs[hole] ? "GIR ✓" : "GIR ✗"}
              </button>
              <button onClick={() => setVal(p, "threePutts", !playerData[p].threePutts[hole])} style={M.toggle(playerData[p].threePutts[hole], "#f87171", "rgba(248,113,113,0.12)")}>
                {playerData[p].threePutts[hole] ? "🚽 3-Putt" : "3-Putt"}
              </button>
            </div>
          </div>
        ))}

        <div style={{ display: "flex", gap: 10, paddingBottom: 24 }}>
          {hole > 0 && <button style={{ ...M.btnSm, flex: 1 }} onClick={() => setHole(h => h - 1)}>← Back</button>}
          {hole === 0 && <button style={{ ...M.btnSm, flex: 1, color: "#f87171", borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)" }} onClick={onCancel}>Cancel</button>}
          <button style={{ ...M.btn, flex: 2, background: "#a78bfa", color: "#000" }} onClick={() => setHole(h => h + 1)}>{hole < 11 ? "Next →" : "Finish"}</button>
        </div>
      </div>
    </div>
  );
}

function FridayHistory({ rounds, onSelect, onBack }) {
  return (
    <div>
      <div style={M.header}><BackBtn onBack={onBack} /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>Friday League History</div></div>
      <div style={{ padding: "0 12px" }}>
        {rounds.length === 0 && <div style={{ color: "#444", textAlign: "center", padding: "60px 0" }}>No rounds yet.</div>}
        {rounds.map(r => {
          const players = r.players || FRIDAY_PLAYERS;
          const totals = Object.fromEntries(players.map(p => [p, r.player_data[p].scores.reduce((a, b) => a + b, 0)]));
          const minTotal = Math.min(...Object.values(totals));
          const winners = players.filter(p => totals[p] === minTotal);
          return <div key={r.id} onClick={() => onSelect(r)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 4px", borderBottom: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
            <div><div style={{ fontWeight: 700, fontSize: "1rem" }}>{fmtDate(r.date)}</div><div style={{ color: "#a78bfa", fontSize: "0.78rem", marginTop: 3 }}>🏆 {winners.join(" & ")} ({fmtOver(minTotal - PAR * 12)})</div></div>
            <div style={{ color: "#a78bfa", fontSize: "1.2rem" }}>→</div>
          </div>;
        })}
      </div>
    </div>
  );
}

function FridayDetail({ round, allRounds, onBack, onDelete }) {
  const players = round.players || FRIDAY_PLAYERS;
  const pd = round.player_data;
  const { vigOwed, totals } = calcVig({ playerData: pd }, players);
  const sorted = [...players].sort((a, b) => (totals[a] - PAR * 12) - (totals[b] - PAR * 12));
  const minTotal = Math.min(...sorted.map(p => totals[p]));
  const maxTotal = Math.max(...sorted.map(p => totals[p]));
  const lastThreePutters = getLastThreePutters({ playerData: pd }, players);
  const [synopsis, setSynopsis] = useState(null);
  const [synopsisLoading, setSynopsisLoading] = useState(true);
  const [showCaddie, setShowCaddie] = useState(false);

  useEffect(() => {
    fetch("/api/synopsis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "friday", round, players }),
    })
      .then(r => r.json())
      .then(d => { setSynopsis(d.synopsis || null); setSynopsisLoading(false); })
      .catch(() => setSynopsisLoading(false));
  }, [round.id]);

  const caddieContext = { mode: "friday_group", allFridayRounds: allRounds || [round] };

  return (
    <div>
      {showCaddie && <CaddieChat context={caddieContext} onClose={() => setShowCaddie(false)} />}
      <div style={M.header}>
        <BackBtn onBack={onBack} label="History" />
        <div style={{ color: "#555", fontSize: "0.75rem", marginTop: 8 }}>{fmtDate(round.date)}</div>
        <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "#a78bfa", marginTop: 4 }}>🏆 {sorted.filter(p => totals[p] === minTotal).join(" & ")}</div>
      </div>
      <div style={{ padding: "0 12px" }}>
        {/* Synopsis */}
        <div style={{ background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ color: "#a78bfa", fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 8, fontWeight: 700 }}>🎒 Caddie's Take</div>
          {synopsisLoading ? (
            <div style={{ color: "#444", fontSize: "0.82rem" }}>Reviewing the round…</div>
          ) : synopsis ? (
            <div style={{ color: "#ccc", fontSize: "0.85rem", lineHeight: 1.6 }}>{synopsis}</div>
          ) : (
            <div style={{ color: "#444", fontSize: "0.82rem" }}>Synopsis unavailable.</div>
          )}
        </div>

        <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12 }}>Final Standings</div>
        {sorted.map((p, i) => {
          const st = calcStats(pd[p].scores, pd[p].girs, pd[p].threePutts);
          const over = totals[p] - PAR * 12;
          const isLast = totals[p] === maxTotal && sorted.length > 1;
          const isFirst = totals[p] === minTotal;
          const isLastThreePutter = lastThreePutters.includes(p);
          return (
            <div key={p} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontWeight: 900, fontSize: "1rem", minWidth: 24 }}>{isFirst ? "🏆" : isLast ? "💩" : `${i + 1}.`}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "1rem" }}>{p} {isLastThreePutter && <span>🚽</span>}</div>
                  <div style={{ color: "#555", fontSize: "0.72rem", marginTop: 2 }}>{st.birdies} birdies · {st.totalGIRs} GIR · {st.totalThreePutts} 3-putts</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "monospace", fontWeight: 900, fontSize: "1.3rem", color: isFirst ? "#a78bfa" : "#ccc" }}>{fmtOver(over)}</div>
                <div style={{ color: vigOwed[p] > 0 ? "#f87171" : "#4ade80", fontSize: "0.75rem", fontWeight: 700 }}>{vigOwed[p] > 0 ? `-$${vigOwed[p]}` : "clean"}</div>
              </div>
            </div>
          );
        })}
        <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", margin: "20px 0 12px" }}>Scorecard</div>
        <div style={{ overflowX: "auto", marginBottom: 20 }}>
          <table style={{ borderCollapse: "collapse", fontSize: "0.72rem", minWidth: "100%" }}>
            <thead>
              <tr>
                <th style={M.th}>Player</th>
                {EXPANDED_12.map((h, i) => <th key={i} style={{ ...M.th, fontSize: "0.6rem", padding: "6px 2px", color: h.real ? "#444" : "#a78bfa" }}>{h.label}</th>)}
                <th style={M.th}>+/-</th>
              </tr>
            </thead>
            <tbody>
              {players.map(p => {
                const over = totals[p] - PAR * 12;
                return (
                  <tr key={p}>
                    <td style={{ ...M.td, fontWeight: 700, color: "#ccc" }}>{p}</td>
                    {pd[p].scores.map((s, i) => <td key={i} style={{ ...M.td, color: scoreColor(s), fontWeight: 600, padding: "6px 2px" }}>{s}</td>)}
                    <td style={{ ...M.td, fontWeight: 900, color: over > 0 ? "#fb923c" : over === 0 ? "#4ade80" : "#facc15" }}>{fmtOver(over)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button style={{ ...M.btn, background: "rgba(139,92,246,0.08)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.2)", marginBottom: 10 }} onClick={() => setShowCaddie(true)}>
          🎒 Ask the Caddie
        </button>
        <button style={{ ...M.btnSm, color: "#f87171", borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)", width: "100%" }} onClick={onDelete}>Delete Round</button>
      </div>
    </div>
  );
}

function FridayLeaderboard({ rounds, cricket, onBack }) {
  const year = new Date().getFullYear();
  const now = new Date();
  const playerStats = FRIDAY_PLAYERS.map(p => {
    const myRounds = rounds.filter(r => (r.players || FRIDAY_PLAYERS).includes(p));
    const wins = myRounds.filter(r => {
      const pl = r.players || FRIDAY_PLAYERS;
      const tots = Object.fromEntries(pl.map(x => [x, r.player_data[x].scores.reduce((a, b) => a + b, 0)]));
      return tots[p] === Math.min(...Object.values(tots));
    }).length;
    const lastPlaces = myRounds.filter(r => {
      const pl = r.players || FRIDAY_PLAYERS;
      const tots = Object.fromEntries(pl.map(x => [x, r.player_data[x].scores.reduce((a, b) => a + b, 0)]));
      return tots[p] === Math.max(...Object.values(tots));
    }).length;
    const totalVig = myRounds.reduce((sum, r) => {
      const pl = r.players || FRIDAY_PLAYERS;
      return sum + calcVig({ playerData: r.player_data }, pl).vigOwed[p];
    }, 0);
    const threePuttVigs = countThreePuttVigs(myRounds, p);
    const cricketClosed = EXPANDED_12.filter(h => cricket.closed[h.label] === p).length;
    const monthRounds = myRounds.filter(r => { const d = new Date(r.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    const monthAvg = monthRounds.length ? monthRounds.reduce((s, r) => s + r.player_data[p].scores.reduce((a, b) => a + b, 0), 0) / monthRounds.length : null;
    const allAvg = myRounds.length ? myRounds.reduce((s, r) => s + r.player_data[p].scores.reduce((a, b) => a + b, 0), 0) / myRounds.length : null;
    const isHot = monthAvg !== null && allAvg !== null && monthAvg < allAvg;
    // 12-hole handicap
    const hcp12 = calcHandicap(myRounds, r => ({ scores: r.player_data[p].scores, girs: r.player_data[p].girs, putts: r.player_data[p].threePutts, isPuttCounts: false }));
    return { name: p, wins, lastPlaces, rounds: myRounds.length, totalVig, threePuttVigs, cricketClosed, isHot, hcp12 };
  }).sort((a, b) => b.wins - a.wins);

  return (
    <div>
      <div style={M.header}>
        <BackBtn onBack={onBack} />
        <div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>📊 Season Leaderboard</div>
        <div style={{ color: "#555", fontSize: "0.82rem", marginTop: 4 }}>{year} Season</div>
      </div>
      <div style={{ padding: "0 12px" }}>
        {playerStats.map((p, i) => (
          <div key={p.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: i === 0 ? "#a78bfa" : "#444", fontWeight: 900, minWidth: 24 }}>{i + 1}.</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: "1rem", display: "flex", alignItems: "center", gap: 6 }}>{p.name} {p.isHot && <span>🔥</span>}</div>
                <div style={{ color: "#555", fontSize: "0.72rem", marginTop: 2, display: "flex", gap: 8 }}>
                  <span>{p.rounds} rounds</span><span>🐦 {p.cricketClosed}/12</span><span>💩 {p.lastPlaces}</span>
                  {p.threePuttVigs > 0 && <span>🚽{p.threePuttVigs}</span>}
                  {p.hcp12 !== null && <span>Hcp12: {p.hcp12}</span>}
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "#4ade80" }}>{p.wins}W</div>
              <div style={{ color: p.totalVig > 0 ? "#f87171" : "#4ade80", fontSize: "0.75rem", fontWeight: 700, marginTop: 2 }}>
                {p.totalVig > 0 ? `-$${p.totalVig}` : p.totalVig === 0 ? "$0" : `+$${Math.abs(p.totalVig)}`}
              </div>
            </div>
          </div>
        ))}
        <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", margin: "24px 0 10px" }}>🐦 Birdie Contest</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          {EXPANDED_12.map(h => {
            const closer = cricket.closed[h.label];
            return (
              <div key={h.label} style={{ background: closer ? "rgba(139,92,246,0.12)" : "rgba(255,255,255,0.03)", border: "1px solid", borderColor: closer ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 8px", textAlign: "center" }}>
                <div style={{ color: closer ? "#a78bfa" : h.real ? "#444" : "#666", fontWeight: 800, fontSize: "0.9rem" }}>{h.label}</div>
                <div style={{ color: closer ? "#a78bfa" : "#333", fontSize: "0.68rem", marginTop: 4 }}>{closer || "open"}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FridayGroupStats({ rounds, onBack }) {
  const [period, setPeriod] = useState("recent");
  const [expanded, setExpanded] = useState({});
  const [showCaddie, setShowCaddie] = useState(false);
  const toggleExpand = p => setExpanded(e => ({ ...e, [p]: !e[p] }));
  const isRecent = period === "recent";
  const mostRecentRound = rounds.length > 0 ? rounds[0] : null;
  const filteredRounds = useMemo(() => filterByPeriod(rounds, period), [rounds, period]);
  const caddieContext = { mode: "friday_group", allFridayRounds: rounds };

  const groupHoleScoreAvgs = EXPANDED_12.map((_, i) => {
    const allScores = rounds.flatMap(r => (r.players || FRIDAY_PLAYERS).map(p => r.player_data[p].scores[i]));
    return allScores.length ? allScores.reduce((a, b) => a + b, 0) / allScores.length : null;
  });
  const groupHoleGirPcts = EXPANDED_12.map((_, i) => {
    const allGirs = rounds.flatMap(r => (r.players || FRIDAY_PLAYERS).map(p => r.player_data[p].girs[i]));
    return allGirs.length ? Math.round(allGirs.filter(Boolean).length / allGirs.length * 100) : null;
  });
  const validGroupAvgs = groupHoleScoreAvgs.filter(v => v !== null);
  const minGroupAvg = validGroupAvgs.length ? Math.min(...validGroupAvgs) : null;
  const maxGroupAvg = validGroupAvgs.length ? Math.max(...validGroupAvgs) : null;
  function groupHoleColor(a) {
    if (a === null) return "#555";
    if (a === minGroupAvg) return "#4ade80";
    if (a === maxGroupAvg) return "#f87171";
    return "#fb923c";
  }

  return (
    <div>
      {showCaddie && <CaddieChat context={caddieContext} onClose={() => setShowCaddie(false)} />}
      <div style={M.header}><BackBtn onBack={onBack} /><div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: 8 }}>Group Stats</div></div>
      <div style={{ padding: "0 12px" }}>
        <PeriodFilter period={period} onChange={setPeriod} />
        <button onClick={() => setShowCaddie(true)} style={{ ...M.btn, background: "rgba(139,92,246,0.08)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.2)", marginBottom: 16 }}>
          🎒 Ask the Caddie
        </button>
        <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12 }}>Player Stats</div>
        {FRIDAY_PLAYERS.map(p => {
          const myRounds = filteredRounds.filter(r => (r.players || FRIDAY_PLAYERS).includes(p));
          const allSt = myRounds.map(r => calcStats(r.player_data[p].scores, r.player_data[p].girs, r.player_data[p].threePutts, false));
          const hcp12 = calcHandicap(myRounds, r => ({ scores: r.player_data[p].scores, girs: r.player_data[p].girs, putts: r.player_data[p].threePutts, isPuttCounts: false }));
          const avgFn = fn => allSt.length === 0 ? null : allSt.reduce((s, r) => s + fn(r), 0) / allSt.length;
          const avgOverUnder = avgFn(r => r.overUnder);
          const wins = myRounds.filter(r => {
            const pl = r.players || FRIDAY_PLAYERS;
            const tots = Object.fromEntries(pl.map(x => [x, r.player_data[x].scores.reduce((a, b) => a + b, 0)]));
            return tots[p] === Math.min(...Object.values(tots));
          }).length;
          const now = new Date();
          const allRoundsForP = rounds.filter(r => (r.players || FRIDAY_PLAYERS).includes(p));
          const monthRounds = allRoundsForP.filter(r => { const d = new Date(r.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
          const monthAvg = monthRounds.length ? monthRounds.reduce((s, r) => s + r.player_data[p].scores.reduce((a, b) => a + b, 0), 0) / monthRounds.length : null;
          const allAvg = allRoundsForP.length ? allRoundsForP.reduce((s, r) => s + r.player_data[p].scores.reduce((a, b) => a + b, 0), 0) / allRoundsForP.length : null;
          const isHot = monthAvg !== null && allAvg !== null && monthAvg < allAvg;

          const playerHoleScoreAvgs = EXPANDED_12.map((_, i) =>
            myRounds.length ? myRounds.reduce((sum, r) => sum + r.player_data[p].scores[i], 0) / myRounds.length : null
          );
          const playerHoleGirPcts = EXPANDED_12.map((_, i) =>
            myRounds.length ? Math.round(myRounds.reduce((sum, r) => sum + r.player_data[p].girs[i], 0) / myRounds.length * 100) : null
          );
          const validPlayerAvgs = playerHoleScoreAvgs.filter(v => v !== null);
          const minPlayerAvg = validPlayerAvgs.length ? Math.min(...validPlayerAvgs) : null;
          const maxPlayerAvg = validPlayerAvgs.length ? Math.max(...validPlayerAvgs) : null;
          function playerHoleColor(a) {
            if (a === null) return "#555";
            if (a === minPlayerAvg) return "#4ade80";
            if (a === maxPlayerAvg) return "#f87171";
            return "#fb923c";
          }

          const recentRoundForP = isRecent && mostRecentRound && (mostRecentRound.players || FRIDAY_PLAYERS).includes(p) ? mostRecentRound : null;

          return (
            <div key={p} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: "16px", marginBottom: 14, border: "1px solid rgba(139,92,246,0.15)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 800, fontSize: "1.1rem", display: "flex", alignItems: "center", gap: 6 }}>{p} {isHot && <span>🔥</span>}</div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "1.8rem", fontWeight: 900, fontFamily: "monospace", color: "#a78bfa", lineHeight: 1 }}>{hcp12 ?? "—"}</div>
                  <div style={{ color: "#444", fontSize: "0.62rem" }}>{myRounds.length < 5 ? `need ${5 - myRounds.length} more` : "12-hole hcp"}</div>
                </div>
              </div>

              {isRecent && recentRoundForP ? (() => {
                const rs = calcStats(recentRoundForP.player_data[p].scores, recentRoundForP.player_data[p].girs, recentRoundForP.player_data[p].threePutts, false);
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6 }}>
                    <StatBox val={fmtOver(rs.overUnder)} label="Score vs Par" accent="#fff" />
                    <StatBox val={`${rs.girPct}%`} label="GIR %" />
                    <StatBox val={`${rs.upAndDownPct}%`} label="Scramble %" accent="#4ade80" />
                    <StatBox val={`${rs.birdieConvPct}%`} label="Birdie Conv %" accent="#facc15" />
                    <StatBox val={`${rs.blowupPct}%`} label="Blow-up %" accent="#f87171" />
                    <StatBox val={rs.birdieBogeRatio === 999 ? "∞" : rs.birdieBogeRatio.toFixed(2)} label="Birdie:Bogey+" />
                    <StatBox val={rs.birdies} label="Birdies" accent="#facc15" />
                    <StatBox val={rs.maxGIRStreak} label="GIR Streak" />
                  </div>
                );
              })() : isRecent && !recentRoundForP ? (
                <div style={{ color: "#444", fontSize: "0.8rem", textAlign: "center", padding: "12px 0" }}>Not in most recent round</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6 }}>
                  <StatBox val={avgOverUnder !== null ? fmtOverAvg(avgOverUnder) : "—"} label="Avg +/- Per Round" accent="#fff" />
                  <StatBox val={allSt.length ? `${Math.round(avgFn(r => r.girPct))}%` : "—"} label="GIR %" />
                  <StatBox val={allSt.length ? `${Math.round(avgFn(r => r.upAndDownPct))}%` : "—"} label="Scramble %" accent="#4ade80" />
                  <StatBox val={allSt.length ? `${Math.round(avgFn(r => r.birdieConvPct))}%` : "—"} label="Birdie Conv %" accent="#facc15" />
                  <StatBox val={allSt.length ? wins : "—"} label="Wins" accent="#a78bfa" />
                  <StatBox val={allSt.length ? `${Math.round(avgFn(r => r.blowupPct))}%` : "—"} label="Blow-up %" accent="#f87171" />
                  <StatBox val={allSt.length ? (avgFn(r => r.birdieBogeRatio === 999 ? 0 : r.birdieBogeRatio)?.toFixed(2) ?? "—") : "—"} label="Birdie:Bogey+" />
                  <StatBox val={allSt.length ? (avgFn(r => r.maxGIRStreak)?.toFixed(1) ?? "—") : "—"} label="GIR Streak" />
                </div>
              )}

              <button onClick={() => toggleExpand(p)} style={{ ...M.ghost, marginTop: 14, fontSize: "0.8rem", color: "#a78bfa" }}>
                {expanded[p] ? "▲ Hide hole breakdown" : "▼ Show hole breakdown"}
              </button>

              {expanded[p] && (
                <div style={{ overflowX: "auto", marginTop: 8 }}>
                  {isRecent && recentRoundForP ? (
                    <table style={{ borderCollapse: "collapse", fontSize: "0.7rem", minWidth: "100%" }}>
                      <thead><tr><th style={M.th}>Hole</th>{EXPANDED_12.map((h, i) => <th key={i} style={{ ...M.th, fontSize: "0.6rem", color: h.real ? "#444" : "#a78bfa" }}>{h.label}</th>)}</tr></thead>
                      <tbody>
                        <tr><td style={M.td}>Score</td>{recentRoundForP.player_data[p].scores.map((s, i) => <td key={i} style={{ ...M.td, color: recentHoleColor(s), fontWeight: 700 }}>{s}</td>)}</tr>
                        <tr><td style={M.td}>GIR</td>{recentRoundForP.player_data[p].girs.map((g, i) => <td key={i} style={{ ...M.td }}>{g ? "✅" : "–"}</td>)}</tr>
                      </tbody>
                    </table>
                  ) : !isRecent && myRounds.length > 0 ? (
                    <table style={{ borderCollapse: "collapse", fontSize: "0.7rem", minWidth: "100%" }}>
                      <thead><tr><th style={M.th}>Hole</th>{EXPANDED_12.map((h, i) => <th key={i} style={{ ...M.th, fontSize: "0.6rem", color: h.real ? "#444" : "#a78bfa" }}>{h.label}</th>)}</tr></thead>
                      <tbody>
                        <tr><td style={M.td}>Avg</td>{playerHoleScoreAvgs.map((a, i) => <td key={i} style={{ ...M.td, color: playerHoleColor(a), fontWeight: 600 }}>{a !== null ? a.toFixed(2) : "—"}</td>)}</tr>
                        <tr><td style={M.td}>GIR%</td>{playerHoleGirPcts.map((g, i) => <td key={i} style={{ ...M.td, color: g !== null ? (g >= 50 ? "#4ade80" : g >= 25 ? "#fb923c" : "#f87171") : "#555", fontWeight: 600 }}>{g !== null ? `${g}%` : "—"}</td>)}</tr>
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ color: "#444", fontSize: "0.75rem", textAlign: "center", padding: "12px 0" }}>No data for this period.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.15em", margin: "8px 0 12px" }}>Course Averages (All Players)</div>
        <div style={{ overflowX: "auto", marginBottom: 24 }}>
          <table style={{ borderCollapse: "collapse", fontSize: "0.75rem", minWidth: "100%" }}>
            <thead><tr><th style={M.th}>Hole</th>{EXPANDED_12.map((h, i) => <th key={i} style={{ ...M.th, fontSize: "0.62rem", color: h.real ? "#444" : "#a78bfa" }}>{h.label}</th>)}</tr></thead>
            <tbody>
              <tr><td style={M.td}>Avg</td>{groupHoleScoreAvgs.map((a, i) => <td key={i} style={{ ...M.td, color: groupHoleColor(a), fontWeight: 600 }}>{a !== null ? a.toFixed(2) : "—"}</td>)}</tr>
              <tr><td style={M.td}>GIR%</td>{groupHoleGirPcts.map((g, i) => <td key={i} style={{ ...M.td, color: g !== null ? (g >= 50 ? "#4ade80" : g >= 25 ? "#fb923c" : "#f87171") : "#555", fontWeight: 600 }}>{g !== null ? `${g}%` : "—"}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CADDIE CHAT
// ═══════════════════════════════════════════════════════════════════════════════
function CaddieChat({ context, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = React.useRef(null);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/caddie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, context }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: "assistant", content: data.reply || "Sorry, I couldn't get a response." }]);
    } catch {
      setMessages(m => [...m, { role: "assistant", content: "Connection error. Try again." }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 200, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f0f0f" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: "1.1rem" }}>🎒 Ask the Caddie</div>
          <div style={{ color: "#555", fontSize: "0.72rem", marginTop: 2 }}>Your AI golf assistant</div>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#555", fontSize: "1.4rem", cursor: "pointer", padding: "4px 8px", WebkitTapHighlightColor: "transparent" }}>✕</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ color: "#444", fontSize: "0.85rem", textAlign: "center", paddingTop: 32 }}>
            <div style={{ fontSize: "2rem", marginBottom: 12 }}>🎒</div>
            Ask me anything about your game — stats, trends, what to work on, or how the group stacks up.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: m.role === "user" ? "row-reverse" : "row", gap: 8 }}>
            <div style={{
              maxWidth: "82%",
              background: m.role === "user" ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${m.role === "user" ? "rgba(74,222,128,0.25)" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 14,
              padding: "10px 14px",
              fontSize: "0.88rem",
              lineHeight: 1.5,
              color: m.role === "user" ? "#4ade80" : "#ddd",
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "10px 14px", fontSize: "0.88rem", color: "#555" }}>
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "12px 14px 24px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "#0f0f0f", display: "flex", gap: 10 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Ask about your game…"
          style={{ flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "14px 16px", color: "white", fontSize: "0.95rem", outline: "none" }}
        />
        <button onClick={send} disabled={!input.trim() || loading} style={{ background: "#4ade80", color: "#000", border: "none", borderRadius: 12, padding: "14px 18px", fontWeight: 800, fontSize: "0.9rem", cursor: "pointer", opacity: (!input.trim() || loading) ? 0.4 : 1, WebkitTapHighlightColor: "transparent" }}>
          →
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [mode, setMode] = useState(null);
  const [players, setPlayers] = useState([]);
  const [playersLoaded, setPlayersLoaded] = useState(false);

  useEffect(() => {
    emailjs.init(EMAILJS_KEY);
    supabase.from("players").select("*").order("created_at").then(({ data }) => {
      if (data) setPlayers(data);
      setPlayersLoaded(true);
    });
  }, []);

  const refreshPlayers = () => {
    supabase.from("players").select("*").order("created_at").then(({ data }) => {
      if (data) setPlayers(data);
    });
  };

  if (!playersLoaded) return <div style={M.page}><LoadingScreen /></div>;

  return (
    <div style={M.page}>
      {!mode && <Home onMode={setMode} />}
      {mode === "standard" && <StandardApp players={players} onHome={() => setMode(null)} />}
      {mode === "practice" && <PracticeApp players={players} onHome={() => setMode(null)} />}
      {mode === "friday" && <FridayApp onHome={() => setMode(null)} />}
      {mode === "feedback" && <BugReporter onBack={() => setMode(null)} />}
      {mode === "admin" && <AdminPanel players={players} onPlayersChange={refreshPlayers} onHome={() => setMode(null)} />}
    </div>
  );
}
