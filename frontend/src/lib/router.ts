/**
 * React Router moslamalari — Next.js `next/navigation` API siga.
 *
 * Loyiha Next.js App Router'dan Vite + React Router SPA'ga ko'chirildi.
 * Sahifalar/komponentlar ichidagi `usePathname` / `useRouter` /
 * `useSearchParams` chaqiruvlari o'zgarmasligi uchun shu modul Next API
 * shaklini taklif qiladi (push / replace / back / refresh).
 */

import { useMemo } from "react";
import {
  useLocation,
  useNavigate,
  useSearchParams as useReactRouterSearchParams,
} from "react-router-dom";

/** Next.js `usePathname` — joriy marshrut yo'li (`/plans` kabi). */
export function usePathname(): string {
  return useLocation().pathname;
}

export type NextLikeRouter = {
  push: (path: string) => void;
  replace: (path: string) => void;
  back: () => void;
  refresh: () => void;
};

/** Next.js `useRouter` — navigatsiya amallari uchun moslama. */
export function useRouter(): NextLikeRouter {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (path: string) => void navigate(path),
      replace: (path: string) => void navigate(path, { replace: true }),
      back: () => void navigate(-1),
      refresh: () => window.location.reload(),
    }),
    [navigate],
  );
}

/** Next.js `useSearchParams` — URLSearchParams ni to'g'ridan-to'g'ri qaytaradi. */
export function useSearchParams(): Readonly<URLSearchParams> {
  const [params] = useReactRouterSearchParams();
  return params;
}
