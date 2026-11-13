"use client";

import { useState, useEffect, useRef } from "react";
import { SUGGESTED_QUESTIONS, type ChatMessage } from "@/lib/ai/askShared";
import { cx } from "@/components/ui";

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

interface ChatViewProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId?: string;
  initialQuestion?: string | null;
}

const STORAGE_KEY = "retell_ai_chat_sessions_v1";

const DEFAULT_QUESTIONS = [
  {
    q: "Why are calls failing in this period?",
    icon: "⚠️",
    desc: "Discover failure root causes, silent hangups, and dropped transfers.",
  },
  {
    q: "How can I improve my agent's success rate?",
    icon: "💡",
    desc: "Get prioritised fixes for prompt wording, latency, and call flow.",
  },
  {
    q: "Summarize call performance for this period",
    icon: "📊",
    desc: "Overview of total calls, talk time, booked appointments, and sentiment.",
  },
];

export default function ChatView({ isOpen, onClose, workspaceId = "demo", initialQuestion }: ChatViewProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load chat sessions from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: ChatSession[] = JSON.parse(saved);
        if (parsed.length > 0) {
          setSessions(parsed);
          setCurrentSessionId(parsed[0].id);
          return;
        }
      }
    } catch (e) {
      console.error("Failed to load chats from localStorage:", e);
    }

    // Default initial session
    const initialSession: ChatSession = {
      id: "session_" + Date.now(),
      title: "New Conversation",
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    setSessions([initialSession]);
    setCurrentSessionId(initialSession.id);
  }, []);

  // Save sessions to localStorage when updated
  const saveSessions = (updated: ChatSession[]) => {
    setSessions(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated.slice(0, 30)));
    } catch (e) {
      console.error("Failed to save chats to localStorage:", e);
    }
  };

  const currentSession = sessions.find((s) => s.id === currentSessionId) || sessions[0];

  // Auto scroll to bottom of messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, currentSession?.messages.length, loading]);

  // Handle external initial question trigger
  useEffect(() => {
    if (isOpen && initialQuestion && !loading) {
      handleSend(initialQuestion);
    }
  }, [isOpen, initialQuestion]);

  // Escape key closes modal
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const startNewChat = () => {
    const newSession: ChatSession = {
      id: "session_" + Date.now(),
      title: "New Chat",
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    saveSessions([newSession, ...sessions]);
    setCurrentSessionId(newSession.id);
    setShowHistory(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = sessions.filter((s) => s.id !== id);
    if (remaining.length === 0) {
      const fresh: ChatSession = {
        id: "session_" + Date.now(),
        title: "New Chat",
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      saveSessions([fresh]);
      setCurrentSessionId(fresh.id);
    } else {
      saveSessions(remaining);
      if (currentSessionId === id) {
        setCurrentSessionId(remaining[0].id);
      }
    }
  };

  const handleSend = async (questionText: string) => {
    const q = questionText.trim();
    if (!q || loading) return;

    setInput("");
    setLoading(true);

    const userMessage: ChatMessage = { role: "user", content: q };
    const curMessages = currentSession?.messages || [];
    const updatedMessages = [...curMessages, userMessage];

    // Optimistically update current session
    let updatedSession: ChatSession = {
      ...(currentSession || {
        id: "session_" + Date.now(),
        title: q.slice(0, 36) + "...",
        updatedAt: new Date().toISOString(),
        messages: [],
      }),
      title: curMessages.length === 0 ? (q.length > 40 ? q.slice(0, 38) + "…" : q) : currentSession.title,
      updatedAt: new Date().toISOString(),
      messages: updatedMessages,
    };

    saveSessions(sessions.map((s) => (s.id === updatedSession.id ? updatedSession : s)));

    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          history: curMessages.slice(-10),
          workspaceId,
        }),
      });

      const data = await res.json();
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.answer || "I could not analyze the data for that question.",
      };

      updatedSession = {
        ...updatedSession,
        messages: [...updatedMessages, assistantMessage],
        updatedAt: new Date().toISOString(),
      };

      saveSessions(
        sessions.map((s) => (s.id === updatedSession.id ? updatedSession : s))
      );
    } catch (err) {
      console.error("Ask AI query failed:", err);
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: "Sorry, I had trouble contacting the intelligence assistant. Please try again.",
      };
      updatedSession = {
        ...updatedSession,
        messages: [...updatedMessages, errorMessage],
      };
      saveSessions(
        sessions.map((s) => (s.id === updatedSession.id ? updatedSession : s))
      );
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (!isOpen) return null;

  const messages = currentSession?.messages || [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-zinc-900/40 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Panel */}
      <div className="relative w-full max-w-xl bg-white shadow-2xl h-full flex flex-col z-10 border-l border-zinc-200 animate-in slide-in-from-right duration-200">
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between gap-3 bg-white shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-8 w-8 rounded-lg text-white bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="m12 2 1.9 5.6a3 3 0 0 0 1.9 1.9L21.4 11.4 15.8 13.3a3 3 0 0 0-1.9 1.9L12 20.8l-1.9-5.6a3 3 0 0 0-1.9-1.9L2.6 11.4l5.6-1.9a3 3 0 0 0 1.9-1.9Z" /></svg>
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-zinc-900 text-sm tracking-tight truncate">
                  Ask AI Analyst
                </h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200/80">
                  Beta
                </span>
              </div>
              <p className="text-xs text-zinc-500 truncate">
                Real-time answers from your voice call recordings & transcripts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowHistory(!showHistory)}
              title="Chat History"
              className={cx(
                "p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition",
                showHistory
                  ? "bg-zinc-100 border-zinc-300 text-zinc-900"
                  : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              )}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="hidden sm:inline">History ({sessions.length})</span>
            </button>

            <button
              onClick={startNewChat}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-semibold shadow-xs transition"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New Chat</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition"
              aria-label="Close Ask AI"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* History Dropdown / Drawer View */}
        {showHistory && (
          <div className="bg-zinc-50 border-b border-zinc-200 p-3 max-h-60 overflow-y-auto shrink-0 space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 px-2 pb-1">
              <span>Past Conversations</span>
              <button
                onClick={startNewChat}
                className="text-purple-600 hover:text-purple-800 normal-case font-medium hover:underline text-xs"
              >
                + New Chat
              </button>
            </div>
            {sessions.map((sess) => {
              const active = sess.id === currentSessionId;
              return (
                <div
                  key={sess.id}
                  onClick={() => {
                    setCurrentSessionId(sess.id);
                    setShowHistory(false);
                  }}
                  className={cx(
                    "flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition",
                    active
                      ? "bg-white text-zinc-900 border border-zinc-300 shadow-xs rounded-lg"
                      : "text-zinc-600 hover:bg-zinc-200/60"
                  )}
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span className="truncate">{sess.title}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-zinc-400">
                      {new Date(sess.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <button
                      onClick={(e) => deleteSession(sess.id, e)}
                      title="Delete chat"
                      className="p-1 hover:text-rose-600 text-zinc-400 rounded-md"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Chat Messages Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-zinc-50/50">
          {messages.length === 0 ? (
            <div className="py-6 space-y-6">
              {/* Welcoming Card */}
              <div className="bg-white border border-zinc-200/70 rounded-xl p-5 shadow-card text-center space-y-3">
                <div className="w-12 h-12 rounded-xl text-white bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mx-auto shadow-card">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="m12 2 1.9 5.6a3 3 0 0 0 1.9 1.9L21.4 11.4 15.8 13.3a3 3 0 0 0-1.9 1.9L12 20.8l-1.9-5.6a3 3 0 0 0-1.9-1.9L2.6 11.4l5.6-1.9a3 3 0 0 0 1.9-1.9Z" /></svg>
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900 text-base">
                    What would you like to know?
                  </h3>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1 leading-relaxed">
                    Ask questions in plain English. The AI evaluates real audio duration, sentiment, AI quality score, and transfer logs.
                  </p>
                </div>
              </div>

              {/* Default 3 Built-in Questions */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-zinc-500 px-1">
                  Default Suggested Questions
                </div>
                <div className="grid gap-2.5">
                  {DEFAULT_QUESTIONS.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(item.q)}
                      className="w-full text-left bg-white hover:bg-purple-50/40 border border-zinc-200/70 hover:border-purple-300 rounded-xl p-3.5 transition group shadow-card flex items-start gap-3"
                    >
                      <span className="text-lg shrink-0 mt-0.5">{item.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-zinc-900 group-hover:text-purple-900 transition flex items-center justify-between">
                          <span>{item.q}</span>
                          <span className="text-purple-600 opacity-0 group-hover:opacity-100 transition text-xs font-semibold">
                            Ask →
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, index) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={index}
                    className={cx("flex flex-col gap-1.5", isUser ? "items-end" : "items-start")}
                  >
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-[11px] font-semibold text-zinc-500">
                        {isUser ? "You" : "Ask AI Analyst"}
                      </span>
                    </div>

                    <div
                      className={cx(
                        "rounded-xl px-4 py-3 text-sm max-w-[92%] leading-relaxed shadow-card relative group",
                        isUser
                          ? "bg-zinc-900 text-white rounded-tr-xs"
                          : "bg-white border border-zinc-200/90 text-zinc-800 rounded-tl-xs"
                      )}
                    >
                      {/* Markdown-style formatted body */}
                      <div className="space-y-2 whitespace-pre-wrap">
                        {renderFormattedText(msg.content)}
                      </div>

                      {!isUser && (
                        <div className="mt-2.5 pt-2 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-400">
                          <span>Voice Analytics Grounded</span>
                          <button
                            onClick={() => copyToClipboard(msg.content, index)}
                            className="hover:text-zinc-700 flex items-center gap-1 transition"
                            title="Copy answer"
                          >
                            {copiedIndex === index ? (
                              <span className="text-emerald-600 font-medium">✓ Copied</span>
                            ) : (
                              <span>Copy</span>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex items-start gap-2.5">
                  <div className="rounded-xl px-4 py-3 bg-white border border-zinc-200/70 text-zinc-500 text-sm shadow-card flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-purple-600 animate-bounce" />
                      <span className="w-2 h-2 rounded-full bg-purple-600 animate-bounce [animation-delay:0.2s]" />
                      <span className="w-2 h-2 rounded-full bg-purple-600 animate-bounce [animation-delay:0.4s]" />
                    </div>
                    <span className="text-xs font-medium text-zinc-600">
                      Analyzing call metrics & root causes…
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Input Area */}
        <div className="p-4 border-t border-zinc-200 bg-white shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="space-y-2"
          >
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about calls, latency, drop-offs, or improvements…"
                disabled={loading}
                className="w-full pl-4 pr-12 py-2.5 bg-zinc-50 border border-zinc-200/70 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-600/30 focus:border-purple-600 transition"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className={cx(
                  "absolute right-1.5 p-1.5 rounded-lg text-white transition",
                  input.trim() && !loading
                    ? "bg-zinc-900 hover:bg-zinc-800"
                    : "bg-zinc-300 cursor-not-allowed opacity-60"
                )}
                aria-label="Send query"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
              <span>Press Enter to send</span>
              <span>Ask AI evaluates your calls and transcripts</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/** Formats simple markdown bold and bullet points cleanly in React */
function renderFormattedText(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    // Check if line is bullet
    const isBullet = line.startsWith("- ");
    const isNumbered = /^\d+\.\s/.test(line);

    // Format bold **text**
    const parts = line.split(/(\*\*.*?\*\*)/g);
    const renderedParts = parts.map((part, pIdx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={pIdx} className="font-semibold text-zinc-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });

    if (isBullet) {
      return (
        <div key={i} className="flex items-start gap-2 pl-1">
          <span className="text-purple-600 font-semibold">•</span>
          <span className="flex-1">{renderedParts}</span>
        </div>
      );
    }

    if (isNumbered) {
      return (
        <div key={i} className="pl-1 font-medium">
          {renderedParts}
        </div>
      );
    }

    if (!line.trim()) {
      return <div key={i} className="h-1.5" />;
    }

    return <div key={i}>{renderedParts}</div>;
  });
}

