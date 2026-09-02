import * as React from "react";
import { createRoute, Link, useNavigate } from "@tanstack/react-router";
import type { ConfirmPasswordResetRequest } from "@evergreen/shared-types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, NetworkError, request } from "@/lib/api";
import { rootRoute } from "@/routes/root";

// Web port of apps/mobile/src/app/reset-password.tsx (Story 1.7, NFR9/AD-8).
// Consumes the single-use token from RESET_PASSWORD_URL's emailed link
// (?token=...) — the SAME link/flow for both invited-account activation
// (Stories 1.3/1.4/1.5's "click here to set your password" email) and
// self-service forgot-password (request-password-reset.tsx); the backend
// makes no distinction between the two. Direct child of rootRoute (not
// protectedLayoutRoute), same as login.tsx — must render without the Shell,
// and regardless of current auth state (a stale session must never block
// setting a password).
export const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password",
  component: ResetPasswordScreen,
});

function ResetPasswordScreen() {
  const navigate = useNavigate();
  // Read directly off the URL rather than a typed route search schema — the
  // token is opaque and read exactly once on mount, same as the emailed
  // link mobile's equivalent screen consumes.
  const [token] = React.useState(
    () => new URLSearchParams(window.location.search).get("token"),
  );

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tokenRejected, setTokenRejected] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!token) {
      setTokenRejected(true);
      setError("This link is invalid or has expired. Please request a new one.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setTokenRejected(false);
    try {
      const body: ConfirmPasswordResetRequest = { token, newPassword: password };
      await request<{ success: true }>("/auth/password-reset/confirm", {
        method: "POST",
        body,
      });
      // The endpoint never returns a token pair — a successful confirm
      // always lands on login, never straight into the portal.
      void navigate({ to: "/login", search: { reset: "success" } });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setError("Too many attempts. Please wait a minute and try again.");
        } else if (err.status === 400) {
          // The backend answers one generic "invalid or expired" message
          // for expired/used/unknown tokens (no oracle) — shown verbatim.
          setTokenRejected(true);
          setError(err.message);
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

  return (
    <div className="flex h-dvh items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm rounded-md border border-border bg-background p-8 shadow-sm">
        <h1 className="font-hero text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] text-foreground">
          Set a new password
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose a new password for your Evergreen account.
        </p>

        {!token || tokenRejected ? (
          <>
            <p className="mt-6 text-sm text-destructive">
              {error ?? "This link is invalid or has expired. Please request a new one."}
            </p>
            <Button className="mt-6 w-full" asChild>
              <Link to="/request-password-reset">Request a new link</Link>
            </Button>
          </>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} noValidate>
            <Label htmlFor="new-password" className="mt-6 block">
              New password
            </Label>
            <Input
              id="new-password"
              className="mt-1"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
              disabled={submitting}
            />

            <Label htmlFor="confirm-password" className="mt-4 block">
              Confirm password
            </Label>
            <Input
              id="confirm-password"
              className="mt-1"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              disabled={submitting}
            />

            {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

            <Button type="submit" className="mt-6 w-full" disabled={submitting}>
              {submitting ? "Setting password…" : "Set password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
