import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Clock,
  MessageSquare,
  Pencil,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/sporty/PageShell";
import { Card, Confirm, ErrorBox, Loading } from "@/components/sporty/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/auth";
import {
  matchesQuery,
  playersQuery,
  rosterQuery,
  teamJoinRequestsQuery,
  teamQuery,
} from "@/lib/data";
import { MatchList } from "@/components/sporty/MatchList";
import { TeamDialog } from "@/components/sporty/TeamDialog";

export const Route = createFileRoute("/_authenticated/app/teams/$teamId")({
  head: () => ({
    meta: [
      { title: "Team — SPORTY" },
      { name: "description", content: "Team roster and fixtures." },
      { property: "og:title", content: "Team — SPORTY" },
      { property: "og:description", content: "Team roster and fixtures." },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const { teamId } = Route.useParams();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const team = useQuery(teamQuery(teamId));
  const roster = useQuery(rosterQuery(teamId));
  const matches = useQuery(matchesQuery);
  const requests = useQuery(teamJoinRequestsQuery(teamId));
  const players = useQuery({ ...playersQuery, enabled: !!me?.isAdmin });

  const [pick, setPick] = useState("");
  const [editing, setEditing] = useState(false);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);

  if (team.isLoading) return <Loading />;
  if (team.error) return <ErrorBox error={team.error} />;
  if (!team.data)
    return <EmptyState icon={Users} title="Team not found" text="It may have been deleted." />;
  const t = team.data;

  const memberIds = new Set((roster.data ?? []).map((r) => r.player_id));
  const candidates = (players.data ?? []).filter((p) => !memberIds.has(p.id));
  const teamMatches = (matches.data ?? []).filter(
    (m) => m.home_team_id === teamId || m.away_team_id === teamId,
  );

  const isMember = me?.id ? memberIds.has(me.id) : false;
  const myRequest = (requests.data ?? []).find((r) => r.player_id === me?.id);
  const pendingRequests = (requests.data ?? []).filter((r) => r.status === "pending");

  async function add() {
    if (!pick) return;
    const { error } = await supabase
      .from("team_members")
      .insert({ team_id: teamId, player_id: pick });
    if (error) return void toast.error(error.message);

    // Auto-approve if player had a pending join request
    await supabase
      .from("team_join_requests")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("team_id", teamId)
      .eq("player_id", pick)
      .eq("status", "pending");

    toast.success("Player added to roster");
    setPick("");
    qc.invalidateQueries();
  }

  async function removeMember(playerId: string) {
    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("player_id", playerId);
    if (error) return void toast.error(error.message);
    toast.success("Player removed from roster");
    qc.invalidateQueries();
  }

  async function approveRequest(requestId: string) {
    const { error } = await supabase.rpc("approve_team_join_request", { _request_id: requestId });
    if (error) return void toast.error(error.message);
    toast.success("Join request approved and player added to team");
    qc.invalidateQueries();
  }

  async function rejectRequest(requestId: string) {
    const { error } = await supabase.rpc("reject_team_join_request", { _request_id: requestId });
    if (error) return void toast.error(error.message);
    toast.success("Join request rejected");
    qc.invalidateQueries();
  }

  async function submitJoinRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!me?.id) return;
    setSubmittingRequest(true);
    try {
      const { error } = await supabase.from("team_join_requests").upsert(
        {
          team_id: teamId,
          player_id: me.id,
          message: requestMessage.trim() || null,
          status: "pending",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "team_id,player_id" },
      );
      if (error) throw error;
      toast.success("Join request submitted! Team administrators have been notified.");
      setRequestDialogOpen(false);
      setRequestMessage("");
      qc.invalidateQueries();
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error?.message ?? "Failed to submit join request");
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function cancelMyRequest(requestId: string) {
    const { error } = await supabase.from("team_join_requests").delete().eq("id", requestId);
    if (error) return void toast.error(error.message);
    toast.success("Join request withdrawn");
    qc.invalidateQueries();
  }

  return (
    <>
      <Button asChild variant="link" className="mb-2 h-auto p-0 text-muted-foreground">
        <Link to="/app/teams">
          <ArrowLeft className="h-4 w-4" /> All teams
        </Link>
      </Button>

      <PageHeader
        title={t.name}
        subtitle={`${t.sport?.name ?? ""}${t.description ? ` · ${t.description}` : ""}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {me?.isAdmin ? (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Edit team
              </Button>
            ) : isMember ? (
              <Badge className="flex items-center gap-1.5 border-primary/30 bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary">
                <Check className="h-3.5 w-3.5" /> Team Member
              </Badge>
            ) : myRequest?.status === "pending" ? (
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="flex items-center gap-1.5 border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400"
                >
                  <Clock className="h-3.5 w-3.5" /> Request Pending
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => cancelMyRequest(myRequest.id)}
                >
                  Withdraw
                </Button>
              </div>
            ) : myRequest?.status === "rejected" ? (
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="flex items-center gap-1.5 border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
                >
                  Request Rejected
                </Badge>
                <Button size="sm" variant="outline" onClick={() => setRequestDialogOpen(true)}>
                  Request Again
                </Button>
              </div>
            ) : (
              <Button onClick={() => setRequestDialogOpen(true)} className="gap-2">
                <UserPlus className="h-4 w-4" /> Request to Join
              </Button>
            )}
          </div>
        }
      />

      {/* Admin Review Pending Requests Card */}
      {me?.isAdmin && pendingRequests.length > 0 && (
        <div className="mb-6">
          <Card
            title={
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-primary" />
                <span>Pending Join Requests</span>
                <Badge variant="secondary" className="ml-1 text-xs">
                  {pendingRequests.length}
                </Badge>
              </div>
            }
          >
            <div className="divide-y">
              {pendingRequests.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{r.player?.full_name}</span>
                      <span className="text-xs text-muted-foreground">{r.player?.email}</span>
                    </div>
                    {r.message && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
                        <MessageSquare className="h-3 w-3 shrink-0" />
                        &ldquo;{r.message}&rdquo;
                      </p>
                    )}
                    <div className="text-[11px] text-muted-foreground">
                      Requested on {new Date(r.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => approveRequest(r.id)}
                      className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => rejectRequest(r.id)}
                      className="gap-1.5 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Roster (${roster.data?.length ?? 0})`}>
          {me?.isAdmin && (
            <div className="mb-4 flex gap-2">
              <Select value={pick} onValueChange={setPick}>
                <SelectTrigger aria-label="Choose a player to add">
                  <SelectValue
                    placeholder={candidates.length ? "Choose a player" : "No more players to add"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name} · {p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={add} disabled={!pick}>
                <UserPlus className="h-4 w-4" /> Add
              </Button>
            </div>
          )}
          {roster.isLoading ? (
            <Loading rows={3} />
          ) : roster.data?.length ? (
            <ul className="divide-y">
              {roster.data.map((r) => (
                <li key={r.player_id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="font-medium flex items-center gap-1.5">
                      {r.full_name}
                      {r.player_id === me?.id && (
                        <span className="text-[10px] rounded bg-primary/20 px-1 text-primary">
                          You
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Joined {new Date(r.joined_at).toLocaleDateString()}
                    </div>
                  </div>
                  {me?.isAdmin && (
                    <Confirm
                      title={`Remove ${r.full_name}?`}
                      text="They'll no longer be part of this team."
                      label="Remove"
                      onConfirm={() => removeMember(r.player_id)}
                      trigger={
                        <Button variant="ghost" size="icon" aria-label={`Remove ${r.full_name}`}>
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No players on this team yet.
            </p>
          )}
        </Card>

        <Card title="Fixtures & results">
          {matches.isLoading ? (
            <Loading rows={3} />
          ) : (
            <MatchList matches={teamMatches} empty="No matches for this team yet." />
          )}
        </Card>
      </div>

      {editing && <TeamDialog team={t} onClose={() => setEditing(false)} />}

      {/* Request to Join Dialog */}
      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request to Join {t.name}</DialogTitle>
            <DialogDescription>
              Submit a request to the club administrators to join this team for {t.sport?.name}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitJoinRequest} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="req-message">Note for Administrator (optional)</Label>
              <Textarea
                id="req-message"
                placeholder="Mention your preferred position, experience, or jersey number…"
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                maxLength={300}
                rows={3}
              />
              <p className="text-right text-[11px] text-muted-foreground">
                {requestMessage.length}/300
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRequestDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submittingRequest}>
                {submittingRequest ? "Submitting…" : "Send Join Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
