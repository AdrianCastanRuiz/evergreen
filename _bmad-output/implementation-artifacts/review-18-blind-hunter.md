# Review — Blind Hunter (adversarial)

Corré esta review en una sesión separada de opencode (idealmente con otro LLM), pegando SOLO el diff de abajo. No des spec, ni contexto, ni acceso al proyecto. Pedí hallazgos adversarios: bugs de lógica/navegación, seguridad, copy engañoso, race conditions, defectos reales.

## Diff

```
diff --git a/apps/mobile/src/app/_layout.tsx b/apps/mobile/src/app/_layout.tsx
index 1906053..217a185 100644
--- a/apps/mobile/src/app/_layout.tsx
+++ b/apps/mobile/src/app/_layout.tsx
@@ -46,6 +46,14 @@ function RootNavigator() {
       </Stack.Protected>
       <Stack.Protected guard={status === "unauthenticated"}>
         <Stack.Screen name="login" />
+        <Stack.Screen name="request-password-reset" />
+      </Stack.Protected>
+      {/* reset-password must stay reachable while "resolving" so a cold-start
+          deep link from the emailed reset URL lands here before /auth/me
+          settles — but never while a session is active. Declared after login
+          so the unauthenticated anchor stays login. */}
+      <Stack.Protected guard={status !== "authenticated"}>
+        <Stack.Screen name="reset-password" />
       </Stack.Protected>
     </Stack>
   );
diff --git a/apps/mobile/src/app/login.tsx b/apps/mobile/src/app/login.tsx
index 11ebc23..191aff4 100644
--- a/apps/mobile/src/app/login.tsx
+++ b/apps/mobile/src/app/login.tsx
@@ -1,4 +1,5 @@
 import * as React from "react";
+import { router, useLocalSearchParams } from "expo-router";
 import {
   ActivityIndicator,
   KeyboardAvoidingView,
@@ -20,6 +21,7 @@ import { useAuth } from "@/lib/auth";
 // re-typing). No token is issued on any failure.
 export default function LoginScreen() {
   const { signIn } = useAuth();
+  const { reset } = useLocalSearchParams<{ reset?: string }>();
   const [email, setEmail] = React.useState("");
   const [password, setPassword] = React.useState("");
   const [submitting, setSubmitting] = React.useState(false);
@@ -96,6 +98,12 @@ export default function LoginScreen() {
           editable={!submitting}
         />
 
+        {reset === "success" ? (
+          <Text className="mt-4 text-foreground">
+            Your password has been updated. Sign in with your new password.
+          </Text>
+        ) : null}
+
         {error ? (
           <Text className="mt-4 text-destructive">{error}</Text>
         ) : null}
@@ -112,6 +120,15 @@ export default function LoginScreen() {
             <Text>Sign in</Text>
           )}
         </Button>
+
+        <Button
+          className="mt-4"
+          variant="outline"
+          disabled={submitting}
+          onPress={() => router.push("/request-password-reset")}
+        >
+          <Text>Forgot your password?</Text>
+        </Button>
       </ScrollView>
     </KeyboardAvoidingView>
   );
diff --git a/apps/mobile/src/app/request-password-reset.tsx b/apps/mobile/src/app/request-password-reset.tsx
new file mode 100644
index 0000000..a81d8cc
--- /dev/null
+++ b/apps/mobile/src/app/request-password-reset.tsx
@@ -0,0 +1,147 @@
+import * as React from "react";
+import { router } from "expo-router";
+import {
+  ActivityIndicator,
+  KeyboardAvoidingView,
+  Platform,
+  ScrollView,
+  Text as RNText,
+} from "react-native";
+
+import { Button } from "@/components/ui/button";
+import { Input } from "@/components/ui/input";
+import { Text } from "@/components/ui/text";
+import { ApiError, NetworkError, request } from "@/lib/api";
+
+// Request-reset screen (FR3/NFR9): email → POST /auth/password-reset. The
+// endpoint is fire-and-forget and answers 204 whether or not the email is
+// registered, so the success copy stays generic and never reveals account
+// existence (no enumeration oracle). On success we show a confirmation and
+// point back to login.
+export default function RequestPasswordResetScreen() {
+  const [email, setEmail] = React.useState("");
+  const [submitting, setSubmitting] = React.useState(false);
+  const [submitted, setSubmitted] = React.useState(false);
+  const [error, setError] = React.useState<string | null>(null);
+
+  const handleSubmit = async () => {
+    if (submitting) return;
+    if (!email.trim()) {
+      setError("Enter your email to receive a reset link.");
+      return;
+    }
+    setSubmitting(true);
+    setError(null);
+    try {
+      await request<undefined>("/auth/password-reset", {
+        method: "POST",
+        body: { email: email.trim() },
+      });
+      setSubmitted(true);
+    } catch (err) {
+      if (err instanceof ApiError) {
+        if (err.status === 429) {
+          setError("Too many attempts. Please wait a minute and try again.");
+        } else {
+          setError("Something went wrong. Please try again.");
+        }
+      } else if (err instanceof NetworkError) {
+        setError("No network connection. Check your connection and try again.");
+      } else {
+        setError("Something went wrong. Please try again.");
+      }
+    } finally {
+      setSubmitting(false);
+    }
+  };
+
+  if (submitted) {
+    return (
+      <KeyboardAvoidingView
+        className="flex-1 bg-background"
+        behavior={Platform.OS === "ios" ? "padding" : undefined}
+      >
+        <ScrollView
+          contentContainerClassName="flex-1 justify-center px-gutter py-8"
+          keyboardShouldPersistTaps="handled"
+        >
+          <Text className="font-hero text-[28px] font-semibold leading-[34px] tracking-[-0.01em] text-foreground">
+            Check your email
+          </Text>
+          <Text className="mt-2 text-muted-foreground">
+            If an account is registered for that email, {"you'll"} receive a link
+            to set a new password. It expires in 1 hour and can only be used
+            once.
+          </Text>
+          <Button
+            className="mt-8"
+            size="lg"
+            onPress={() => router.replace("/login")}
+          >
+            <Text>Back to sign in</Text>
+          </Button>
+        </ScrollView>
+      </KeyboardAvoidingView>
+    );
+  }
+
+  return (
+    <KeyboardAvoidingView
+      className="flex-1 bg-background"
+      behavior={Platform.OS === "ios" ? "padding" : undefined}
+    >
+      <ScrollView
+        contentContainerClassName="flex-1 justify-center px-gutter py-8"
+        keyboardShouldPersistTaps="handled"
+      >
+        <Text className="font-hero text-[28px] font-semibold leading-[34px] tracking-[-0.01em] text-foreground">
+          Reset your password
+        </Text>
+        <Text className="mt-2 text-muted-foreground">
+          Enter the email you signed up with and {"we'll"} send you a link to set a
+          new password.
+        </Text>
+
+        <RNText className="mt-8 text-sm font-body font-medium text-foreground">
+          Email
+        </RNText>
+        <Input
+          className="mt-2"
+          value={email}
+          onChangeText={setEmail}
+          placeholder="you@example.com"
+          autoCapitalize="none"
+          autoCorrect={false}
+          keyboardType="email-address"
+          autoComplete="email"
+          editable={!submitting}
+        />
+
+        {error ? (
+          <Text className="mt-4 text-destructive">{error}</Text>
+        ) : null}
+
+        <Button
+          className="mt-8"
+          size="lg"
+          disabled={submitting}
+          onPress={handleSubmit}
+        >
+          {submitting ? (
+            <ActivityIndicator className="text-primary-foreground" />
+          ) : (
+            <Text>Send reset link</Text>
+          )}
+        </Button>
+
+        <Button
+          className="mt-4"
+          variant="outline"
+          onPress={() => router.replace("/login")}
+        >
+          <Text>Back to sign in</Text>
+        </Button>
+      </ScrollView>
+    </KeyboardAvoidingView>
+  );
+}
diff --git a/apps/mobile/src/app/reset-password.tsx b/apps/mobile/src/app/reset-password.tsx
new file mode 100644
index 0000000..9715f15
--- /dev/null
+++ b/apps/mobile/src/app/reset-password.tsx
@@ -0,0 +1,153 @@
+import { router, useLocalSearchParams } from "expo-router";
+import * as React from "react";
+import {
+  ActivityIndicator,
+  KeyboardAvoidingView,
+  Platform,
+  ScrollView,
+  Text as RNText,
+} from "react-native";
+
+import { Button } from "@/components/ui/button";
+import { Input } from "@/components/ui/input";
+import { Text } from "@/components/ui/text";
+import { ApiError, NetworkError, request } from "@/lib/api";
+
+// Set-password screen (NFR9/AD-8): consumes the single-use token from the
+// emailed deep link (?token=...), POSTs it to /auth/password-reset/confirm,
+// and on success replaces to login. The backend answers with one generic
+// "invalid or expired" message for expired/used/unknown tokens (no oracle),
+// which we show verbatim alongside a "request a new link" path. The endpoint
+// never returns a token pair, so a successful confirm always lands on login.
+export default function ResetPasswordScreen() {
+  const { token } = useLocalSearchParams<{ token?: string }>();
+
+  const [password, setPassword] = React.useState("");
+  const [confirm, setConfirm] = React.useState("");
+  const [submitting, setSubmitting] = React.useState(false);
+  const [error, setError] = React.useState<string | null>(null);
+
+  const handleSubmit = async () => {
+    if (submitting) return;
+    if (!token) {
+      setError("This link is invalid or has expired. Please request a new one.");
+      return;
+    }
+    if (password.length < 8) {
+      setError("Password must be at least 8 characters.");
+      return;
+    }
+    if (password !== confirm) {
+      setError("Passwords don't match.");
+      return;
+    }
+    setSubmitting(true);
+    setError(null);
+    try {
+      await request<{ success: true }>("/auth/password-reset/confirm", {
+        method: "POST",
+        body: { token, newPassword: password },
+      });
+      router.replace({ pathname: "/login", params: { reset: "success" } });
+    } catch (err) {
+      if (err instanceof ApiError) {
+        if (err.status === 429) {
+          setError("Too many attempts. Please wait a minute and try again.");
+        } else if (err.status === 400) {
+          setError(err.message);
+        } else {
+          setError("Something went wrong. Please try again.");
+        }
+      } else if (err instanceof NetworkError) {
+        setError("No network connection. Check your connection and try again.");
+      } else {
+        setError("Something went wrong. Please try again.");
+      }
+    } finally {
+      setSubmitting(false);
+    }
+  };
+
+  const requestNewLink = () => {
+    router.replace("/request-password-reset");
+  };
+
+  return (
+    <KeyboardAvoidingView
+      className="flex-1 bg-background"
+      behavior={Platform.OS === "ios" ? "padding" : undefined}
+    >
+      <ScrollView
+        contentContainerClassName="flex-1 justify-center px-gutter py-8"
+        keyboardShouldPersistTaps="handled"
+      >
+        <Text className="font-hero text-[28px] font-semibold leading-[34px] tracking-[-0.01em] text-foreground">
+          Set a new password
+        </Text>
+        <Text className="mt-2 text-muted-foreground">
+          Choose a new password for your Evergreen account.
+        </Text>
+
+        {!token ? (
+          <>
+            <Text className="mt-8 text-destructive">
+              This link is invalid or has expired. Please request a new one.
+            </Text>
+            <Button
+              className="mt-8"
+              size="lg"
+              onPress={requestNewLink}
+            >
+              <Text>Request a new link</Text>
+            </Button>
+          </>
+        ) : (
+          <>
+            <RNText className="mt-8 text-sm font-body font-medium text-foreground">
+              New password
+            </RNText>
+            <Input
+              className="mt-2"
+              value={password}
+              onChangeText={setPassword}
+              placeholder="At least 8 characters"
+              secureTextEntry
+              autoComplete="new-password"
+              editable={!submitting}
+            />
+
+            <RNText className="mt-4 text-sm font-body font-medium text-foreground">
+              Confirm password
+            </RNText>
+            <Input
+              className="mt-2"
+              value={confirm}
+              onChangeText={setConfirm}
+              placeholder="Repeat your password"
+              secureTextEntry
+              autoComplete="new-password"
+              editable={!submitting}
+            />
+
+            {error ? (
+              <Text className="mt-4 text-destructive">{error}</Text>
+            ) : null}
+
+            <Button
+              className="mt-8"
+              size="lg"
+              disabled={submitting}
+              onPress={handleSubmit}
+            >
+              {submitting ? (
+                <ActivityIndicator className="text-primary-foreground" />
+              ) : (
+                <Text>Set password</Text>
+              )}
+            </Button>
+          </>
+        )}
+      </ScrollView>
+    </KeyboardAvoidingView>
+  );
+}
```

## Contrato backend (referencia, no editar)

- `POST /auth/password-reset` → 204 siempre (no revela si el email existe), `@Throttle` 5/min, body vacío.
- `POST /auth/password-reset/confirm` → 200 `{ success: true }`, `@Throttle` 10/min. Token vencido/usado/desconocido → 400 `"This link is invalid or has expired. Please request a new one."`

## Formato de reporte

Reportá cada hallazgo con: severidad (alta/media/baja), archivo:línea del diff, explicación precisa de por qué es un defecto real. No reportes ruido cosmético sin impacto.
