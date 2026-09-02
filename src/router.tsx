import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { installEarnRoomAi } from "./lib/ai";
import { installVisionEngine } from "./lib/intelligence/vision/provider";
import { routeTree } from "./routeTree.gen";

// Makes the Vision Engine the platform's active vision intelligence. Swapping
// in a real provider later happens here and nowhere else.
installVisionEngine();

// Registers the AI providers behind the orchestrator. Every AI request in the
// app routes through it; Phase 6B adds remote vendors at this same point.
installEarnRoomAi();


export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
