import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// No StrictMode: the player effects create/destroy a real OS (mpv) window —
// side effects that must not be double-invoked.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
