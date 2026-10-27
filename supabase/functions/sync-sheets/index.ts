// Supabase Edge Function: sync-sheets
// Synchronizes player details, team details, registrations, and club data
// to Google Sheets via Google Sheets API v4 using a Google Service Account.
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

async function syncTableToSheet(
  spreadsheetId: string,
  accessToken: string,
  sheetTitle: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
  existingSheets: string[],
) {
  if (!existingSheets.includes(sheetTitle)) {
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
              properties: { title: sheetTitle },
            },
          },
        ],
      }),
    });
    existingSheets.push(sheetTitle);
  }

  const values = [headers, ...rows.map((r) => r.map((c) => (c == null ? "" : String(c))))];
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${sheetTitle}'!A1?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    },
  );
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

    // Read spreadsheet metadata
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!metaRes.ok) {
      const err = await metaRes.text();
      throw new Error(`Cannot access spreadsheet ${spreadsheetId}: ${err}`);
    }

    const meta = await metaRes.json();
    const existingSheets: string[] = meta.sheets?.map((s: any) => s.properties?.title) || [];

    // 1. Synchronize PLAYERS sheet
    const { data: profiles } = await supabase.from("profiles").select("*").order("full_name");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const rolesMap: Record<string, string> = {};
    roles?.forEach((r) => {
      rolesMap[r.user_id] = rolesMap[r.user_id] ? `${rolesMap[r.user_id]}, ${r.role}` : r.role;
    });

    await syncTableToSheet(
      spreadsheetId,
      accessToken,
      "Players",
      ["Player ID", "Full Name", "Email", "Role", "Created At"],
      (profiles || []).map((p) => [
        p.id,
        p.full_name,
        p.email,
        rolesMap[p.id] || "player",
        p.created_at,
      ]),
      existingSheets,
    );

    // 2. Synchronize TEAMS sheet
    const { data: teams } = await supabase
      .from("teams")
      .select("*, sport:sports(name)")
      .order("name");
    await syncTableToSheet(
      spreadsheetId,
      accessToken,
      "Teams",
      ["Team ID", "Team Name", "Sport", "Created At"],
      (teams || []).map((t) => [t.id, t.name, t.sport?.name || "", t.created_at]),
      existingSheets,
    );

    // 3. Synchronize TEAM MEMBERS sheet
    const { data: members } = await supabase
      .from("team_members")
      .select("*, team:teams(name, sport:sports(name)), player:profiles(full_name, email)")
      .order("joined_at", { ascending: false });
    await syncTableToSheet(
      spreadsheetId,
      accessToken,
      "Team_Members",
      ["Team Name", "Sport", "Player Name", "Player Email", "Player ID", "Joined At"],
      (members || []).map((m: any) => [
        m.team?.name || "",
        m.team?.sport?.name || "",
        m.player?.full_name || "",
        m.player?.email || "",
        m.player_id,
        m.joined_at,
      ]),
      existingSheets,
    );

    // 4. Synchronize TEAM JOIN REQUESTS sheet
    const { data: joinReqs } = await supabase
      .from("team_join_requests")
      .select("*, team:teams(name, sport:sports(name)), player:profiles(full_name, email)")
      .order("created_at", { ascending: false });
    await syncTableToSheet(
      spreadsheetId,
      accessToken,
      "Team_Join_Requests",
      [
        "Request ID",
        "Team Name",
        "Sport",
        "Player Name",
        "Email",
        "Status",
        "Player Message / Experience",
        "Created At",
      ],
      (joinReqs || []).map((q: any) => [
        q.id,
        q.team?.name || "",
        q.team?.sport?.name || "",
        q.player?.full_name || "",
        q.player?.email || "",
        q.status,
        q.message || "",
        q.created_at,
      ]),
      existingSheets,
    );

    // 5. Synchronize SPORTS sheet
    const { data: sports } = await supabase.from("sports").select("*").order("name");
    await syncTableToSheet(
      spreadsheetId,
      accessToken,
      "Sports",
      ["Sport ID", "Sport Name", "Description", "Created At"],
      (sports || []).map((s) => [s.id, s.name, s.description || "", s.created_at]),
      existingSheets,
    );

    // 6. Synchronize REGISTRATIONS sheet
    const { data: registrations } = await supabase
      .from("player_registrations")
      .select("*, sport:sports(name), player:profiles(full_name, email)")
      .order("created_at", { ascending: false });

    await syncTableToSheet(
      spreadsheetId,
      accessToken,
      "Registrations",
      [
        "Registration ID",
        "Player Name",
        "Player Email",
        "Sport",
        "Registration Status",
        "Sheets Sync Status",
        "Created At",
      ],
      (registrations || []).map((r: any) => [
        r.id,
        r.player?.full_name || "",
        r.player?.email || "",
        r.sport?.name || "",
        r.status,
        r.sheets_sync_status,
        r.created_at,
      ]),
      existingSheets,
    );

    // Mark pending jobs as synced in database
    for (const job of jobs || []) {
      await supabase
        .from("sheets_sync_jobs")
        .update({
          status: "synced",
          attempts: (job.attempts || 0) + 1,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      if (job.registration_id) {
        await supabase
          .from("player_registrations")
          .update({
            sheets_sync_status: "synced",
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.registration_id);
      }
    }

    return new Response(
      JSON.stringify({
        configured: true,
        totalJobs: jobs?.length || 0,
        syncedCount: registrations?.length || 0,
        sheetsUpdated: [
          "Players",
          "Teams",
          "Team_Members",
          "Team_Join_Requests",
          "Sports",
          "Registrations",
        ],
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
