import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerPwa } from "./registerPwa";

registerPwa();

createRoot(document.getElementById("root")!).render(<App />);
