import * as React from "react";
import { createRoute, Link } from "@tanstack/react-router";
import type { RequestPasswordResetRequest } from "@evergreen/shared-types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, NetworkError, request } from "@/lib/api";
import { rootRoute } from "@/routes/root";

// Web port of apps/mobile/src/app/request-password-reset.tsx (Story 1.7,
// FR3/NFR9). Direct child of rootRoute (not protectedLayoutRoute), same as
// login.tsx — must render without the Shell and regardless of current auth
// state.
export const requestPasswordResetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/request-password-reset",
  component: RequestPasswordResetScreen,
});

function RequestPasswordResetScreen() {
  const [email, setEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!email.trim()) {
      setError("Enter your email to receive a reset link.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: RequestPasswordResetRequest = { email: email.trim() };
      await request<void>("/auth/password-reset", { method: "POST", body });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setError("Too many attempts. Please wait a minute and try again.");
        } else {
          setError("Something went wrong. Please try again.");
        }
      } else if (err instanceof NetworkError) {
        setError("No network connection. Check your connection and try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex h-dvh items-center justify-center bg-muted/40 px-4">
        <div className="w-full max-w-sm rounded-md border border-border bg-background p-8 shadow-sm">
          <h1 className="font-hero text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] text-foreground">
            Check your email
          </h1>
          {/* Fire-and-forget on the backend (204 whether or not the email is
              registered) — this copy stays generic on purpose, no account
              enumeration (NFR9/AD-8). */}
          <p className="mt-2 text-sm text-muted-foreground">
            If an account is registered for that email, you&apos;ll receive a
            link to set a new password. It expires in 1 hour and can only be
            used once.
          </p>
          <Button className="mt-6 w-full" asChild>
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-muted/40 px-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-sm rounded-md border border-border bg-background p-8 shadow-sm"
        noValidate
      >
        <h1 className="font-hero text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] text-foreground">
          Reset your password
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the email you signed up with and we&apos;ll send you a link to
          set a new password.
        </p>

        <Label htmlFor="email" className="mt-6 block">
          Email
        </Label>
        <Input
          id="email"
          className="mt-1"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
          disabled={submitting}
        />

        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="mt-6 w-full" disabled={submitting}>
          {submitting ? "Sending…" : "Send reset link"}
        </Button>
        <Button type="button" variant="outline" className="mt-3 w-full" asChild>
          <Link to="/login">Back to sign in</Link>
        </Button>
      </form>
    </div>
  );
}
