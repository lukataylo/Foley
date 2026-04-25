"use client";

import { useEffect, useRef } from "react";
import Typed from "typed.js";

// Reusable typing-animation primitive (typed.js wrapper). Pass `strings`
// (one or many) and we animate them. Same instance reused across renders;
// cleaned up on unmount.

interface Props {
  strings: string[];
  className?: string;
  loop?: boolean;
  showCursor?: boolean;
  typeSpeed?: number;
  backSpeed?: number;
  startDelay?: number;
  cursorChar?: string;
  /** Re-runs the animation when this changes — pass currentTime or a key. */
  resetKey?: string | number;
}

export function TypedText({
  strings,
  className,
  loop = false,
  showCursor = true,
  typeSpeed = 38,
  backSpeed = 18,
  startDelay = 200,
  cursorChar = "|",
  resetKey,
}: Props) {
  const elRef = useRef<HTMLSpanElement>(null);
  const typedRef = useRef<Typed | null>(null);

  useEffect(() => {
    if (!elRef.current) return;
    typedRef.current?.destroy();
    typedRef.current = new Typed(elRef.current, {
      strings,
      loop,
      showCursor,
      typeSpeed,
      backSpeed,
      startDelay,
      cursorChar,
      smartBackspace: true,
    });
    return () => {
      typedRef.current?.destroy();
      typedRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strings.join("|"), resetKey, loop, showCursor, typeSpeed, backSpeed, startDelay, cursorChar]);

  return <span ref={elRef} className={className} />;
}
