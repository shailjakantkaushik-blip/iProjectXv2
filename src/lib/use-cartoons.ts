import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  fetchLandingConfig,
  readCachedLandingConfig,
  type LandingConfig,
} from "@/lib/landing-config";

/** Live cartoons_enabled flag from platform config (cached + query + theme events). */
export function useCartoonsEnabled(): boolean {
  const cached = readCachedLandingConfig();
  const [enabled, setEnabled] = useState(cached?.cartoons_enabled !== false);

  const { data } = useQuery({
    queryKey: ["landing-config"],
    queryFn: fetchLandingConfig,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (data) setEnabled(data.cartoons_enabled !== false);
  }, [data]);

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<LandingConfig>).detail;
      if (detail && typeof detail.cartoons_enabled === "boolean") {
        setEnabled(detail.cartoons_enabled);
      }
    };
    window.addEventListener("pmo:platform-theme-change", onChange);
    return () => window.removeEventListener("pmo:platform-theme-change", onChange);
  }, []);

  return enabled;
}
