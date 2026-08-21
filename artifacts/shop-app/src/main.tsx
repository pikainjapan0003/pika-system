import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { bootstrapThemeScope } from "@/lib/themeScope";

bootstrapThemeScope(window.location.pathname, import.meta.env.BASE_URL);
createRoot(document.getElementById("root")!).render(<App />);
