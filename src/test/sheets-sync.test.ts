import { describe, expect, it, vi } from "vitest";
import { triggerSheetsSync } from "@/lib/sheets";
import { supabase } from "@/integrations/supabase/client";

describe("Google Sheets Synchronization Handling", () => {
  it("handles missing credentials gracefully reporting not configured", async () => {
    const proto = Object.getPrototypeOf(supabase.functions);
    const invokeSpy = vi.spyOn(proto, "invoke").mockResolvedValue({
      data: {
        configured: false,
        syncedCount: 0,
        message: "Google Sheets credentials are not configured.",
      },
      error: null,
    });

    const result = await triggerSheetsSync();

    expect(result.configured).toBe(false);
    expect(result.message).toContain("not configured");
    expect(invokeSpy).toHaveBeenCalledWith("sync-sheets", { body: {} });

    invokeSpy.mockRestore();
  });

  it("handles edge function network or execution error gracefully", async () => {
    const proto = Object.getPrototypeOf(supabase.functions);
    const invokeSpy = vi.spyOn(proto, "invoke").mockResolvedValue({
      data: null,
      error: { name: "FunctionsError", message: "Edge Function returned 500", context: {} },
    });

    const result = await triggerSheetsSync({ jobId: "job-123" });

    expect(result.configured).toBe(false);
    expect(result.error).toBe("Edge Function returned 500");

    invokeSpy.mockRestore();
  });

  it("returns successful sync report when configured and records are synced", async () => {
    const proto = Object.getPrototypeOf(supabase.functions);
    const invokeSpy = vi.spyOn(proto, "invoke").mockResolvedValue({
      data: {
        configured: true,
        totalJobs: 2,
        syncedCount: 2,
        errors: [],
      },
      error: null,
    });

    const result = await triggerSheetsSync({ registrationId: "reg-456" });

    expect(result.configured).toBe(true);
    expect(result.syncedCount).toBe(2);
    expect(result.errors).toEqual([]);

    invokeSpy.mockRestore();
  });
});
