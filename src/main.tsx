const openDocumentId = new URLSearchParams(location.search).get("openDocument")


import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as Toast from "@radix-ui/react-toast";
import "./index.css";
import { selectedTextDocumentIdBox, textDocumentsMobx } from "./primitives";

if (openDocumentId && textDocumentsMobx.get(openDocumentId)) {
  selectedTextDocumentIdBox.set(openDocumentId)
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Tooltip.Provider>
      <Toast.Provider>
        <App />
      </Toast.Provider>
    </Tooltip.Provider>
  </React.StrictMode>
);
