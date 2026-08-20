import { useLayoutEffect } from "react";
import { useLocation } from "wouter";

import {
  applyThemeRouteScope,
  resolveBrandOverrideRoute,
  resolveThemeRoute,
} from "@/lib/themeScope";

interface RouteThemeControllerProps {
  basePath?: string;
}

export function RouteThemeController({
  basePath = "",
}: RouteThemeControllerProps) {
  const [location] = useLocation();

  useLayoutEffect(() => {
    applyThemeRouteScope(
      resolveThemeRoute(location, basePath),
      resolveBrandOverrideRoute(location, basePath),
    );
    return () => applyThemeRouteScope("legacy", false);
  }, [basePath, location]);

  return null;
}
