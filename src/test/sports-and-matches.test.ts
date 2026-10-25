import { describe, expect, it } from "vitest";
import { sportSchema, teamSchema, matchSchema, teamJoinRequestSchema } from "@/lib/validation";
import { standings } from "@/lib/data";

describe("Sports and Team Validation", () => {
  it("validates sport names correctly", () => {
    expect(sportSchema.safeParse({ name: "Cricket" }).success).toBe(true);
    expect(sportSchema.safeParse({ name: "" }).success).toBe(false);
    expect(sportSchema.safeParse({ name: "a".repeat(61) }).success).toBe(false);
  });

  it("validates team names and sport uuid", () => {
    const validUuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(teamSchema.safeParse({ name: "Thunderbolts", sport_id: validUuid }).success).toBe(true);
    expect(teamSchema.safeParse({ name: "", sport_id: validUuid }).success).toBe(false);
    expect(teamSchema.safeParse({ name: "Warriors", sport_id: "not-a-uuid" }).success).toBe(false);
  });

  it("validates team join requests and optional message length", () => {
    const validTeamId = "123e4567-e89b-12d3-a456-426614174000";
    expect(teamJoinRequestSchema.safeParse({ team_id: validTeamId }).success).toBe(true);
    expect(
      teamJoinRequestSchema.safeParse({
        team_id: validTeamId,
        message: "I would love to join as striker.",
      }).success,
    ).toBe(true);
    expect(
      teamJoinRequestSchema.safeParse({
        team_id: "not-a-uuid",
      }).success,
    ).toBe(false);
    expect(
      teamJoinRequestSchema.safeParse({
        team_id: validTeamId,
        message: "a".repeat(301),
      }).success,
    ).toBe(false);
  });
});

describe("Match Validation", () => {
  const sportId = "123e4567-e89b-12d3-a456-426614174000";
  const team1 = "123e4567-e89b-12d3-a456-426614174001";
  const team2 = "123e4567-e89b-12d3-a456-426614174002";

  it("prevents a team from playing against itself", () => {
    const invalid = matchSchema.safeParse({
      sport_id: sportId,
      home_team_id: team1,
      away_team_id: team1,
      scheduled_at: "2026-11-01T14:00",
      status: "scheduled",
      home_score: "",
      away_score: "",
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues[0]?.message).toContain("A team can't play itself");
    }
  });

  it("requires scores for completed matches", () => {
    const missingScore = matchSchema.safeParse({
      sport_id: sportId,
      home_team_id: team1,
      away_team_id: team2,
      scheduled_at: "2026-11-01T14:00",
      status: "completed",
      home_score: "",
      away_score: "",
    });
    expect(missingScore.success).toBe(false);

    const validCompleted = matchSchema.safeParse({
      sport_id: sportId,
      home_team_id: team1,
      away_team_id: team2,
      scheduled_at: "2026-11-01T14:00",
      status: "completed",
      home_score: "3",
      away_score: "1",
    });
    expect(validCompleted.success).toBe(true);
  });
});

describe("Standings Calculation", () => {
  it("computes 3 pts for win, 1 for draw, 0 for loss", () => {
    const teamNames = { t1: "Lions", t2: "Tigers", t3: "Bears" };
    const matches = [
      {
        status: "completed" as const,
        home_team_id: "t1",
        away_team_id: "t2",
        home_score: 2,
        away_score: 1,
      },
      {
        status: "completed" as const,
        home_team_id: "t2",
        away_team_id: "t3",
        home_score: 0,
        away_score: 0,
      },
      {
        status: "scheduled" as const,
        home_team_id: "t3",
        away_team_id: "t1",
        home_score: null,
        away_score: null,
      },
    ];

    const result = standings(matches, teamNames);

    // Lions: 1 win, 3 pts
    // Tigers: 1 loss, 1 draw, 1 pt
    // Bears: 1 draw, 1 pt
    expect(result[0].team).toBe("Lions");
    expect(result[0].pts).toBe(3);
    expect(result[0].w).toBe(1);

    const bears = result.find((r) => r.team === "Bears");
    expect(bears?.pts).toBe(1);
    expect(bears?.d).toBe(1);

    const tigers = result.find((r) => r.team === "Tigers");
    expect(tigers?.pts).toBe(1);
    expect(tigers?.l).toBe(1);
  });
});
