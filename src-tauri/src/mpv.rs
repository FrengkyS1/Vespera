//! Embedded libmpv player via FFI with in-window video.
//!
//! We create a native child window (a STATIC control) of the Tauri main window,
//! sized to the React content area, and embed libmpv into it via `wid`. The child
//! is raised above the WebView2 surface while playing and hidden otherwise, so the
//! sidebar / title bar (React) stay visible and the video appears in-app.

#![allow(non_camel_case_types)]

use serde_json::json;
use std::ffi::{c_char, c_double, c_int, c_void, CString};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

// ── libmpv FFI ───────────────────────────────────────────────────────────────

#[repr(C)]
struct mpv_handle {
    _private: [u8; 0],
}

const MPV_FORMAT_FLAG: c_int = 3;
const MPV_FORMAT_DOUBLE: c_int = 5;
const MPV_EVENT_SHUTDOWN: c_int = 1;
const MPV_EVENT_END_FILE: c_int = 7;
const MPV_EVENT_PROPERTY_CHANGE: c_int = 22;

#[repr(C)]
struct mpv_event {
    event_id: c_int,
    error: c_int,
    reply_userdata: u64,
    data: *mut c_void,
}

#[repr(C)]
struct mpv_event_property {
    name: *const c_char,
    format: c_int,
    data: *mut c_void,
}

extern "C" {
    fn mpv_create() -> *mut mpv_handle;
    fn mpv_initialize(ctx: *mut mpv_handle) -> c_int;
    fn mpv_terminate_destroy(ctx: *mut mpv_handle);
    fn mpv_set_option_string(ctx: *mut mpv_handle, name: *const c_char, data: *const c_char) -> c_int;
    fn mpv_set_property(ctx: *mut mpv_handle, name: *const c_char, format: c_int, data: *mut c_void) -> c_int;
    fn mpv_command(ctx: *mut mpv_handle, args: *const *const c_char) -> c_int;
    fn mpv_observe_property(ctx: *mut mpv_handle, reply: u64, name: *const c_char, format: c_int) -> c_int;
    fn mpv_wait_event(ctx: *mut mpv_handle, timeout: c_double) -> *mut mpv_event;
}

// Send a command directly to a raw handle (used during init and for thumbnails).
unsafe fn cmd_raw(ctx: *mut mpv_handle, args: &[&str]) {
    let cs: Vec<CString> = args.iter().map(|a| cstr(a)).collect();
    let mut ptrs: Vec<*const c_char> = cs.iter().map(|c| c.as_ptr()).collect();
    ptrs.push(std::ptr::null());
    mpv_command(ctx, ptrs.as_ptr());
}

// ── Win32 FFI (child video window) ───────────────────────────────────────────

const WS_CHILD: u32 = 0x4000_0000;
const WS_CLIPSIBLINGS: u32 = 0x0400_0000;
// Never take activation/focus, so the webview keeps keyboard focus (React controls).
const WS_EX_NOACTIVATE: u32 = 0x0800_0000;
const SW_HIDE: c_int = 0;
const SWP_NOACTIVATE: u32 = 0x0010;
const SWP_SHOWWINDOW: u32 = 0x0040;
// Place the video window on TOP of the WebView2 surface so the video is visible
// in the content area (transparent compositing isn't reliable on WebView2).
const HWND_TOP: isize = 0;

const CS_HREDRAW: u32 = 0x0002;
const CS_VREDRAW: u32 = 0x0001;
const BLACK_BRUSH: c_int = 4;
const IDC_ARROW: usize = 32512;

type WndProc = unsafe extern "system" fn(isize, u32, usize, isize) -> isize;

#[repr(C)]
struct WNDCLASSEXW {
    cb_size: u32,
    style: u32,
    wnd_proc: Option<WndProc>,
    cls_extra: c_int,
    wnd_extra: c_int,
    instance: isize,
    icon: isize,
    cursor: isize,
    background: isize,
    menu_name: *const u16,
    class_name: *const u16,
    icon_sm: isize,
}

