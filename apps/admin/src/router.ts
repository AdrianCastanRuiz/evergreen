import { createRouter } from "@tanstack/react-router";

import { careHomesRoute } from "@/routes/care-homes";
import { familyRoute } from "@/routes/family";
import { indexRoute } from "@/routes/index";
import { loginRoute } from "@/routes/login";
import { profileRoute } from "@/routes/profile";
import { protectedLayoutRoute } from "@/routes/protected-layout";
import { requestPasswordResetRoute } from "@/routes/request-password-reset";
import { residentsRoute } from "@/routes/residents";
import { resetPasswordRoute } from "@/routes/reset-password";
import { rootRoute } from "@/routes/root";
import { staffRoute } from "@/routes/staff";
import { usersRoute } from "@/routes/users";

const routeTree = rootRoute.addChildren([
  protectedLayoutRoute.addChildren([
    indexRoute,
    staffRoute,
    familyRoute,
    residentsRoute,
    careHomesRoute,
    usersRoute,
    profileRoute,
  ]),
  loginRoute,
  requestPasswordResetRoute,
  resetPasswordRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
