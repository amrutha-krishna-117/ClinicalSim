/**
 * Auth store — single source of truth for JWT.
 *
 * Token storage strategy (fixes the 401 infinite loop):
 * - Token is written to BOTH Zustand persist store AND localStorage['token']
 * - API interceptor reads from localStorage['token'] (synchronous, always fresh)
 * - On rehydration, onRehydrateStorage immediately syncs token back to localStorage['token']
 * - _hasHydrated flag prevents API queries firing before rehydration completes
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User } from '@/types';

const TOKEN_KEY = 'token';

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  _hasHydrated: boolean;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  setHasHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      _hasHydrated: false,

      setAuth: (token, user) => {
        // Write to both places atomically
        if (typeof window !== 'undefined') {
          localStorage.setItem(TOKEN_KEY, token);
        }
        set({ user, token, isAuthenticated: true });
      },

      logout: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem('clinicalsim-auth');
        }
        set({ user: null, token: null, isAuthenticated: false });
      },

      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'clinicalsim-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        user: s.user,
        token: s.token,
        isAuthenticated: s.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Re-sync token to the plain key the interceptor reads
          if (state.token && typeof window !== 'undefined') {
            localStorage.setItem(TOKEN_KEY, state.token);
          }
          state.setHasHydrated(true);
        }
      },
    }
  )
);

// Simulation session state (separate store, no persistence needed)
interface SimulationStore {
  currentSessionId: string | null;
  currentScenarioId: string | null;
  setSession: (sessionId: string, scenarioId: string) => void;
  reset: () => void;
}

export const useSimulationStore = create<SimulationStore>((set) => ({
  currentSessionId: null,
  currentScenarioId: null,
  setSession: (sessionId, scenarioId) =>
    set({ currentSessionId: sessionId, currentScenarioId: scenarioId }),
  reset: () => set({ currentSessionId: null, currentScenarioId: null }),
}));

/**
 * Callable outside React — used by the axios 401 interceptor.
 * Resets Zustand state immediately so the login page does not
 * see isAuthenticated=true and bounce back to dashboard.
 */
export function clearAuthState() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('clinicalsim-auth');
  }
  useAuthStore.setState({
    user: null,
    token: null,
    isAuthenticated: false,
  });
}
