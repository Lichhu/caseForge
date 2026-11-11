import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { AuthSession } from "@case-forge/shared";
import { fetchCurrentUser, logoutCurrentUser } from "@/api/auth";
import {
  clearAuthSessionCache,
  readAuthSessionCache,
  writeAuthSessionCache,
} from "@/auth/sessionStorage";

export const useAuthStore = defineStore("auth", () => {
  const session = ref<AuthSession | null>(readAuthSessionCache());
  const initialized = ref(false);
  let restorePromise: Promise<void> | null = null;

  const user = computed(() => session.value?.user ?? null);
  const expiresAt = computed(() => session.value?.expiresAt ?? null);
  const isAuthenticated = computed(() => Boolean(user.value));

  async function refresh() {
    try {
      session.value = await fetchCurrentUser();
      writeAuthSessionCache(session.value);
    } catch {
      clearLocalSession();
    }
  }

  async function restore() {
    if (initialized.value) return;
    if (restorePromise) return restorePromise;

    restorePromise = refresh().finally(() => {
      initialized.value = true;
      restorePromise = null;
    });
    return restorePromise;
  }

  async function logout() {
    try {
      await logoutCurrentUser();
    } finally {
      clearLocalSession();
      initialized.value = true;
    }
  }

  function clearLocalSession() {
    session.value = null;
    clearAuthSessionCache();
  }

  return {
    session,
    user,
    expiresAt,
    initialized,
    isAuthenticated,
    refresh,
    restore,
    logout,
    clearLocalSession,
  };
});
