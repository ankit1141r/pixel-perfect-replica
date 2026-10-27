// scripts/export-sheets.mjs
// Extracts all live SPORTY database records from Supabase and writes CSV exports to public/exports/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const exportsDir = path.join(rootDir, "public", "exports");

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://jtawpnchteyhcjuqcvey.supabase.co";
const supabaseKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_S2lbCAN3NaVHAZbmwgreug_xoNb1mOM";

const sb = createClient(supabaseUrl, supabaseKey);

function toCsv(rows) {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const str = cell === null || cell === undefined ? "" : String(cell);
          if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(","),
    )
    .join("\r\n");
}

async function exportAll() {
  console.log("Connecting to Supabase at", supabaseUrl);
  const auth = await sb.auth.signInWithPassword({
    email: "ak1141@sporty.com",
    password: "Ankit@123",
  });

  if (auth.error) {
    console.error("Auth error:", auth.error.message);
  } else {
    console.log("Authenticated as:", auth.data.user.email);
  }

  const [playersRes, rolesRes, teamsRes, membersRes, regsRes, reqsRes, sportsRes, matchesRes] =
    await Promise.all([
      sb.from("profiles").select("*").order("created_at", { ascending: false }),
      sb.from("user_roles").select("*"),
      sb.from("teams").select("*, sport:sports(name)").order("name"),
      sb
        .from("team_members")
        .select("*, team:teams(name, sport:sports(name)), player:profiles(full_name, email)")
        .order("joined_at", { ascending: false }),
      sb
        .from("player_registrations")
        .select("*, sport:sports(name), player:profiles(full_name, email)")
        .order("created_at", { ascending: false }),
      sb
        .from("team_join_requests")
        .select("*, team:teams(name, sport:sports(name)), player:profiles(full_name, email)")
        .order("created_at", { ascending: false }),
      sb.from("sports").select("*").order("name"),
      sb
        .from("matches")
        .select(
          "*, sport:sports(name), home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)",
        )
        .order("scheduled_at", { ascending: false }),
    ]);

  const rolesMap = {};
  rolesRes.data?.forEach((r) => {
    rolesMap[r.user_id] = rolesMap[r.user_id] ? `${rolesMap[r.user_id]}, ${r.role}` : r.role;
  });

  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  // 1. Players CSV
  const playersCsv = toCsv([
    ["Player ID", "Full Name", "Email", "Role", "Registered At"],
    ...(playersRes.data || []).map((p) => [
      p.id,
      p.full_name,
      p.email,
      rolesMap[p.id] || "player",
      p.created_at,
    ]),
  ]);
  fs.writeFileSync(path.join(exportsDir, "players.csv"), playersCsv);

  // 2. Teams CSV
  const teamsCsv = toCsv([
    ["Team ID", "Team Name", "Sport", "Created At"],
    ...(teamsRes.data || []).map((t) => [t.id, t.name, t.sport?.name || "", t.created_at]),
  ]);
  fs.writeFileSync(path.join(exportsDir, "teams.csv"), teamsCsv);

  // 3. Team Members CSV
  const membersCsv = toCsv([
    ["Team Name", "Sport", "Player Name", "Player Email", "Player ID", "Joined At"],
    ...(membersRes.data || []).map((m) => [
      m.team?.name || "",
      m.team?.sport?.name || "",
      m.player?.full_name || "",
      m.player?.email || "",
      m.player_id,
      m.joined_at,
    ]),
  ]);
  fs.writeFileSync(path.join(exportsDir, "team_members.csv"), membersCsv);

  // 4. Registrations CSV
  const regsCsv = toCsv([
    [
      "Registration ID",
      "Player Name",
      "Player Email",
      "Sport",
      "Registration Status",
      "Sync Status",
      "Created At",
    ],
    ...(regsRes.data || []).map((r) => [
      r.id,
      r.player?.full_name || "",
      r.player?.email || "",
      r.sport?.name || "",
      r.status,
      r.sheets_sync_status,
      r.created_at,
    ]),
  ]);
  fs.writeFileSync(path.join(exportsDir, "registrations.csv"), regsCsv);

  // 5. Team Join Requests CSV
  const reqsCsv = toCsv([
    [
      "Request ID",
      "Team Name",
      "Sport",
      "Player Name",
      "Player Email",
      "Status",
      "Player Message / Experience",
      "Created At",
    ],
    ...(reqsRes.data || []).map((q) => [
      q.id,
      q.team?.name || "",
      q.team?.sport?.name || "",
      q.player?.full_name || "",
      q.player?.email || "",
      q.status,
      q.message || "",
      q.created_at,
    ]),
  ]);
  fs.writeFileSync(path.join(exportsDir, "team_join_requests.csv"), reqsCsv);

  // 6. Sports CSV
  const sportsCsv = toCsv([
    ["Sport ID", "Sport Name", "Description", "Created At"],
    ...(sportsRes.data || []).map((s) => [s.id, s.name, s.description || "", s.created_at]),
  ]);
  fs.writeFileSync(path.join(exportsDir, "sports.csv"), sportsCsv);

  // 7. Matches CSV
  const matchesCsv = toCsv([
    [
      "Match ID",
      "Sport",
      "Home Team",
      "Away Team",
      "Scheduled At",
      "Venue",
      "Status",
      "Home Score",
      "Away Score",
    ],
    ...(matchesRes.data || []).map((m) => [
      m.id,
      m.sport?.name || "",
      m.home_team?.name || "",
      m.away_team?.name || "",
      m.scheduled_at,
      m.venue || "",
      m.status,
      m.home_score ?? "",
      m.away_score ?? "",
    ]),
  ]);
  fs.writeFileSync(path.join(exportsDir, "matches.csv"), matchesCsv);

  console.log("Successfully generated all CSVs in:", exportsDir);
  console.log(fs.readdirSync(exportsDir));
}

exportAll().catch(console.error);
