"use client";

import { createContext, useContext, useState } from "react";
import type { Role } from "@/lib/roles";
import ChatView from "@/components/ai/ChatView";

interface AppContextType {
  role: Role;
  isAskAiOpen: boolean;
  openAskAi: (question?: string) => void;
  closeAskAi: () => void;
  canEdit: boolean;
  workspaceId: string;
  /** The /demo app is showing a connected Retell account instead of sample data. */
  live: boolean;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({
  children,
  initialRole = "admin",
  workspaceId = "demo",
  live = false,
}: {
  children: React.ReactNode;
  initialRole?: Role;
  workspaceId?: string;
  live?: boolean;
}) {
  const [isAskAiOpen, setIsAskAiOpen] = useState(false);
  const [initialQuestion, setInitialQuestion] = useState<string | null>(null);

  const openAskAi = (question?: string) => {
    if (question) setInitialQuestion(question);
    setIsAskAiOpen(true);
  };

  const closeAskAi = () => {
    setIsAskAiOpen(false);
    setInitialQuestion(null);
  };

  return (
    <AppContext.Provider value={{ role: initialRole, isAskAiOpen, openAskAi, closeAskAi, canEdit: true, workspaceId, live }}>
      {children}
      <ChatView isOpen={isAskAiOpen} onClose={closeAskAi} workspaceId={workspaceId} initialQuestion={initialQuestion} />
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) {
    // Graceful fallback for components used outside AppProvider
    return { role: "admin", isAskAiOpen: false, openAskAi: () => {}, closeAskAi: () => {}, canEdit: true, workspaceId: "demo", live: false };
  }
  return ctx;
}
