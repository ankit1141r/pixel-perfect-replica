import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/sporty/AuthCard";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Join as a player — SPORTY" },
      { name: "description", content: "Create your SPORTY player account and register for sports." },
      { property: "og:title", content: "Join as a player — SPORTY" },
      { property: "og:description", content: "Create your SPORTY player account and register for sports." },
    ],
  }),
  component: Signup,
});

function Signup() {
  return (
    <AuthCard
      title="Join the club"
      subtitle="Create your player account."
      footer={<>Already registered? <Link to="/login" className="text-primary hover:underline">Sign in</Link></>}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); toast.info("Sign-up arrives in the next stage."); }}>
        <div className="space-y-2"><Label htmlFor="name">Full name</Label><Input id="name" required autoComplete="name" /></div>
        <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" required autoComplete="email" /></div>
        <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" minLength={8} required autoComplete="new-password" /></div>
        <Button type="submit" className="w-full">Create account</Button>
      </form>
    </AuthCard>
  );
}
