import { AuthShell, ResetPasswordForm } from "@/fsd/features/auth";

export function ResetPasswordPage({ flowId }: { flowId?: string | undefined }) {
  return (
    <AuthShell eyebrow="Account recovery" title="Choose a new password">
      <ResetPasswordForm flowId={flowId} />
    </AuthShell>
  );
}
