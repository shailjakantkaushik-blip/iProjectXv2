/** Safari < 14 only has addListener on MediaQueryList. */
export function subscribeMediaQuery(mq: MediaQueryList, onChange: () => void): () => void {
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }
  const legacy = mq as MediaQueryList & {
    addListener?: (cb: () => void) => void;
    removeListener?: (cb: () => void) => void;
  };
  legacy.addListener?.(onChange);
  return () => legacy.removeListener?.(onChange);
}
