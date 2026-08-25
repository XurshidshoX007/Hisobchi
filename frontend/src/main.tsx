import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "@/App";
import "@/globals.css";

/**
 * HashRouter tanlandi, chunki Mini App statik hostingda ishlaydi va
 * marshrut yo'llari (`/plans`, `/transactions?plan=1`) URL hash qismida
 * saqlanadi — server tomonda SPA-fallback sozlamasi talab qilmaydi.
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
