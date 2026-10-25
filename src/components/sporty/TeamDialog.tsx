import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { playersQuery, rosterQuery, sportsQuery } from "@/lib/data";
import { fieldErrors, teamSchema } from "@/lib/validation";

export type TeamEdit = { id: string; name: string; sport_id: string; description: string | null };

export function TeamDialog({
  team,
  defaultSport,
  onClose,
}: {
  team: TeamEdit | null;
  defaultSport?: string | undefined;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const sports = useQuery(sportsQuery);
  const players = useQuery(playersQuery);
  const existingRoster = useQuery({
    ...rosterQuery(team?.id ?? ""),
    enabled: !!team?.id,
  });

  const [sportId, setSportId] = useState(team?.sport_id ?? defaultSport ?? "");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [playerFilter, setPlayerFilter] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existingRoster.data) {
      setSelectedPlayerIds(existingRoster.data.map((r) => r.player_id));
    }
  }, [existingRoster.data]);

  const filteredPlayers = (players.data ?? []).filter((p) => {
    const q = playerFilter.toLowerCase().trim();
    if (!q) return true;
    return p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
  });

  function togglePlayer(id: string) {
    setSelectedPlayerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function selectAllFiltered() {
    const newIds = new Set(selectedPlayerIds);
    filteredPlayers.forEach((p) => newIds.add(p.id));
    setSelectedPlayerIds(Array.from(newIds));
  }

  function clearAll() {
    setSelectedPlayerIds([]);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = teamSchema.safeParse({
      name: fd.get("name"),
      sport_id: sportId,
      description: fd.get("description") ?? "",
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setBusy(true);
    try {
      if (team) {
        const { error: updateErr } = await supabase
          .from("teams")
          .update(parsed.data)
          .eq("id", team.id);
        if (updateErr) throw updateErr;

        const { data: currentMembers, error: fetchErr } = await supabase
          .from("team_members")
          .select("player_id")
          .eq("team_id", team.id);
        if (fetchErr) throw fetchErr;

        const currentIds = new Set((currentMembers ?? []).map((m) => m.player_id));
        const toAdd = selectedPlayerIds.filter((id) => !currentIds.has(id));
        const toRemove = [...currentIds].filter((id) => !selectedPlayerIds.includes(id));

        if (toAdd.length > 0) {
          const { error: addErr } = await supabase
            .from("team_members")
            .insert(toAdd.map((player_id) => ({ team_id: team.id, player_id })));
          if (addErr) throw addErr;

          // Auto-approve pending join requests for players assigned by admin
          await supabase
            .from("team_join_requests")
            .update({ status: "approved", updated_at: new Date().toISOString() })
            .eq("team_id", team.id)
            .in("player_id", toAdd)
            .eq("status", "pending");
        }

        if (toRemove.length > 0) {
          const { error: removeErr } = await supabase
            .from("team_members")
            .delete()
            .eq("team_id", team.id)
            .in("player_id", toRemove);
          if (removeErr) throw removeErr;
        }

        toast.success("Team updated");
      } else {
        const { data: created, error: createErr } = await supabase
          .from("teams")
          .insert(parsed.data)
          .select("id")
          .single();
        if (createErr) throw createErr;

        if (selectedPlayerIds.length > 0 && created) {
          const { error: memberErr } = await supabase.from("team_members").insert(
            selectedPlayerIds.map((player_id) => ({
              team_id: created.id,
              player_id,
            })),
          );
          if (memberErr) {
            toast.warning(`Team created, but some players failed to assign: ${memberErr.message}`);
          } else {
            toast.success(`Team created with ${selectedPlayerIds.length} player(s)`);
          }
        } else {
          toast.success("Team created");
        }
      }

      qc.invalidateQueries();
      onClose();
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      toast.error(
        error?.code === "23505"
          ? "That sport already has a team with this name"
          : (error?.message ?? "Failed to save team"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{team ? "Edit team" : "New team"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={team?.name}
              placeholder="e.g. Thunderbolts"
              aria-invalid={!!errors["name"]}
            />
            {errors["name"] && <p className="text-sm text-destructive">{errors["name"]}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sport">Sport</Label>
            <Select value={sportId} onValueChange={setSportId}>
              <SelectTrigger id="sport">
                <SelectValue placeholder="Pick a sport" />
              </SelectTrigger>
              <SelectContent>
                {sports.data?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors["sport_id"] && <p className="text-sm text-destructive">{errors["sport_id"]}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Optional team notes or division details"
              defaultValue={team?.description ?? ""}
            />
          </div>

          {/* Player assignment section */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Assign Players ({selectedPlayerIds.length} selected)
              </Label>
              <div className="flex gap-2 text-xs">
                {filteredPlayers.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={selectAllFiltered}
                  >
                    Select all
                  </Button>
                )}
                {selectedPlayerIds.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={clearAll}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Filter players"
                placeholder="Search player by name or email…"
                value={playerFilter}
                onChange={(e) => setPlayerFilter(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            <div className="max-h-44 overflow-y-auto rounded-lg border bg-card/60 p-2 space-y-1">
              {players.isLoading ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Loading players…</p>
              ) : !filteredPlayers.length ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  {playerFilter ? "No players match filter" : "No registered players available"}
                </p>
              ) : (
                filteredPlayers.map((p) => {
                  const isChecked = selectedPlayerIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 transition-colors text-xs ${
                        isChecked ? "bg-primary/10 text-primary-foreground" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden pr-2">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => togglePlayer(p.id)}
                          aria-label={`Select ${p.full_name}`}
                        />
                        <div className="truncate">
                          <span className="font-medium text-foreground">{p.full_name}</span>
                          <span className="ml-1.5 text-muted-foreground truncate">{p.email}</span>
                        </div>
                      </div>
                      {p.isAdmin && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          Admin
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save Team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
