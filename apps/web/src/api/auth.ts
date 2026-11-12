import type {
  AuthImpersonationUser,
  AuthSession,
} from "@case-forge/shared";
import { http } from "./client";

export async function fetchCurrentUser() {
  const response = await http.get<AuthSession>("/auth/me");
  return response.data;
}

export async function logoutCurrentUser() {
  await http.post("/auth/logout");
}

export async function fetchImpersonationUsers(keyword = "") {
  const response = await http.get<AuthImpersonationUser[]>(
    "/auth/impersonation/users",
    { params: keyword ? { keyword } : undefined },
  );
  return response.data;
}

export async function switchImpersonationUser(
  userName: string,
  reason?: string,
) {
  const response = await http.post<AuthSession>("/auth/impersonation/switch", {
    userName,
    reason: reason?.trim() || undefined,
  });
  return response.data;
}

export async function exitImpersonation() {
  const response = await http.post<AuthSession>("/auth/impersonation/exit");
  return response.data;
}
