import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marks a route as reachable with no Bearer token at all (login, refresh,
// invite-code redemption, password-reset request/consume). Every other
// route is authenticated by default via the global JwtAuthGuard (AD-12).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
