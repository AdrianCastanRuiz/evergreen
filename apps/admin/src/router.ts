import { createRouter } from "@tanstack/react-router";

import { indexRoute } from "@/routes/index";
import { loginRoute } from "@/routes/login";
import { protectedLayoutRoute } from "@/routes/protected-layout";
import { rootRoute } from "@/routes/root";

const routeTree = rootRoute.addChildren([
  protectedLayoutRoute.addChildren([indexRoute]),
  loginRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
