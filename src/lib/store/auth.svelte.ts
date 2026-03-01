import type { AuthUser, OIDCProviderRow } from '$lib/types/auth';

class AuthStore {
  user = $state<AuthUser | null>(null);
  providers = $state<Pick<OIDCProviderRow, 'id' | 'display_name'>[]>([]);

  get isLoggedIn(): boolean {
    return this.user !== null;
  }

  get isAdmin(): boolean {
    return this.user?.role === 'admin';
  }

  set(user: AuthUser | null) {
    this.user = user;
  }

  setProviders(providers: Pick<OIDCProviderRow, 'id' | 'display_name'>[]) {
    this.providers = providers;
  }

  async logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    this.user = null;
    window.location.href = '/login';
  }
}

export const authStore = new AuthStore();
