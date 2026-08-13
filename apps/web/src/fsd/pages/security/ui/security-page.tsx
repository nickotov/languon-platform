import { AuthShell, SecuritySettings } from "@/fsd/features/auth";

export function SecurityPage() {
  return (
    <AuthShell eyebrow="Your account" title="Security settings">
      <SecuritySettings />
    </AuthShell>
  );
}
