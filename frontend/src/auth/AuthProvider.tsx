import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiEnvelope, apiGet } from "../api/client";
import { queryKeys } from "../api/queryKeys";
import type { CurrentUser } from "../api/types";

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [signedOut, setSignedOut] = useState(false);
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => apiGet<CurrentUser>("/api/v1/auth/me/", signal),
    retry: false,
  });
  const loginMutation = useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      apiEnvelope<CurrentUser>("/api/v1/auth/login/", {
        method: "POST",
        body: credentials,
      }).then((response) => response.data),
    onSuccess: (user) => {
      setSignedOut(false);
      queryClient.setQueryData(queryKeys.me, user);
    },
  });

  useEffect(() => {
    const clear = () => {
      setSignedOut(true);
      queryClient.setQueryData(queryKeys.me, null);
    };
    window.addEventListener("auth:unauthorized", clear);
    return () => window.removeEventListener("auth:unauthorized", clear);
  }, [queryClient]);

  const logout = async () => {
    setSignedOut(true);
    queryClient.setQueryData(queryKeys.me, null);
    try {
      await apiEnvelope<void>("/api/v1/auth/logout/", { method: "POST" });
    } finally {
      queryClient.clear();
      queryClient.setQueryData(queryKeys.me, null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user: signedOut ? null : me.data || null,
        loading: me.isLoading,
        login: async (email, password) =>
          loginMutation.mutateAsync({ email, password }),
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth harus digunakan di dalam AuthProvider.");
  return value;
}