#[link(name = "user32")]
extern "system" {
    fn CreateWindowExW(
        ex_style: u32,
        class_name: *const u16,
        window_name: *const u16,
        style: u32,
        x: c_int,
        y: c_int,
        w: c_int,
        h: c_int,
        parent: isize,
        menu: isize,
        instance: isize,
        param: *mut c_void,
    ) -> isize;
    fn ShowWindow(hwnd: isize, cmd: c_int) -> c_int;
    fn DestroyWindow(hwnd: isize) -> c_int;
    fn SetWindowPos(hwnd: isize, after: isize, x: c_int, y: c_int, w: c_int, h: c_int, flags: u32) -> c_int;
    fn RegisterClassExW(c: *const WNDCLASSEXW) -> u16;
    fn DefWindowProcW(h: isize, m: u32, w: usize, l: isize) -> isize;
    fn LoadCursorW(instance: isize, name: usize) -> isize;
    fn GetModuleHandleW(name: *const u16) -> isize;
    fn GetStockObject(obj: c_int) -> isize;
    fn GetCursorPos(p: *mut POINT) -> c_int;
    fn GetForegroundWindow() -> isize;
    fn GetWindowThreadProcessId(hwnd: isize, pid: *mut u32) -> u32;
}

#[repr(C)]
struct POINT {
    x: c_int,
    y: c_int,
}

/// Global cursor position in physical screen pixels.
pub fn cursor_pos() -> (i32, i32) {
    let mut p = POINT { x: 0, y: 0 };
    unsafe {
        GetCursorPos(&mut p);
    }
    (p.x, p.y)
}

