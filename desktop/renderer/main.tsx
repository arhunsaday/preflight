import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";
// Apply a pinned theme before the first paint so the window never flashes.
try {
  const theme = localStorage.getItem("preflight-theme");
  if (theme === "light" || theme === "dark")
    document.documentElement.dataset.theme = theme;
} catch {
  /* storage unavailable: follow the system theme */
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
