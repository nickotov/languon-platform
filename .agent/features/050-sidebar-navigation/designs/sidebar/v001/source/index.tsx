import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

// Theme is controlled via a data-theme attribute on <html>; tokens resolve from this scope.
// The preferences provider re-resolves this on mount (system / light / dark).
document.documentElement.setAttribute("data-theme", "dark");
document.documentElement.classList.add("font-sans");

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(<App />);
}

