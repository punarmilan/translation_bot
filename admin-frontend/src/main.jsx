import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AdminAuthProvider } from "./state/AdminAuthContext";
import { AdminThemeProvider } from "./state/AdminThemeContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AdminThemeProvider>
        <AdminAuthProvider>
          <App />
        </AdminAuthProvider>
      </AdminThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
