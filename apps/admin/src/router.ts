import { createRouter } from "@tanstack/react-router";

import { careHomesRoute } from "@/routes/care-homes";
import { indexRoute } from "@/routes/index";
import { loginRoute } from "@/routes/login";
import { protectedLayoutRoute } from "@/routes/protected-layout";
import { residentsRoute } from "@/routes/residents";
import { rootRoute } from "@/routes/root";
import { usersRoute } from "@/routes/users";

const routeTree = rootRoute.addChildren([
  protectedLayoutRoute.addChildren([indexRoute, residentsRoute, careHomesRoute, usersRoute]),
  loginRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
