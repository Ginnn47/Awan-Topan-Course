import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import type { UserPermissions } from "../api/types";

export function RequirePermission({
  permission,
  children,
}: {
  permission: keyof UserPermissions;
  children: ReactNode;
}) {
  const { user } = useAuth();
  return user?.permissions[permission] ? (
    children
  ) : (
    <Navigate to="/dashboard" replace />
  );
}
