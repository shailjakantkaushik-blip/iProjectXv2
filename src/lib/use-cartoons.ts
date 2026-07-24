import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  fetchLandingConfig,
  readCachedLandingConfig,
  type LandingConfig,
} from "@/lib/landing-config";
import { normalizeCartoonId, type CartoonId } from "@/lib/cartoons";

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

/** Active cartoon character id from platform landing config. */
export function useCartoonId(): CartoonId {
  const cached = readCachedLandingConfig();
  const [cartoonId, setCartoonId] = useState<CartoonId>(() =>
    normalizeCartoonId(cached?.cartoon_id),
  );

  const { data } = useQuery({
    queryKey: ["landing-config"],
    queryFn: fetchLandingConfig,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (data) setCartoonId(normalizeCartoonId(data.cartoon_id));
  }, [data]);

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<LandingConfig>).detail;
      if (detail && detail.cartoon_id != null) {
        setCartoonId(normalizeCartoonId(detail.cartoon_id));
      }
    };
    window.addEventListener("pmo:platform-theme-change", onChange);
    return () => window.removeEventListener("pmo:platform-theme-change", onChange);
  }, []);

  return cartoonId;
}
