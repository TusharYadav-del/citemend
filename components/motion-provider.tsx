"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={{ duration: 0.24, ease: [0.2, 0.75, 0.25, 1] }}>{children}</MotionConfig>;
}
