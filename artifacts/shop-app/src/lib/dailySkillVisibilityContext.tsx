import { useAuth } from "@clerk/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "wouter";

import {
  countEnabledStoreSkills,
  type DailySkillSurface,
  type StoreSkillVisibilityState,
  resolveDailySkillSurfaceVisibility,
} from "./dailySkillVisibility";

interface DailySkillVisibilityContextValue {
  loaded: boolean;
  enabledSkillCount: number;
  isVisible: (surface: DailySkillSurface) => boolean;
  refresh: () => Promise<void>;
}

const defaultValue: DailySkillVisibilityContextValue = {
  loaded: true,
  enabledSkillCount: 0,
  isVisible: (surface) => resolveDailySkillSurfaceVisibility(surface, []),
  refresh: async () => undefined,
};

const DailySkillVisibilityContext =
  createContext<DailySkillVisibilityContextValue>(defaultValue);

export function StoreSkillVisibilityProvider({
  storeId,
  children,
}: {
  storeId: number;
  children: ReactNode;
}) {
  const { getToken } = useAuth();
  const [states, setStates] = useState<StoreSkillVisibilityState[]>([]);
  const [loaded, setLoaded] = useState(false);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setLoaded(false);
    try {
      const token = await getToken();
      const response = await fetch(`/api/stores/${storeId}/skills`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("skill visibility unavailable");
      const payload = (await response.json()) as {
        skills?: StoreSkillVisibilityState[];
      };
      if (requestId.current === currentRequestId) {
        setStates(payload.skills ?? []);
      }
    } catch {
      // UI-only gate: advanced surfaces fail closed; auth remains server-side.
      if (requestId.current === currentRequestId) setStates([]);
    } finally {
      if (requestId.current === currentRequestId) setLoaded(true);
    }
  }, [getToken, storeId]);

  useEffect(() => {
    void refresh();
    return () => {
      requestId.current += 1;
    };
  }, [refresh]);

  const isVisible = useCallback(
    (surface: DailySkillSurface) =>
      resolveDailySkillSurfaceVisibility(surface, states),
    [states],
  );
  const enabledSkillCount = useMemo(
    () => countEnabledStoreSkills(states),
    [states],
  );
  const value = useMemo(
    () => ({ loaded, enabledSkillCount, isVisible, refresh }),
    [enabledSkillCount, isVisible, loaded, refresh],
  );

  return (
    <DailySkillVisibilityContext.Provider value={value}>
      {children}
    </DailySkillVisibilityContext.Provider>
  );
}

export function useDailySkillVisibility(): DailySkillVisibilityContextValue {
  return useContext(DailySkillVisibilityContext);
}

export function DailySkillPageGate({
  surface,
  children,
}: {
  surface: DailySkillSurface;
  children: ReactNode;
}) {
  const [, setLocation] = useLocation();
  const { loaded, isVisible } = useDailySkillVisibility();

  if (!loaded) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!isVisible(surface)) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-5">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-white p-6 text-center">
          <h1 className="font-bold text-foreground">這項功能尚未開啟</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            可在技能地圖查看前置條件並決定是否開啟。
          </p>
          <button
            type="button"
            className="mt-4 min-h-11 w-full rounded-xl bg-primary font-semibold text-white"
            onClick={() => setLocation("/skill-map")}
          >
            前往技能地圖
          </button>
        </div>
      </div>
    );
  }
  return children;
}
