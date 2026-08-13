import { AuthShell, SignupForm } from "@/fsd/features/auth";

export function SignupPage({ returnTo }: { returnTo?: string | undefined }) {
  return (
    <AuthShell eyebrow="Join Languon" title="Create an account">
      <SignupForm returnTo={returnTo} />
    </AuthShell>
  );
}