/// True when the foreground window belongs to this process — i.e. the user is in
/// Vespera (its main window, the video child, or the floating control bar) rather
/// than another app. Used to gate the control bar so it never floats over other
/// apps, while still showing when the player itself has focus.
pub fn app_is_foreground() -> bool {
    unsafe {
        let fg = GetForegroundWindow();
        if fg == 0 {
            return false;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(fg, &mut pid);
        pid == std::process::id()
    }
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Register (once) a plain window class whose WndProc is DefWindowProcW. Unlike
/// the built-in STATIC control, this does not hit-test as transparent, so mpv's
/// embedded video window receives mouse events (its OSC controls work).
fn ensure_video_class() -> Vec<u16> {
    static ONCE: std::sync::Once = std::sync::Once::new();
    let name = wide("VesperaVideoWnd");
    ONCE.call_once(|| unsafe {
        let wc = WNDCLASSEXW {
            cb_size: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: CS_HREDRAW | CS_VREDRAW,
            wnd_proc: Some(DefWindowProcW),
            cls_extra: 0,
            wnd_extra: 0,
            instance: GetModuleHandleW(std::ptr::null()),
            icon: 0,
            cursor: LoadCursorW(0, IDC_ARROW),
            background: GetStockObject(BLACK_BRUSH),
            menu_name: std::ptr::null(),
            class_name: name.as_ptr(),
            icon_sm: 0,
        };
        RegisterClassExW(&wc);
    });
    name
}

/// Geometry of the video region, in physical pixels relative to the window.
#[derive(Clone, Copy, Default)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

// ── Player state ─────────────────────────────────────────────────────────────

#[derive(Clone, Copy)]
struct Ctx(*mut mpv_handle);
unsafe impl Send for Ctx {}

#[derive(Default)]
pub struct MpvState {
    inner: Mutex<Option<Player>>,
}

struct Player {
    ctx: Ctx,
    child: isize, // HWND of the video child window
}

fn cstr(s: &str) -> CString {
    CString::new(s).unwrap_or_default()
}

impl MpvState {
    /// Create the video child window inside the content area `rect` and embed
    /// libmpv into it. Idempotent; subsequent calls just reposition + show.
    pub fn start(&self, app: &AppHandle, rect: Rect) -> Result<(), String> {
        {
            let guard = self.inner.lock().map_err(|e| e.to_string())?;
            if let Some(p) = guard.as_ref() {
                let child = p.child;
                drop(guard);
                self.place(app, child, rect)?;
                return Ok(());
            }
        }

        let win = app
            .get_webview_window("main")
            .ok_or_else(|| "main window missing".to_string())?;
        let parent = win.hwnd().map_err(|e| e.to_string())?.0 as isize;

        // Create the child window on the UI thread.
        let (tx, rx) = std::sync::mpsc::channel::<isize>();
        win.run_on_main_thread(move || {
            let class = ensure_video_class();
            let child = unsafe {
                CreateWindowExW(
                    WS_EX_NOACTIVATE,
                    class.as_ptr(),
                    std::ptr::null(),
                    WS_CHILD | WS_CLIPSIBLINGS,
                    rect.x,
                    rect.y,
                    rect.w,
                    rect.h,
                    parent,
                    0,
                    0,
                    std::ptr::null_mut(),
                )
            };
            let _ = tx.send(child);
        })
        .map_err(|e| e.to_string())?;
        let child = rx.recv().map_err(|e| e.to_string())?;
        if child == 0 {
            return Err("failed to create video window".into());
        }

        unsafe {
            let ctx = mpv_create();
            if ctx.is_null() {
                return Err("mpv_create failed (libmpv-2.dll missing?)".into());
            }
            // mpv is a pure renderer; React draws a persistent control bar and
            // forwards the keyboard. keep-open=no so end-of-file fires (autoplay).
            let opts = [
                ("wid", child.to_string()),
                ("vo", "gpu".into()),
                ("hwdec", "auto-safe".into()),
                ("osc", "no".into()),
                ("force-window", "yes".into()),
                ("idle", "yes".into()),
                ("input-default-bindings", "no".into()),
                ("input-vo-keyboard", "no".into()),
                ("input-cursor", "yes".into()),
                ("keep-open", "no".into()),
                ("config", "no".into()),
            ];
            for (k, v) in opts {
                mpv_set_option_string(ctx, cstr(k).as_ptr(), cstr(&v).as_ptr());
            }
            if mpv_initialize(ctx) < 0 {
                return Err("mpv_initialize failed".into());
            }
            for prop in ["time-pos", "duration"] {
                mpv_observe_property(ctx, 1, cstr(prop).as_ptr(), MPV_FORMAT_DOUBLE);
            }
            mpv_observe_property(ctx, 2, cstr("pause").as_ptr(), MPV_FORMAT_FLAG);
            mpv_observe_property(ctx, 3, cstr("volume").as_ptr(), MPV_FORMAT_DOUBLE);
            cmd_raw(ctx, &["keybind", "MBTN_LEFT", "cycle pause"]);
            spawn_event_thread(app.clone(), Ctx(ctx));
            *self.inner.lock().map_err(|e| e.to_string())? = Some(Player { ctx: Ctx(ctx), child });
        }
        self.place(app, child, rect)
    }

    /// Load and play `path`, resuming at `start` seconds.
    pub fn load(&self, path: &str, start: f64) -> Result<(), String> {
        let ctx = self.ctx()?;
        unsafe {
            let val = if start > 1.0 { format!("{}", start as i64) } else { "none".into() };
            mpv_set_option_string(ctx.0, cstr("start").as_ptr(), cstr(&val).as_ptr());
        }
        self.command(&["loadfile", path, "replace"])
    }

    /// Reposition the video window to `rect` (on window resize / layout change).
    pub fn resize(&self, app: &AppHandle, rect: Rect) -> Result<(), String> {
        let child = match self.inner.lock().map_err(|e| e.to_string())?.as_ref() {
            Some(p) => p.child,
            None => return Ok(()),
        };
        self.place(app, child, rect)
    }

    fn place(&self, app: &AppHandle, child: isize, rect: Rect) -> Result<(), String> {
        let win = app
            .get_webview_window("main")
            .ok_or_else(|| "main window missing".to_string())?;
        win.run_on_main_thread(move || unsafe {
            SetWindowPos(
                child,
                HWND_TOP,
                rect.x,
                rect.y,
                rect.w,
                rect.h,
                SWP_SHOWWINDOW | SWP_NOACTIVATE,
            );
        })
        .map_err(|e| e.to_string())
    }

    pub fn command(&self, args: &[&str]) -> Result<(), String> {
        let ctx = self.ctx()?;
        let cs: Vec<CString> = args.iter().map(|a| cstr(a)).collect();
        let mut ptrs: Vec<*const c_char> = cs.iter().map(|c| c.as_ptr()).collect();
        ptrs.push(std::ptr::null());
        let rc = unsafe { mpv_command(ctx.0, ptrs.as_ptr()) };
        if rc < 0 { Err(format!("mpv command failed ({rc})")) } else { Ok(()) }
    }

    pub fn set_double(&self, name: &str, value: f64) -> Result<(), String> {
        let ctx = self.ctx()?;
        let mut v = value;
        let rc = unsafe {
            mpv_set_property(ctx.0, cstr(name).as_ptr(), MPV_FORMAT_DOUBLE, &mut v as *mut _ as *mut c_void)
        };
        if rc < 0 { Err(format!("set {name} failed")) } else { Ok(()) }
    }

    /// Stop playback and hide the video window (reveals the library again).
    pub fn stop(&self, app: &AppHandle) -> Result<(), String> {
        let child = match self.inner.lock().map_err(|e| e.to_string())?.as_ref() {
            Some(p) => p.child,
            None => return Ok(()),
        };
        let _ = self.command(&["stop"]);
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.run_on_main_thread(move || unsafe {
                ShowWindow(child, SW_HIDE);
            });
        }
        Ok(())
    }

    fn ctx(&self) -> Result<Ctx, String> {
        self.inner
            .lock()
            .map_err(|e| e.to_string())?
            .as_ref()
            .map(|p| p.ctx)
            .ok_or_else(|| "player not started".to_string())
    }
}

impl Drop for Player {
    fn drop(&mut self) {
        unsafe {
            if self.child != 0 {
                DestroyWindow(self.child);
            }
        }
    }
}

/// Generate a single-frame JPG thumbnail from `input` to `out` using a throwaway
/// libmpv instance in encode mode (no external mpv needed). Blocking; call from a
/// background thread.
pub fn make_thumbnail(input: &str, out: &str) -> Result<(), String> {
    unsafe {
        let ctx = mpv_create();
        if ctx.is_null() {
            return Err("mpv_create failed".into());
        }
        // Output codec is inferred from the .png extension. (PNG avoids the
        // MJPEG encoder's full-range-YUV requirement, which fails on many files.)
        let opts = [
            ("o", out),
            ("frames", "1"),
            ("start", "25%"),
            ("vf", "scale=480:-2"),
            ("audio", "no"),
            ("sub", "no"),
            ("terminal", "no"),
            ("config", "no"),
            ("msg-level", "all=no"),
        ];
        for (k, v) in opts {
            mpv_set_option_string(ctx, cstr(k).as_ptr(), cstr(v).as_ptr());
        }
        if mpv_initialize(ctx) < 0 {
            mpv_terminate_destroy(ctx);
            return Err("mpv_initialize failed".into());
        }
        cmd_raw(ctx, &["loadfile", input]);

        let start = std::time::Instant::now();
        loop {
            let ev = mpv_wait_event(ctx, 0.25);
            if !ev.is_null() {
                let id = (*ev).event_id;
                if id == MPV_EVENT_END_FILE || id == MPV_EVENT_SHUTDOWN {
                    break;
                }
            }
            if start.elapsed() > std::time::Duration::from_secs(20) {
                break;
            }
        }
        mpv_terminate_destroy(ctx);
    }
    if std::path::Path::new(out).exists() {
        Ok(())
    } else {
        Err("no thumbnail produced".into())
    }
}

fn spawn_event_thread(app: AppHandle, ctx: Ctx) {
    std::thread::spawn(move || unsafe {
        let ctx = ctx;
        loop {
            let ev = mpv_wait_event(ctx.0, 1.0);
            if ev.is_null() {
                continue;
            }
            match (*ev).event_id {
                MPV_EVENT_SHUTDOWN => break,
                MPV_EVENT_END_FILE => {
                    // First int of mpv_event_end_file is the reason (0 = EOF).
                    let reason = if (*ev).data.is_null() {
                        -1
                    } else {
                        *((*ev).data as *const c_int)
                    };
                    let _ = app.emit("mpv-event", json!({ "event": "end-file", "reason": reason }));
                }
                MPV_EVENT_PROPERTY_CHANGE => {
                    let prop = (*ev).data as *const mpv_event_property;
                    if prop.is_null() || (*prop).data.is_null() {
                        continue;
                    }
                    let name = std::ffi::CStr::from_ptr((*prop).name).to_string_lossy().into_owned();
                    let payload = match (*prop).format {
                        MPV_FORMAT_DOUBLE => {
                            json!({ "event": "property-change", "name": name, "data": *((*prop).data as *const c_double) })
                        }
                        MPV_FORMAT_FLAG => {
                            json!({ "event": "property-change", "name": name, "data": *((*prop).data as *const c_int) != 0 })
                        }
                        _ => continue,
                    };
                    let _ = app.emit("mpv-event", payload);
                }
                _ => {}
            }
        }
    });
}
