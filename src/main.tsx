import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { App } from "./App";
import { Overlay } from "./components/Overlay";
import "./styles.css";

// Two windows share this bundle: "main" (the app) and "controls" (a transparent,
// always-on-top overlay that draws the playback controls over the native video).
// No StrictMode: the player effects create/destroy the native mpv window and
// drive the overlay window — side effects that must not be double-invoked.
const isOverlay = getCurrentWindow().label === "controls";
if (isOverlay) document.documentElement.classList.add("overlay-window");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  isOverlay ? <Overlay /> : <App />,
);
