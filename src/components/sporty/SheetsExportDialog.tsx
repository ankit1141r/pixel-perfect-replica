import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Layers,
  Shield,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  allTeamMembersQuery,
  fmtDate,
  matchesQuery,
  playersQuery,
  registrationsQuery,
  sportsQuery,
  teamJoinRequestsQuery,
  teamsQuery,
} from "@/lib/data";

const GOOGLE_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1_7AC3EK1isAkRsxzuGKrdH47I_m0ChKuhVmTo1xz_9k/edit";
const LIVE_ORIGIN =
  typeof window !== "undefined" && window.location.origin.includes("vercel.app")
    ? window.location.origin
    : "https://pixel-perfect-replica-dnbl.vercel.app";

function toCsvString(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const all = [headers, ...rows];
  return all
    .map((r) =>
      r
        .map((cell) => {
          const s = cell === null || cell === undefined ? "" : String(cell);
          if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        })
        .join(","),
    )
    .join("\r\n");
}

function toTsvString(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const all = [headers, ...rows];
  return all
    .map((r) =>
      r
        .map((cell) => {
          const s = cell === null || cell === undefined ? "" : String(cell);
          return s.replace(/\t/g, " ").replace(/\r?\n/g, " ");
        })
        .join("\t"),
    )
    .join("\n");
}

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function SheetsExportDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const players = useQuery(playersQuery);
  const teams = useQuery(teamsQuery);
  const members = useQuery(allTeamMembersQuery);
  const regs = useQuery(registrationsQuery);
  const requests = useQuery(teamJoinRequestsQuery());
  const sports = useQuery(sportsQuery);
  const matches = useQuery(matchesQuery);

  async function copyToClipboard(key: string, tsv: string, title: string) {
    try {
      await navigator.clipboard.writeText(tsv);
      setCopiedKey(key);
      toast.success(`Copied ${title}! Paste into Google Sheet (Ctrl+V)`);
      setTimeout(() => setCopiedKey(null), 2500);
    } catch {
      toast.error("Failed to copy to clipboard.");
    }
  }

  // Datasets
  const playersHeaders = ["Player ID", "Full Name", "Email", "Role", "Registered Date"];
  const playersRows = (players.data ?? []).map((p) => [
    p.id,
    p.full_name,
    p.email,
    p.isAdmin ? "Admin & Player" : "Player",
    fmtDate(p.created_at),
  ]);

  const teamsHeaders = ["Team ID", "Team Name", "Sport", "Created Date"];
  const teamsRows = (teams.data ?? []).map((t) => [
    t.id,
    t.name,
    (t as any).sport?.name || "",
    fmtDate(t.created_at),
  ]);

  const membersHeaders = ["Team Name", "Sport", "Player Name", "Player Email", "Joined Date"];
  const membersRows = (members.data ?? []).map((m: any) => [
    m.team?.name || "",
    m.team?.sport?.name || "",
    m.player?.full_name || "",
    m.player?.email || "",
    fmtDate(m.joined_at),
  ]);

  const regsHeaders = [
    "Registration ID",
    "Player Name",
    "Email",
    "Sport",
    "Status",
    "Sync Status",
    "Date",
  ];
  const regsRows = (regs.data ?? []).map((r) => [
    r.id,
    r.player?.full_name || "",
    r.player?.email || "",
    r.sport?.name || "",
    r.status,
    (r as any).job?.status || r.sheets_sync_status || "pending",
    fmtDate(r.created_at),
  ]);

  const reqsHeaders = [
    "Request ID",
    "Team Name",
    "Sport",
    "Player Name",
    "Email",
    "Status",
    "Player Note / Experience",
    "Requested Date",
  ];
  const reqsRows = (requests.data ?? []).map((q: any) => [
    q.id,
    q.team?.name || "",
    q.team?.sport?.name || "",
    q.player?.full_name || "",
    q.player?.email || "",
    q.status,
    q.message || "",
    fmtDate(q.created_at),
  ]);

  const sportsHeaders = ["Sport ID", "Sport Name", "Description"];
  const sportsRows = (sports.data ?? []).map((s) => [s.id, s.name, s.description || ""]);

  const matchesHeaders = [
    "Match ID",
    "Sport",
    "Home Team",
    "Away Team",
    "Scheduled At",
    "Venue",
    "Status",
    "Score",
  ];
  const matchesRows = (matches.data ?? []).map((m: any) => [
    m.id,
    m.sport?.name || "",
    m.home?.name || "",
    m.away?.name || "",
    fmtDate(m.scheduled_at),
    m.venue || "",
    m.status,
    m.home_score != null ? `${m.home_score} - ${m.away_score}` : "TBD",
  ]);

  function downloadAllCSVs() {
    window.open(`${LIVE_ORIGIN}/exports/all_data.csv`, "_blank");
    triggerDownload(toCsvString(playersHeaders, playersRows), "sporty_players.csv");
    triggerDownload(toCsvString(teamsHeaders, teamsRows), "sporty_teams.csv");
    triggerDownload(toCsvString(membersHeaders, membersRows), "sporty_team_members.csv");
    triggerDownload(toCsvString(regsHeaders, regsRows), "sporty_registrations.csv");
    triggerDownload(toCsvString(reqsHeaders, reqsRows), "sporty_team_join_requests.csv");
    triggerDownload(toCsvString(sportsHeaders, sportsRows), "sporty_sports.csv");
    toast.success("Downloaded all CSV files including sporty_all_data.csv!");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ? (
          trigger
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
            <span>Google Sheets Data Hub</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0 sm:max-h-[85vh]">
        <div className="flex max-h-[85vh] flex-col">
          {/* Header */}
          <div className="border-b bg-muted/40 p-6 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <DialogTitle className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
                  <FileSpreadsheet className="h-6 w-6 text-emerald-400" />
                  Google Sheets Integration & Data Hub
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-muted-foreground">
                  Easily add all player profiles, teams, rosters, registrations, and sports data into
                  your Google Sheet.
                </DialogDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                >
                  <a href={GOOGLE_SHEET_URL} target="_blank" rel="noopener noreferrer">
                    Open Your Sheet
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
                <Button
                  size="sm"
                  onClick={downloadAllCSVs}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download All CSVs
                </Button>
              </div>
            </div>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto p-6">
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="grid grid-cols-2 md:grid-cols-7 bg-muted/80 h-auto p-1">
                <TabsTrigger value="overview" className="gap-1.5 text-xs py-2">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  <span>Setup Guide</span>
                </TabsTrigger>
                <TabsTrigger value="players" className="gap-1.5 text-xs py-2">
                  <Users className="h-3.5 w-3.5" />
                  <span>Players ({playersRows.length})</span>
                </TabsTrigger>
                <TabsTrigger value="teams" className="gap-1.5 text-xs py-2">
                  <Shield className="h-3.5 w-3.5" />
                  <span>Teams ({teamsRows.length})</span>
                </TabsTrigger>
                <TabsTrigger value="members" className="gap-1.5 text-xs py-2">
                  <Layers className="h-3.5 w-3.5" />
                  <span>Rosters ({membersRows.length})</span>
                </TabsTrigger>
                <TabsTrigger value="regs" className="gap-1.5 text-xs py-2">
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  <span>Registrations ({regsRows.length})</span>
                </TabsTrigger>
                <TabsTrigger value="requests" className="gap-1.5 text-xs py-2">
                  <span>Join Requests ({reqsRows.length})</span>
                </TabsTrigger>
                <TabsTrigger value="sports" className="gap-1.5 text-xs py-2">
                  <Trophy className="h-3.5 w-3.5" />
                  <span>Sports ({sportsRows.length})</span>
                </TabsTrigger>
              </TabsList>

              {/* TAB 1: OVERVIEW & FORMULAS */}
              <TabsContent value="overview" className="space-y-4">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4">
                  <h3 className="font-semibold text-emerald-300 flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Option 1: Instant Google Sheets Formulas (Auto-Syncing)
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Google Sheets can pull your live data automatically! In your Google Sheet,
                    create tabs and paste these formulas into cell <strong>A1</strong>:
                  </p>

                  <div className="mt-3 space-y-2">
                    {[
                      {
                        name: "All Project Data (Everything in 1 Sheet)",
                        formula: `=IMPORTDATA("${LIVE_ORIGIN}/exports/all_data.csv")`,
                        key: "f-all",
                        highlight: true,
                      },
                      {
                        name: "Players Tab",
                        formula: `=IMPORTDATA("${LIVE_ORIGIN}/exports/players.csv")`,
                        key: "f-players",
                      },
                      {
                        name: "Teams Tab",
                        formula: `=IMPORTDATA("${LIVE_ORIGIN}/exports/teams.csv")`,
                        key: "f-teams",
                      },
                      {
                        name: "Team Members / Rosters Tab",
                        formula: `=IMPORTDATA("${LIVE_ORIGIN}/exports/team_members.csv")`,
                        key: "f-members",
                      },
                      {
                        name: "Registrations Tab",
                        formula: `=IMPORTDATA("${LIVE_ORIGIN}/exports/registrations.csv")`,
                        key: "f-regs",
                      },
                      {
                        name: "Team Join Requests Tab",
                        formula: `=IMPORTDATA("${LIVE_ORIGIN}/exports/team_join_requests.csv")`,
                        key: "f-reqs",
                      },
                      {
                        name: "Sports Tab",
                        formula: `=IMPORTDATA("${LIVE_ORIGIN}/exports/sports.csv")`,
                        key: "f-sports",
                      },
                    ].map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between gap-3 rounded-lg border bg-background/60 p-2.5 text-xs"
                      >
                        <div className="flex-1 font-mono text-[11px] truncate">
                          <span className="font-bold text-foreground mr-2">{item.name}:</span>
                          <span className="text-emerald-400">{item.formula}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 shrink-0"
                          onClick={() => copyToClipboard(item.key, item.formula, `${item.name} Formula`)}
                        >
                          {copiedKey === item.key ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          Copy Formula
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border bg-card p-4">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Copy className="h-4 w-4 text-primary" />
                    Option 2: 1-Click Copy & Paste Directly
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Click any tab above (e.g. <strong>Players</strong> or <strong>Teams</strong>), click{" "}
                    <strong>&quot;Copy Table for Sheets&quot;</strong>, then open your Google Sheet and
                    press <strong>Ctrl+V</strong>. Columns and rows will automatically align!
                  </p>
                </div>
              </TabsContent>

              {/* TAB 2: PLAYERS */}
              <TabsContent value="players" className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    All registered athletes and administrators currently in the database.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() =>
                        copyToClipboard(
                          "copy-players",
                          toTsvString(playersHeaders, playersRows),
                          "Players Table",
                        )
                      }
                    >
                      {copiedKey === "copy-players" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Copy Table (for Sheet)
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1.5 text-xs"
                      onClick={() =>
                        triggerDownload(toCsvString(playersHeaders, playersRows), "sporty_players.csv")
                      }
                    >
                      <Download className="h-3.5 w-3.5" />
                      CSV
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border bg-card">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/60 text-muted-foreground">
                      <tr>
                        {playersHeaders.map((h) => (
                          <th key={h} className="p-2.5 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {playersRows.map((r, i) => (
                        <tr key={i} className="hover:bg-muted/30">
                          {r.map((c, j) => (
                            <td key={j} className="p-2.5 font-mono text-[11px]">
                              {c}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* TAB 3: TEAMS */}
              <TabsContent value="teams" className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    All created sports clubs and teams.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() =>
                        copyToClipboard("copy-teams", toTsvString(teamsHeaders, teamsRows), "Teams Table")
                      }
                    >
                      {copiedKey === "copy-teams" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Copy Table (for Sheet)
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1.5 text-xs"
                      onClick={() =>
                        triggerDownload(toCsvString(teamsHeaders, teamsRows), "sporty_teams.csv")
                      }
                    >
                      <Download className="h-3.5 w-3.5" />
                      CSV
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border bg-card">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/60 text-muted-foreground">
                      <tr>
                        {teamsHeaders.map((h) => (
                          <th key={h} className="p-2.5 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {teamsRows.map((r, i) => (
                        <tr key={i} className="hover:bg-muted/30">
                          {r.map((c, j) => (
                            <td key={j} className="p-2.5 font-mono text-[11px]">
                              {c}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* TAB 4: MEMBERS / ROSTERS */}
              <TabsContent value="members" className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Player assignments to teams and rosters.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() =>
                        copyToClipboard(
                          "copy-members",
                          toTsvString(membersHeaders, membersRows),
                          "Team Members",
                        )
                      }
                    >
                      {copiedKey === "copy-members" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Copy Table (for Sheet)
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1.5 text-xs"
                      onClick={() =>
                        triggerDownload(
                          toCsvString(membersHeaders, membersRows),
                          "sporty_team_members.csv",
                        )
                      }
                    >
                      <Download className="h-3.5 w-3.5" />
                      CSV
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border bg-card">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/60 text-muted-foreground">
                      <tr>
                        {membersHeaders.map((h) => (
                          <th key={h} className="p-2.5 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {membersRows.map((r, i) => (
                        <tr key={i} className="hover:bg-muted/30">
                          {r.map((c, j) => (
                            <td key={j} className="p-2.5 font-mono text-[11px]">
                              {c}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* TAB 5: REGISTRATIONS */}
              <TabsContent value="regs" className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Player registrations for individual sports.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() =>
                        copyToClipboard(
                          "copy-regs",
                          toTsvString(regsHeaders, regsRows),
                          "Registrations Table",
                        )
                      }
                    >
                      {copiedKey === "copy-regs" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Copy Table (for Sheet)
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1.5 text-xs"
                      onClick={() =>
                        triggerDownload(
                          toCsvString(regsHeaders, regsRows),
                          "sporty_registrations.csv",
                        )
                      }
                    >
                      <Download className="h-3.5 w-3.5" />
                      CSV
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border bg-card">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/60 text-muted-foreground">
                      <tr>
                        {regsHeaders.map((h) => (
                          <th key={h} className="p-2.5 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {regsRows.map((r, i) => (
                        <tr key={i} className="hover:bg-muted/30">
                          {r.map((c, j) => (
                            <td key={j} className="p-2.5 font-mono text-[11px]">
                              {c}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* TAB 6: JOIN REQUESTS */}
              <TabsContent value="requests" className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Applications submitted by athletes wanting to join teams.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() =>
                        copyToClipboard(
                          "copy-reqs",
                          toTsvString(reqsHeaders, reqsRows),
                          "Join Requests Table",
                        )
                      }
                    >
                      {copiedKey === "copy-reqs" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Copy Table (for Sheet)
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1.5 text-xs"
                      onClick={() =>
                        triggerDownload(
                          toCsvString(reqsHeaders, reqsRows),
                          "sporty_team_join_requests.csv",
                        )
                      }
                    >
                      <Download className="h-3.5 w-3.5" />
                      CSV
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border bg-card">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/60 text-muted-foreground">
                      <tr>
                        {reqsHeaders.map((h) => (
                          <th key={h} className="p-2.5 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {reqsRows.map((r, i) => (
                        <tr key={i} className="hover:bg-muted/30">
                          {r.map((c, j) => (
                            <td key={j} className="p-2.5 font-mono text-[11px]">
                              {c}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* TAB 7: SPORTS */}
              <TabsContent value="sports" className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">Available sports categories.</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() =>
                        copyToClipboard(
                          "copy-sports",
                          toTsvString(sportsHeaders, sportsRows),
                          "Sports Table",
                        )
                      }
                    >
                      {copiedKey === "copy-sports" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Copy Table (for Sheet)
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1.5 text-xs"
                      onClick={() =>
                        triggerDownload(toCsvString(sportsHeaders, sportsRows), "sporty_sports.csv")
                      }
                    >
                      <Download className="h-3.5 w-3.5" />
                      CSV
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border bg-card">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/60 text-muted-foreground">
                      <tr>
                        {sportsHeaders.map((h) => (
                          <th key={h} className="p-2.5 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sportsRows.map((r, i) => (
                        <tr key={i} className="hover:bg-muted/30">
                          {r.map((c, j) => (
                            <td key={j} className="p-2.5 font-mono text-[11px]">
                              {c}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
