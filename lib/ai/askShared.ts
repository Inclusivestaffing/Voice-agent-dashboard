// Ask AI: types and limits shared by the chat panel (browser) and the API routes (server).

export interface ChatMessage { role: "user" | "assistant"; content: string }
export interface ChatSummary { id: string; title: string; updated_at: string }
export interface Chat extends ChatSummary { messages: ChatMessage[] }

/** The three built-in questions shown on a new chat. */
export const SUGGESTED_QUESTIONS = [
  "Why are calls failing in this period?",
  "How can I improve my agent's success rate?",
  "Summarize call performance for this period",
] as const;

export const MAX_QUESTION_CHARS = 2000;
/** Messages kept per chat (and sent as history). Older turns are dropped. */
export const MAX_CHAT_MESSAGES = 40;
export const MAX_CHATS_LISTED = 50;

export const chatTitle = (q: string) => {
  const t = q.trim().replace(/\s+/g, " ");
  return t.length > 60 ? `${t.slice(0, 57)}…` : t || "New chat";
};

/** Validates a client-supplied message list (demo chats live in the browser). */
export function cleanHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const m of raw.slice(-MAX_CHAT_MESSAGES)) {
    if (!m || typeof m !== "object") continue;
    const { role, content } = m as Record<string, unknown>;
    if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim()) {
      out.push({ role, content: content.slice(0, 8000) });
    }
  }
  // The API needs alternating turns that start with the user.
  while (out.length && out[0].role !== "user") out.shift();
  return out.filter((m, i) => i === 0 || m.role !== out[i - 1].role);
}
