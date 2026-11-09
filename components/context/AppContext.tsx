"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { type Role, VIEW_AS_COOKIE, isRole, canEdit, canSeeInsights } from "@/lib/roles";
import ChatView from "@/components/ai/ChatView";

interface AppContextType {
  role: Role;
  setRole: (role: Role) => void;
  isAskAiOpen: boolean;
  openAskAi: (question?: string) => void;
  closeAskAi: () => void;
  canEdit: boolean;
  canSeeInsights: boolean;
  workspaceId: string;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({
  children,
  initialRole = "admin",
  workspaceId = "demo",
}: {
  children: React.ReactNode;
  initialRole?: Role;
  workspaceId?: string;
}) {
  const [role, setRoleState] = useState<Role>(initialRole);
  const [isAskAiOpen, setIsAskAiOpen] = useState(false);
  const [initialQuestion, setInitialQuestion] = useState<string | null>(null);

  // Sync role from cookie on mount
  useEffect(() => {
    try {
      const match = document.cookie.match(new RegExp(`(^| )${VIEW_AS_COOKIE}=([^;]+)`));
      if (match && isRole(match[2])) {
        setRoleState(match[2]);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const setRole = (newRole: Role) => {
    setRoleState(newRole);
    try {
      document.cookie = `${VIEW_AS_COOKIE}=${newRole}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
    } catch (e) {
      console.error(e);
    }
  };

  const openAskAi = (question?: string) => {
    if (question) setInitialQuestion(question);
    setIsAskAiOpen(true);
  };

  const closeAskAi = () => {
    setIsAskAiOpen(false);
    setInitialQuestion(null);
  };

  return (
    <AppContext.Provider
      value={{
        role,
        setRole,
        isAskAiOpen,
        openAskAi,
        closeAskAi,
        canEdit: canEdit(role),
        canSeeInsights: canSeeInsights(role),
        workspaceId,
      }}
    >
      {children}
      <ChatView
        isOpen={isAskAiOpen}
        onClose={closeAskAi}
        workspaceId={workspaceId}
        initialQuestion={initialQuestion}
      />
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    // Graceful fallback for components used outside AppProvider
    return {
      role: "admin" as Role,
      setRole: () => {},
      isAskAiOpen: false,
      openAskAi: () => {},
      closeAskAi: () => {},
      canEdit: true,
      canSeeInsights: true,
      workspaceId: "demo",
    };
  }
  return ctx;
}

