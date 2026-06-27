use std::path::Path;

fn main() {
    // Link against libmpv (import lib generated from libmpv-2.dll → mpv.lib).
    let manifest = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let libdir = Path::new(&manifest).join("libmpv");
    println!("cargo:rustc-link-search=native={}", libdir.display());
    println!("cargo:rustc-link-lib=dylib=mpv");
    println!("cargo:rerun-if-changed=libmpv/mpv.lib");

    // Copy the runtime DLL next to the built executable so it loads at runtime.
    if let Ok(out) = std::env::var("OUT_DIR") {
        // OUT_DIR = <target>/<profile>/build/<pkg>/out
        if let Some(target_dir) = Path::new(&out).ancestors().nth(3) {
            let src = libdir.join("libmpv-2.dll");
            let dst = target_dir.join("libmpv-2.dll");
            if src.exists() && !dst.exists() {
                let _ = std::fs::copy(&src, &dst);
            }
        }
    }

    tauri_build::build();
}
