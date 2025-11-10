import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App-facebook.jsx";
import "./styles-facebook.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);