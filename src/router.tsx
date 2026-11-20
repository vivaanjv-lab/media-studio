import { createRouter } from "@tanstack/react-router";
import { NotFound } from "./client/components/NotFound";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultNotFoundComponent: () => <NotFound />,
  });
}
