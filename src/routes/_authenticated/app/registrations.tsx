import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Check, ClipboardCheck, FileSpreadsheet, RotateCw, Shield, Users, X } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/sporty/PageShell";
import { ErrorBox, Loading, Pager, paginate, RegBadge, SyncBadge } from "@/components/sporty/bits";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/auth";
import { registrationsQuery, teamJoinRequestsQuery, type RegStatus } from "@/lib/data";
import { triggerSheetsSync } from "@/lib/sheets";

export const Route = createFileRoute("/_authenticated/app/registrations")({
  head: () => ({
    meta: [
      { title: "Registrations & Requests — SPORTY" },
      { name: "description", content: "Sport registrations and team join requests." },
      { property: "og:title", content: "Registrations & Requests — SPORTY" },
      { property: "og:description", content: "Sport registrations and team join requests." },
    ],
  }),
  component: Registrations,
});

function Registrations() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const regs = useQuery(registrationsQuery);
  const teamRequests = useQuery(teamJoinRequestsQuery());

  const [activeTab, setActiveTab] = useState<"sports" | "teams">("sports");
  const [status, setStatus] = useState(me?.isAdmin ? "pending" : "all");
  const [teamStatus, setTeamStatus] = useState(me?.isAdmin ? "pending" : "all");
  const [page, setPage] = useState(1);
  const [teamPage, setTeamPage] = useState(1);
  const [syncing, setSyncing] = useState(false);

  const sportList = (regs.data ?? []).filter((r) => status === "all" || r.status === status);
  const sportPg = paginate(sportList, page);

  const teamList = (teamRequests.data ?? []).filter(
    (r) => teamStatus === "all" || r.status === teamStatus,
  );
  const teamPg = paginate(teamList, teamPage);

  const pendingSportCount = (regs.data ?? []).filter((r) => r.status === "pending").length;
  const pendingTeamCount = (teamRequests.data ?? []).filter((r) => r.status === "pending").length;

  async function decideSport(id: string, s: RegStatus) {
    const { error } = await supabase
      .from("player_registrations")
      .update({ status: s, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return void toast.error(error.message);
    toast.success(s === "approved" ? "Sport registration approved" : "Sport registration rejected");
    qc.invalidateQueries();
  }

  async function approveTeamRequest(requestId: string) {
    const { error } = await supabase.rpc("approve_team_join_request", { _request_id: requestId });
    if (error) return void toast.error(error.message);
    toast.success("Team join request approved and player added to team");
    qc.invalidateQueries();
  }

  async function rejectTeamRequest(requestId: string) {
    const { error } = await supabase.rpc("reject_team_join_request", { _request_id: requestId });
    if (error) return void toast.error(error.message);
    toast.success("Team join request rejected");
    qc.invalidateQueries();
  }

  async function withdrawTeamRequest(requestId: string) {
    const { error } = await supabase.from("team_join_requests").delete().eq("id", requestId);
    if (error) return void toast.error(error.message);
    toast.success("Join request withdrawn");
    qc.invalidateQueries();
  }

  async function retrySync(jobId: string) {
    const { error } = await supabase
      .from("sheets_sync_jobs")
      .update({ status: "pending", last_error: null, updated_at: new Date().toISOString() })
      .eq("id", jobId);
    if (error) return void toast.error(error.message);
    toast.success("Queued for another sync attempt");
    qc.invalidateQueries();
    const res = await triggerSheetsSync({ jobId });
    if (!res.configured && res.message) {
      toast.info(res.message);
    }
    qc.invalidateQueries();
  }

  async function syncAll() {
    setSyncing(true);
    try {
      const res = await triggerSheetsSync();
      if (res.configured) {
        toast.success(`Google Sheets: ${res.syncedCount ?? 0} record(s) synced`);
      } else {
        toast.info(
          res.message || "Google Sheets sync credentials not configured in Supabase secrets.",
        );
      }
    } catch {
      toast.error("Could not trigger Google Sheets synchronization");
    } finally {
      setSyncing(false);
      qc.invalidateQueries();
    }
  }

  return (
    <>
      <PageHeader
        title="Approvals & Requests"
        subtitle={
          me?.isAdmin
            ? "Manage player sport registrations and team join applications."
            : "Track your sport registrations and team join requests."
        }
        action={
          me?.isAdmin ? (
            <Button variant="outline" size="sm" onClick={syncAll} disabled={syncing}>
              <RotateCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              <FileSpreadsheet className="h-4 w-4" />
              {syncing ? "Syncing..." : "Sync Sheets"}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link to="/app/teams">Find Teams</Link>
              </Button>
              <Button asChild>
                <Link to="/app/sports">Register for Sport</Link>
              </Button>
            </div>
          )
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "sports" | "teams")}
        className="space-y-4"
      >
        <TabsList className="bg-muted/80">
          <TabsTrigger value="sports" className="gap-2">
            <ClipboardCheck className="h-4 w-4" />
            <span>Sport Registrations</span>
            {pendingSportCount > 0 && (
              <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[11px] font-semibold text-primary">
                {pendingSportCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="teams" className="gap-2">
            <Users className="h-4 w-4" />
            <span>Team Join Requests</span>
            {pendingTeamCount > 0 && (
              <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[11px] font-semibold text-primary">
                {pendingTeamCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Sport Registrations */}
        <TabsContent value="sports" className="space-y-4">
          <div className="flex items-center justify-between">
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-44" aria-label="Filter sport status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {regs.isLoading ? (
            <Loading />
          ) : regs.error ? (
            <ErrorBox error={regs.error} retry={() => regs.refetch()} />
          ) : !sportList.length ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No sport registrations"
              text={
                me?.isAdmin
                  ? "Nothing matches this filter."
                  : "Register for a sport from the Sports page."
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-muted-foreground">
                    <tr>
                      {me?.isAdmin && <th className="p-3 font-medium">Player</th>}
                      <th className="p-3 font-medium">Sport</th>
                      <th className="p-3 font-medium">Submitted</th>
                      <th className="p-3 font-medium">Status</th>
                      {me?.isAdmin && <th className="p-3 font-medium">Sheet sync</th>}
                      {me?.isAdmin && <th className="p-3 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sportPg.items.map((r) => (
                      <tr key={r.id}>
                        {me?.isAdmin && (
                          <td className="p-3">
                            <div className="font-medium">{r.player?.full_name}</div>
                            <div className="text-xs text-muted-foreground">{r.player?.email}</div>
                          </td>
                        )}
                        <td className="p-3">{r.sport?.name}</td>
                        <td className="p-3 text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <RegBadge s={r.status} />
                        </td>
                        {me?.isAdmin && (
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <SyncBadge s={r.job?.status ?? r.sheets_sync_status} />
                              {r.job?.status === "failed" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Retry sync"
                                  title={r.job.last_error ?? "Retry"}
                                  onClick={() => retrySync(r.job!.id)}
                                >
                                  <RotateCw className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                        {me?.isAdmin && (
                          <td className="whitespace-nowrap p-3 text-right">
                            {r.status !== "approved" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => decideSport(r.id, "approved")}
                              >
                                <Check className="h-4 w-4" /> Approve
                              </Button>
                            )}
                            {r.status !== "rejected" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="ml-1"
                                onClick={() => decideSport(r.id, "rejected")}
                              >
                                <X className="h-4 w-4" /> Reject
                              </Button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={sportPg.page} pages={sportPg.pages} setPage={setPage} />
            </>
          )}
        </TabsContent>

        {/* Tab 2: Team Join Requests */}
        <TabsContent value="teams" className="space-y-4">
          <div className="flex items-center justify-between">
            <Select
              value={teamStatus}
              onValueChange={(v) => {
                setTeamStatus(v);
                setTeamPage(1);
              }}
            >
              <SelectTrigger className="w-44" aria-label="Filter team request status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {teamRequests.isLoading ? (
            <Loading />
          ) : teamRequests.error ? (
            <ErrorBox error={teamRequests.error} retry={() => teamRequests.refetch()} />
          ) : !teamList.length ? (
            <EmptyState
              icon={Shield}
              title="No team join requests"
              text={
                me?.isAdmin
                  ? "No player requests match this filter."
                  : "Browse teams to submit a request to join a squad."
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-muted-foreground">
                    <tr>
                      {me?.isAdmin && <th className="p-3 font-medium">Player</th>}
                      <th className="p-3 font-medium">Team</th>
                      <th className="p-3 font-medium">Sport</th>
                      <th className="p-3 font-medium">Note</th>
                      <th className="p-3 font-medium">Requested</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {teamPg.items.map((r) => (
                      <tr key={r.id}>
                        {me?.isAdmin && (
                          <td className="p-3">
                            <div className="font-medium">{r.player?.full_name}</div>
                            <div className="text-xs text-muted-foreground">{r.player?.email}</div>
                          </td>
                        )}
                        <td className="p-3">
                          <Link
                            to="/app/teams/$teamId"
                            params={{ teamId: r.team?.id ?? "" }}
                            className="font-medium hover:text-primary transition-colors"
                          >
                            {r.team?.name}
                          </Link>
                        </td>
                        <td className="p-3 text-muted-foreground">{r.team?.sport?.name}</td>
                        <td className="p-3 max-w-xs truncate text-xs text-muted-foreground">
                          {r.message || "—"}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <RegBadge s={r.status} />
                        </td>
                        <td className="whitespace-nowrap p-3 text-right">
                          {me?.isAdmin ? (
                            <div className="flex items-center justify-end gap-1">
                              {r.status !== "approved" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => approveTeamRequest(r.id)}
                                >
                                  <Check className="h-4 w-4" /> Approve
                                </Button>
                              )}
                              {r.status !== "rejected" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => rejectTeamRequest(r.id)}
                                >
                                  <X className="h-4 w-4" /> Reject
                                </Button>
                              )}
                            </div>
                          ) : (
                            r.status === "pending" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs text-muted-foreground hover:text-destructive"
                                onClick={() => withdrawTeamRequest(r.id)}
                              >
                                Withdraw
                              </Button>
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={teamPg.page} pages={teamPg.pages} setPage={setTeamPage} />
            </>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
