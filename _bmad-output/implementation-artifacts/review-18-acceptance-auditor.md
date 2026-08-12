# Review — Acceptance Auditor

Corré esta review en una sesión separada de opencode con acceso al proyecto `D:\projects\evergreen\evergreen`. Trabajo: leer el spec y los docs de contexto, compararlos contra el diff, y verificar violaciones de criterios de aceptación, reglas o principios. Reportar SOLO violaciones reales (archivo:línea, qué AC/regla viola, evidencia). Si todo cumple, reportar que no hay violaciones. No inventes requisitos.

## Leer PRIMERO (en este orden)

1. `_bmad-output/implementation-artifacts/spec-18-password-reset-activation.md` — el spec de este cambio (fuente principal de ACs).
2. `_bmad-output/implementation-artifacts/spec-1-7-password-reset-activation.md` — spec backend de referencia (contrato, NO editar).
3. `_bmad-output/implementation-artifacts/spec-17-login-refresh-splash.md` — spec previo (patrones que NO deben romperse).
4. `_bmad-output/implementation-artifacts/epic-1-context.md` — contexto del epic.

## El diff (rama feature/mobile-1-7-password-reset, baseline ee11755)

- `apps/mobile/src/app/_layout.tsx` — +2 pantallas `Stack.Protected`: `request-password-reset` (guard `status === "unauthenticated"`) y `reset-password` (guard `status !== "authenticated"`), declaradas DESPUÉS de `login`.
- `apps/mobile/src/app/login.tsx` — link "Forgot your password?" + banner `reset=success` vía `useLocalSearchParams`.
- `apps/mobile/src/app/request-password-reset.tsx` (nuevo) — email → `POST /auth/password-reset` (público).
- `apps/mobile/src/app/reset-password.tsx` (nuevo) — token de `useLocalSearchParams`, `POST /auth/password-reset/confirm`.

## Verificar específicamente contra los AC del spec

1. **Request-reset**: ¿success copy genérico sin filtrar existencia de cuenta? ¿429 → mensaje claro sin auto-retry? ¿network error inline con email preservado? ¿usa `request<T>` (no `authedRequest`)?
2. **Reset-password**: ¿token vencido/usado/desconocido → mensaje del backend verbatim + camino a pedir nuevo link? ¿429 sin auto-retry? ¿network error con campos preservados? ¿éxito → replace a `/login` con confirmación?
3. **Árbol del Stack ESTABLE**: ¿mismas pantallas en el mismo orden en cada render? ¿solo cambian los guards? (regla crítica de spec-17).
4. **¿`reset-password` alcanzable durante `resolving`** para cold-start deep link?
5. **¿`login` sigue siendo el anchor no-autenticado** (no romper sign-out → login)?
6. **¿No se toca keychain/AsyncStorage** en el flujo? ¿tipos desde `@evergreen/shared-types`? ¿No hay auto-login desde confirm?
7. **¿El confirm no devuelve token pair** — el cliente navega a login, no intenta autenticar?
8. **Validación on-device**: ≥8 chars, match de passwords, antes de enviar.
9. **Todos los AC del spec-18** (lista en su sección `## Tasks & Acceptance` → `**Acceptance Criteria:**`).

## Formato de reporte

Reportá cada violación con: `archivo:línea`, qué AC/regla/principio viola, y evidencia concreta del código. Si no hay violaciones, reportá "No acceptance violations found".
