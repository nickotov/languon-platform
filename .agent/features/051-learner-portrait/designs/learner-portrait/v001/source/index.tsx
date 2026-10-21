import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

// Theme is controlled by a single data-theme attribute on <html> so every
// token-driven screen can switch between "light" and "dark" with no
// per-component overrides. Inter is already loaded as a CSS variable
// (--font-body / --font-heading) by the token layer in index.css.
document.documentElement.setAttribute("data-theme", "light");
document.documentElement.classList.add("font-sans");

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(<App />);
}

