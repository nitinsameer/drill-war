import { createFileRoute } from "@tanstack/react-router";
import { DrillWarGame } from "@/components/drill-war-game";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Drill War — Underground Arcade Racing Game" },
      { name: "description", content: "Race underground, smash rock, collect treasure, and conquer the Drill War leaderboard." },
      { property: "og:title", content: "Drill War — Underground Arcade Racing Game" },
      { property: "og:description", content: "Dig deep, collect treasure, and win the underground arcade race." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  return <DrillWarGame />;
}
