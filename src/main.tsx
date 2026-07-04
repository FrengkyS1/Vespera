import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ControlBar } from "./components/ControlBar";
import "./styles.css";

// The "controls" overlay window loads the same bundle with ?view=controls and
// renders only the floating control bar over a transparent background.
const isControls = new URLSearchParams(window.location.search).get("view") === "controls";
if (isControls) {
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  isControls ? <ControlBar /> : <App />
);
