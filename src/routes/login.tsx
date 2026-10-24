import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/sporty/AuthCard";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — SPORTY" },
      { name: "description", content: "Sign in to manage your teams, fixtures and registrations." },
      { property: "og:title", content: "Sign in — SPORTY" },
      { property: "og:description", content: "Sign in to manage your teams, fixtures and registrations." },
    ],
  }),
  component: Login,
});

function Login() {
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your SPORTY account."
      footer={<>New player? <Link to="/signup" className="text-primary hover:underline">Create an account</Link></>}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); toast.info("Sign-in arrives in the next stage."); }}>
        <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" required autoComplete="email" /></div>
        <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" required autoComplete="current-password" /></div>
        <Button type="submit" className="w-full">Sign in</Button>
      </form>
    </AuthCard>
  );
}
