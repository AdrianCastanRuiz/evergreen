import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../../generated/prisma';

export const ROLES_KEY = 'roles';

// AD-12: User.role is a Prisma enum, never a free string, and every
// role-restricted route declares its allowed roles explicitly here.
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
