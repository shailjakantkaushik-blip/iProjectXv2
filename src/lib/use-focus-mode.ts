import { useEffect, useState } from "react";

const STORAGE_KEY = "pmo.focusMode";

export function useFocusMode() {
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    try {
      setFocusMode(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (focusMode) root.dataset.focusMode = "1";
    else delete root.dataset.focusMode;
    try {
      localStorage.setItem(STORAGE_KEY, focusMode ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [focusMode]);

  return {
    focusMode,
    setFocusMode,
    toggleFocusMode: () => setFocusMode((v) => !v),
  };
}
