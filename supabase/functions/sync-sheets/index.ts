// Supabase Edge Function: sync-sheets
// Synchronizes player registrations to Google Sheets via Google Sheets API v4 using a Google Service Account.
// Runs with server-side privilege (service role). Never exposes private keys to the client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SyncJobRequest {
  jobId?: string;
  registrationId?: string;
  syncAllPending?: boolean;
}

// Convert PEM format RS256 private key to CryptoKey
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const cleanPem = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s+/g, "");

  const binaryDer = Uint8Array.from(atob(cleanPem), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

// Base64Url encode string or Uint8Array
function base64UrlEncode(input: string | Uint8Array): string {
  const str = typeof input === "string" ? input : String.fromCharCode(...input);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Generate Google OAuth2 Access Token using Service Account JWT
async function getGoogleAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaim = base64UrlEncode(JSON.stringify(claimSet));
  const message = `${encodedHeader}.${encodedClaim}`;

  const key = await importPrivateKey(privateKeyPem);
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(message),
  );

  const signature = base64UrlEncode(new Uint8Array(signatureBuffer));
  const jwt = `${message}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    throw new Error(`Google OAuth error: ${tokenRes.status} ${errorBody}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const spreadsheetId = Deno.env.get("GOOGLE_SHEETS_SPREADSHEET_ID") || "";
    const clientEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL") || "";
    const privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY") || "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if Google credentials are configured
    const isConfigured = Boolean(spreadsheetId && clientEmail && privateKey);

    let body: SyncJobRequest = {};
    try {
      body = await req.json();
    } catch {
      // Body optional
    }

    // Query pending jobs or specific requested job
    let query = supabase.from("sheets_sync_jobs").select(`
        id,
        status,
        attempts,
        registration_id,
        registration:player_registrations(
          id,
          status,
          created_at,
          sport:sports(name),
          player:profiles(id, full_name, email)
        )
      `);

    if (body.jobId) {
      query = query.eq("id", body.jobId);
    } else if (body.registrationId) {
      query = query.eq("registration_id", body.registrationId);
    } else {
      query = query.in("status", ["pending", "failed"]);
    }

    const { data: jobs, error: jobsError } = await query;

    if (jobsError) {
      return new Response(JSON.stringify({ error: jobsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isConfigured) {
      // Mark jobs as not_configured so admins know configuration is needed
      if (jobs && jobs.length > 0) {
        const jobIds = jobs.map((j) => j.id);
        const regIds = jobs.map((j) => j.registration_id);
        await supabase
          .from("sheets_sync_jobs")
          .update({
            status: "not_configured",
            last_error:
              "Missing GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, or GOOGLE_PRIVATE_KEY in secrets.",
            updated_at: new Date().toISOString(),
          })
          .in("id", jobIds);

        await supabase
          .from("player_registrations")
          .update({
            sheets_sync_status: "not_configured",
            updated_at: new Date().toISOString(),
          })
          .in("id", regIds);
      }

      return new Response(
        JSON.stringify({
          configured: false,
          syncedCount: 0,
          message:
            "Google Sheets credentials are not configured. To enable synchronization, add GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_PRIVATE_KEY to your Supabase Edge Function secrets.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Authenticate with Google Sheets API
    const accessToken = await getGoogleAccessToken(clientEmail, privateKey);

    // Ensure the sheet "Registrations" exists and has headers
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!metaRes.ok) {
      const err = await metaRes.text();
      throw new Error(`Cannot access spreadsheet ${spreadsheetId}: ${err}`);
    }

    const meta = await metaRes.json();
    const sheetExists = meta.sheets?.some((s: any) => s.properties?.title === "Registrations");

    if (!sheetExists) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: { title: "Registrations" },
              },
            },
          ],
        }),
      });
    }

    // Read existing rows to guarantee idempotency and avoid duplicates
    const existingRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Registrations!A:G`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const existingData = await existingRes.json();
    const rows: string[][] = existingData.values || [];

    // Ensure header row exists
    const expectedHeaders = [
      "Timestamp",
      "Registration ID",
      "Player ID",
      "Player Name",
      "Email",
      "Sport",
      "Registration Status",
    ];

    if (rows.length === 0) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Registrations!A1:G1?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: [expectedHeaders] }),
        },
      );
      rows.push(expectedHeaders);
    }

    let syncedCount = 0;
    const errors: Array<{ jobId: string; error: string }> = [];

    for (const job of jobs || []) {
      const reg = job.registration as any;
      if (!reg) continue;

      try {
        const regId = reg.id;
        const existingRowIndex = rows.findIndex((r) => r[1] === regId);
        const rowValues = [
          new Date(reg.created_at).toISOString(),
          reg.id,
          reg.player?.id || "",
          reg.player?.full_name || "",
          reg.player?.email || "",
          reg.sport?.name || "",
          reg.status,
        ];

        if (existingRowIndex >= 0) {
          // Row already exists - update it idempotently (1-indexed in Sheets)
          const sheetRowNumber = existingRowIndex + 1;
          const updateRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Registrations!A${sheetRowNumber}:G${sheetRowNumber}?valueInputOption=USER_ENTERED`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ values: [rowValues] }),
            },
          );
          if (!updateRes.ok) {
            throw new Error(`Failed to update row: ${await updateRes.text()}`);
          }
        } else {
          // Append new row
          const appendRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Registrations!A:G:append?valueInputOption=USER_ENTERED`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ values: [rowValues] }),
            },
          );
          if (!appendRes.ok) {
            throw new Error(`Failed to append row: ${await appendRes.text()}`);
          }
          rows.push(rowValues);
        }

        // Mark as synced in Supabase
        await supabase
          .from("sheets_sync_jobs")
          .update({
            status: "synced",
            attempts: (job.attempts || 0) + 1,
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        await supabase
          .from("player_registrations")
          .update({
            sheets_sync_status: "synced",
            updated_at: new Date().toISOString(),
          })
          .eq("id", reg.id);

        syncedCount++;
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        errors.push({ jobId: job.id, error: errMsg });

        await supabase
          .from("sheets_sync_jobs")
          .update({
            status: "failed",
            attempts: (job.attempts || 0) + 1,
            last_error: errMsg,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        await supabase
          .from("player_registrations")
          .update({
            sheets_sync_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", reg.id);
      }
    }

    return new Response(
      JSON.stringify({
        configured: true,
        totalJobs: jobs?.length || 0,
        syncedCount,
        errors,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
