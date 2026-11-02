import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

// Theme is controlled globally via a data-theme attribute on <html>.
// Every token (color, spacing, radius, shadow, type) resolves under this
// attribute, so switching it here flips the entire app between themes.
document.documentElement.setAttribute("data-theme", "light");
document.documentElement.classList.add("font-sans");

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(<App />);
}

