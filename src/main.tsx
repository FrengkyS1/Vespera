import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ControlBar } from "./components/ControlBar";
import "./styles.css";

// No StrictMode: the player effects create/destroy a real OS window and toggle
// fullscreen — side effects that must not be double-invoked.
const isControls = new URLSearchParams(window.location.search).get("view") === "controls";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  isControls ? <ControlBar /> : <App />
);
