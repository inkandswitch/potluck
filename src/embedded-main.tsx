import React from 'react'
import ReactDOM from "react-dom/client";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as Toast from "@radix-ui/react-toast";
import {EmbeddedDocument} from "./EmbeddedDocument";

const params = new URLSearchParams(location.search)
const url = params.get('url')

console.log('foo')

if (url) {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <Tooltip.Provider>
        <Toast.Provider>
          <EmbeddedDocument url={url}/>
        </Toast.Provider>
      </Tooltip.Provider>
    </React.StrictMode>
  );
}