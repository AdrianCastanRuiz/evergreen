# Review — Edge Case Hunter

Corré esta review en una sesión separada de opencode con acceso al proyecto `D:\projects\evergreen\evergreen`. Trabajo: caminar cada camino de ramificación y condición límite del cambio; reportar SOLO edge cases reales y no manejados (archivo:línea + por qué importa). No reportes cosas ya manejadas ni mejoras opcionales.

## El cambio (rama feature/mobile-1-7-password-reset, baseline ee11755)

- `apps/mobile/src/app/_layout.tsx` — dos pantallas nuevas en el Stack estable: `request-password-reset` (guard `status === "unauthenticated"`) y `reset-password` (guard `status !== "authenticated"`), declaradas DESPUÉS de `login`.
- `apps/mobile/src/app/request-password-reset.tsx` (nuevo) — email → `POST /auth/password-reset`.
- `apps/mobile/src/app/reset-password.tsx` (nuevo) — token de `useLocalSearchParams`, `POST /auth/password-reset/confirm`.
- `apps/mobile/src/app/login.tsx` — link "Forgot your password?" (`router.push("/request-password-reset")`) + banner `reset=success`.

## Archivos a leer para contexto

- `apps/mobile/src/lib/api.ts` — `request<T>` (timeout 15s), `ApiError`/`NetworkError`; nota: 204 → `undefined as T`.
- `apps/mobile/src/lib/auth.tsx` — `AuthProvider`: status `resolving | authenticated | unauthenticated`, `resolveSession`.
- `apps/mobile/src/app/_layout.tsx` — `RootNavigator` con `Stack.Protected` (árbol ESTABLE — regla crítica: no cambiar el árbol entre renders).
- `apps/mobile/src/app/login.tsx`
- `apps/mobile/src/app/index.tsx` (splash)
- `apps/api/src/auth/auth.controller.ts` — contrato de los endpoints.
- `apps/api/src/auth/password-reset.service.ts` — mensajes de error reales.
- `apps/mobile/app.json` — scheme `evergreen`.

## Hipótesis a explorar (no es lista exhaustiva)

1. **Deep link en cold start + guard `status !== "authenticated"`**: usuario toca el link del email → app arranca en `resolving`. ¿`reset-password` queda accesible? ¿Qué pasa si `/auth/me` resuelve a `authenticated` MIENTRAS el usuario está escribiendo la nueva password en `reset-password`? ¿El guard se apaga y el Stack redirige al anchor (home/onboarding), perdiendo el token y la entrada? ¿Es un race aceptable o un bug real?
2. **`token` como string[]**: `useLocalSearchParams<{ token?: string }>` — si la URL trae `?token=a&token=b`, expo-router entrega `string[]`. ¿El código lo maneja? ¿Qué pasa si el token contiene caracteres URL-encoded?
3. **expo-router procesa la URL inicial antes de que el Stack esté listo**: ¿la ruta `/reset-password` está registrada a tiempo durante el primer render en cold start, o el deep link se pierde y cae al anchor (login)?
4. **Doble submit rápido** en confirm (doble tap): el guard `if (submitting) return` + `disabled` — ¿hay ventana entre `setSubmitting(true)` y el render del `disabled` donde un segundo tap dispara otro confirm? El segundo confirm fallaría con 400 (token single-use) → ¿mensaje confuso "invalid or expired" tras un éxito que sí ocurrió? ¿El usuario queda atascado en reset-password en vez de ir a login?
5. **429 copy vs throttle real**: request 5/min y confirm 10/min. ¿El copy "wait a minute" es consistente con el throttle real (1 min window)?
6. **request-password-reset `submitted` state**: tras éxito, el email se pierde al volver con "Back to sign in" → `router.replace("/login")`. ¿Correcto?
7. **`router.replace("/request-password-reset")` desde reset-password sin token**: ¿el Stack puede navegar ahí estando `unauthenticated`? ¿El anchor sigue siendo login?
8. **Keyboard**: ¿el botón queda oculto por el teclado en algún device?
9. **Datos preservados en network error**: en reset-password, si falla la red, ¿password y confirm se preservan (estado local no se resetea)? En request-password-reset ¿el email se preserva?
10. **Login `reset` param**: si el usuario llega a login con `?reset=success` y luego navega a otra parte, ¿el banner queda persistido al volver? (los params de la ruta persisten hasta que cambia la ruta).

## Formato de reporte

Reportá cada hallazgo con: severidad (alta/media/baja), `archivo:línea`, escenario concreto, y por qué es un defecto real no manejado.
