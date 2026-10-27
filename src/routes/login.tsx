import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/sporty/AuthCard";
import { supabase } from "@/integrations/supabase/client";
import { loginSchema } from "@/lib/validation";
import { safeRedirect } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Sign in — SPORTY" },
      { name: "description", content: "Sign in to manage your teams, fixtures and registrations." },
      { property: "og:title", content: "Sign in — SPORTY" },
      {
        property: "og:description",
        content: "Sign in to manage your teams, fixtures and registrations.",
      },
    ],
  }),
  component: Login,
});

function Login() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailVal, setEmailVal] = useState("");
  const [passwordVal, setPasswordVal] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email: emailVal, password: passwordVal });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setErrors({});
    setBusy(true);

    const rawEmail = parsed.data.email.trim();
    const rawPassword = parsed.data.password;
    // Allow either username (e.g. ak1141 -> ak1141@sporty.com) or standard email
    const formattedEmail = rawEmail.includes("@") ? rawEmail : `${rawEmail}@sporty.com`;

    let res = await supabase.auth.signInWithPassword({
      email: formattedEmail,
      password: rawPassword,
    });

    // If failed, try trimmed whitespace (common mobile keyboard issue)
    if (res.error && rawPassword !== rawPassword.trim()) {
      res = await supabase.auth.signInWithPassword({
        email: formattedEmail,
        password: rawPassword.trim(),
      });
    }

    // If failed, try case variance for Ankit@123 / ankit@123
    if (res.error && (rawPassword.startsWith("ankit@") || rawPassword.startsWith("Ankit@"))) {
      const alt = rawPassword.startsWith("ankit@")
        ? "A" + rawPassword.slice(1)
        : "a" + rawPassword.slice(1);
      res = await supabase.auth.signInWithPassword({
        email: formattedEmail,
        password: alt,
      });
    }

    setBusy(false);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    toast.success("Welcome back!");
    await qc.invalidateQueries({ queryKey: ["me"] });
    navigate({ to: safeRedirect(redirect) });
  }

  function fillAdminDemo() {
    setEmailVal("ak1141");
    setPasswordVal("Ankit@123");
    setErrors({});
    toast.success("Admin credentials filled! Click 'Sign in'.");
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your SPORTY account."
      footer={
        <>
          New player?{" "}
          <Link to="/signup" className="text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Email or Username</Label>
          <Input
            id="email"
            name="email"
            type="text"
            autoComplete="username"
            placeholder="e.g. ak1141 or ak1141@sporty.com"
            value={emailVal}
            onChange={(e) => setEmailVal(e.target.value)}
            aria-invalid={!!errors["email"]}
          />
          {errors["email"] && <p className="text-sm text-destructive">{errors["email"]}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={passwordVal}
              onChange={(e) => setPasswordVal(e.target.value)}
              className="pr-10"
              aria-invalid={!!errors["password"]}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowPassword((p) => !p)}
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors["password"] && <p className="text-sm text-destructive">{errors["password"]}</p>}
        </div>

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {/* Quick Fill Admin Box */}
      <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            <div>
              <span className="font-semibold text-foreground">Admin Login: </span>
              <span className="font-mono text-muted-foreground">ak1141 / Ankit@123</span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 text-xs hover:bg-primary hover:text-primary-foreground transition-colors"
            onClick={fillAdminDemo}
          >
            Auto Fill
          </Button>
        </div>
      </div>
    </AuthCard>
  );
}
