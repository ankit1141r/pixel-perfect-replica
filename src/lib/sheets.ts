import { supabase } from "@/integrations/supabase/client";

export interface SyncSheetsResult {
  configured: boolean;
  totalJobs?: number;
  syncedCount?: number;
  message?: string;
  errors?: Array<{ jobId: string; error: string }>;
  error?: string;
}

/**
 * Triggers Google Sheets synchronization via Supabase Edge Function `sync-sheets`.
 * Server-side execution keeps Google Service Account credentials strictly private.
 */
export async function triggerSheetsSync(options?: {
  jobId?: string;
  registrationId?: string;
}): Promise<SyncSheetsResult> {
  try {
    const { data, error } = await supabase.functions.invoke<SyncSheetsResult>("sync-sheets", {
      body: options ?? {},
    });

    if (error) {
      return {
        configured: false,
        error: error.message,
        message: error.message || "Failed to call Google Sheets sync service.",
      };
    }

    return (
      data ?? {
        configured: false,
        message: "No response from synchronization function.",
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return {
      configured: false,
      error: msg,
      message: msg,
    };
  }
}
