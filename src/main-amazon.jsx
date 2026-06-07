import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App-amazon.jsx";
import "./styles-amazon.css";

window.APP = "amz";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
