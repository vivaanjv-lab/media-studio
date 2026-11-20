import { Link } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { Button } from "@/client/components/ui/button";

/** An address with no page behind it, or a record that isn't the viewer's. */
export function NotFound({ title = "Page not found" }: { title?: string }) {
  return (
    <AppShell>
      <EmptyState
        variant="plain"
        icon={SearchX}
        title={title}
        action={
          <Button nativeButton={false} render={<Link to="/" />}>
            Go to projects
          </Button>
        }
      />
    </AppShell>
  );
}
