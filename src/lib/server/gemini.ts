export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
export class AIServiceError extends Error {
  kind: string;
  status: number;
  constructor(kind: string, message: string, status = 503) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}
export function configuredModel() {
  return (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
}
export async function generateGeminiJSON(
  prompt: string,
  jsonSchema: Record<string, unknown>,
  image?: { mimeType: string; data: string },
) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key)
    throw new AIServiceError(
      "configuration",
      "AI is not connected yet. Countiva support can check the connection.",
    );
  const requested = configuredModel();
  const models = [
    requested,
    ...(requested === DEFAULT_GEMINI_MODEL ? [] : [DEFAULT_GEMINI_MODEL]),
  ];
  for (let index = 0; index < models.length; index++) {
    const model = models[index];
    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  ...(image ? [{ inlineData: image }] : []),
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              responseJsonSchema: jsonSchema,
              maxOutputTokens: 4096,
            },
          }),
          signal: AbortSignal.timeout(35000),
        },
      );
    } catch {
      throw new AIServiceError(
        "connection",
        "The AI connection timed out. Please try again shortly.",
      );
    }
    if (response.status === 404 && index + 1 < models.length) continue;
    if (!response.ok) {
      const kind =
        response.status === 429
          ? "quota"
          : [400, 401, 403].includes(response.status)
            ? "credentials"
            : response.status === 404
              ? "model"
              : "provider";
      throw new AIServiceError(
        kind,
        kind === "quota"
          ? "AI is at its usage limit. Your recorded business figures remain available; try again later."
          : kind === "credentials" || kind === "model"
            ? "The AI connection needs attention. Countiva support can check it."
            : "The AI service is temporarily unavailable. Please try again later.",
      );
    }
    const body = await response.json();
    const text = (body.candidates?.[0]?.content?.parts || [])
      .filter(
        (p: { thought?: boolean; text?: string }) =>
          !p.thought && typeof p.text === "string",
      )
      .map((p: { text: string }) => p.text)
      .join("")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    try {
      return { data: JSON.parse(text), model };
    } catch {
      throw new AIServiceError(
        "output",
        "AI did not return a usable result. Please try again.",
      );
    }
  }
  throw new AIServiceError("model", "No supported AI model is available.");
}
