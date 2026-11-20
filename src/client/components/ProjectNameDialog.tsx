import { useState } from "react";
import { FormDialog } from "@/client/components/FormDialog";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { errorMessage } from "@/client/lib/errors";

/** Names a new project or renames one. */
export function ProjectNameDialog({
  title,
  submitLabel,
  initialName = "",
  onSubmit,
  onClose,
}: {
  title: string;
  submitLabel: string;
  initialName?: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError("Give the project a name");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit(name.trim());
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  return (
    <FormDialog
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="project-name-form"
            pending={pending}
            data-testid="project-save"
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        id="project-name-form"
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Label htmlFor="project-name">Name</Label>
        <Input
          id="project-name"
          autoFocus
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          data-testid="project-name-input"
        />
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </form>
    </FormDialog>
  );
}
