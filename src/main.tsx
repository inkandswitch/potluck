import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import * as Tooltip from "@radix-ui/react-tooltip";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Tooltip.Provider>
      <App />
    </Tooltip.Provider>
  </React.StrictMode>
);
