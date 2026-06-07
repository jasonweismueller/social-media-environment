import React from "react";
import { createRoot } from "react-dom/client";
import "./styles-amazon.css";

window.APP = "amz";

import("./App-amazon.jsx").then(({ default: App }) => {
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
