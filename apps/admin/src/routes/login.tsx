import * as React from "react";
import { createRoute, Link, Navigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, NetworkError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { rootRoute } from "@/routes/root";

// Direct child of rootRoute (NOT protectedLayoutRoute) — this screen must
// never render inside the admin Shell (Story 1.14 AC #1).
export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginScreen,
});

// Portal login (Story 1.14 AC #1-#5). Error-message branching mirrors
// apps/mobile/src/app/login.tsx's handleSubmit exactly — same three
// messages, for consistency across clients.
function LoginScreen() {
  const { status, signIn, sessionEndReason, clearSessionEndReason } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [emailTouched, setEmailTouched] = React.useState(false);
  const [passwordTouched, setPasswordTouched] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Read directly off the URL, same as reset-password.tsx's token — a
  // one-shot flag from reset-password.tsx's post-confirm redirect, not
  // worth a typed route search schema.
  const [resetSuccess] = React.useState(
    () => new URLSearchParams(window.location.search).get("reset") === "success",
  );

  // A session-expiry landing must be heard once, not on every later visit
  // to /login — clear it when this screen unmounts (mirrors mobile).
  React.useEffect(() => {
    return () => clearSessionEndReason();
  }, [clearSessionEndReason]);

  // AC #1: an already-authenticated visitor never sees the login form.
  if (status === "authenticated") {
    return <Navigate to="/" />;
  }

  const emailError =
    emailTouched && !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email address" : null;
  const passwordError =
    passwordTouched && password.length === 0 ? "Password is required" : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailTouched(true);
    setPasswordTouched(true);
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length === 0) return;

    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setError("Too many attempts. Please wait a minute and try again.");
        } else if (err.status === 401) {
          setError("Invalid email or password");
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
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-sm rounded-md border border-border bg-background p-8 shadow-sm"
        noValidate
      >
        {/* {typography.hero}: Roboto 600, 34px (DESIGN.md) — no dedicated
            fontSize token in tailwind.config.ts (only fontFamily.hero), so
            the size/weight/line-height/tracking are set as literal values
            here, same convention as apps/mobile's one-off DESIGN.md values. */}
        <h1 className="font-hero text-[34px] font-semibold leading-[1.15] tracking-[-0.01em] text-foreground">
          Evergreen Admin
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to your account</p>

        <label htmlFor="email" className="mt-6 block text-sm font-medium text-foreground">
          Email
        </label>
        <Input
          id="email"
          className="mt-1"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTouched(true)}
          autoComplete="email"
          autoFocus
          disabled={submitting}
        />
        {emailError ? <p className="mt-1 text-sm text-destructive">{emailError}</p> : null}

        <label htmlFor="password" className="mt-4 block text-sm font-medium text-foreground">
          Password
        </label>
        <Input
          id="password"
          className="mt-1"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setPasswordTouched(true)}
          autoComplete="current-password"
          disabled={submitting}
        />
        {passwordError ? <p className="mt-1 text-sm text-destructive">{passwordError}</p> : null}

        {resetSuccess ? (
          <p className="mt-4 text-sm text-foreground">
            Your password has been updated. Sign in with your new password.
          </p>
        ) : null}

        {sessionEndReason === "expired" ? (
          <p className="mt-4 text-sm text-foreground">
            Your session ended. Please log in again.
          </p>
        ) : null}

        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="mt-6 w-full" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
        <Button type="button" variant="outline" className="mt-3 w-full" asChild>
          <Link to="/request-password-reset">Forgot your password?</Link>
        </Button>
      </form>
    </div>
  );
}
