import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App-instagram.jsx";
import "./styles-instagram.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);