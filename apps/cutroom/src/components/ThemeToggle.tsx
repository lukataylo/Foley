"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = (typeof window !== "undefined"
      ? (localStorage.getItem("foley-theme") as Theme | null)
      : null) ?? "light";
    setTheme(stored);
    document.documentElement.setAttribute("data-theme", stored);
  }, []);

  function flip(next: Theme) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("foley-theme", next);
  }

  return (
    <div
      className="theme-toggle"
      data-pos={theme}
      role="switch"
      aria-checked={theme === "dark"}
      aria-label="Theme"
    >
      <span className="knob" />
      <button
        type="button"
        onClick={() => flip("light")}
        className={`opt ${theme === "light" ? "active" : ""}`}
        aria-label="Light mode"
      >
        ☀
      </button>
      <button
        type="button"
        onClick={() => flip("dark")}
        className={`opt ${theme === "dark" ? "active" : ""}`}
        aria-label="Dark mode"
      >
        ☾
      </button>
    </div>
  );
}
