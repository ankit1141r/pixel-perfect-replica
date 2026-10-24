import { createFileRoute } from "@tanstack/react-router";
import { UserCog } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/sporty/PageShell";

export const Route = createFileRoute("/_authenticated/app/profile")({
  head: () => ({ meta: [{ title: "Profile — SPORTY" }, { name: "description", content: "Your account details." }, { property: "og:title", content: "Profile — SPORTY" }, { property: "og:description", content: "Your account details." }] }),
  component: () => (
    <>
      <PageHeader title="Profile" subtitle="Your account details." />
      <EmptyState icon={UserCog} title="Sign in required" text="Your profile will be editable once accounts are enabled." />
    </>
  ),
});
