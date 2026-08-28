"use client";

import { type ReactNode, useEffect, useState } from "react";

const PAGE_MOTION_KEY = "hisobchi:page-motion";

/** A small direction-aware entrance for route changes; SwipeBack marks back. */
export default function PageTemplate({ children }: { children: ReactNode }) {
  const [direction] = useState<"forward" | "back">(() => {
    if (typeof window === "undefined") return "forward";
    return sessionStorage.getItem(PAGE_MOTION_KEY) === "back" ? "back" : "forward";
  });

  useEffect(() => {
    sessionStorage.removeItem(PAGE_MOTION_KEY);
  }, []);

  return <div className={`page-transition page-transition-${direction}`}>{children}</div>;
}
