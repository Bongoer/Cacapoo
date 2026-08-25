import React from "react";
import ReactDOM from "react-dom/client";
import EditorApp from "../app/editor-app";
import "../app/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EditorApp />
  </React.StrictMode>,
);
