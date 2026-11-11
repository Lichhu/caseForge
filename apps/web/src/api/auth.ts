import type { AuthSession } from "@case-forge/shared";
import { http } from "./client";

export async function fetchCurrentUser() {
  const response = await http.get<AuthSession>("/auth/me");
  return response.data;
}

export async function logoutCurrentUser() {
  await http.post("/auth/logout");
}
