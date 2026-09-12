import { createFileRoute } from "@tanstack/react-router";

/** Short race-commentary lines are synthesized here and cached by the client. */
export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Voiceover is not configured", { status: 500 });

        let text = "";
        try {
          const body = (await request.json()) as { text?: unknown };
          if (typeof body.text === "string") text = body.text.trim();
        } catch {
          return new Response("Invalid request body", { status: 400 });
        }
        if (!text || text.length > 200) return new Response("Invalid text", { status: 400 });

        const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini-tts",
            input: text,
            voice: "ash",
            instructions:
              "Energetic arcade race announcer shouting over engine noise. Fast, punchy, excited, very short delivery.",
            response_format: "mp3",
            stream_format: "audio",
            speed: 1.15,
          }),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          console.error(`TTS failed [${response.status}]: ${detail}`);
          return new Response(detail || "Voiceover failed", { status: response.status });
        }

        return new Response(response.body, {
          headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" },
        });
      },
    },
  },
});
