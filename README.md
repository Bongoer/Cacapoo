# Web QEMU Manager

A light, classic virtual-machine manager for user-provided x86_64 media. No operating system is bundled.

## GitHub Pages

1. Put the contents of this folder in the repository root, including `.github`.
2. In `Settings > Pages`, choose `GitHub Actions`.
3. Push the files. The first run compiles graphical QEMU-Wasm and can take a while. The compiled runtime is cached, so later UI-only changes skip compilation.

Choose **GitHub Actions** in the Pages settings. Do not choose deployment from a branch.

## Firebase Hosting

Run `./build-runtime.sh` once on a computer with Docker, then run `./prepare-site.sh` and `firebase deploy`. The included `firebase.json` supplies the browser-isolation headers required by threaded WebAssembly.

## Use

1. Choose `New`.
2. Select an ISO or disk image from the device.
3. Choose memory, processors, and graphical or serial output.
4. Select the machine and choose `Start`.

Media is mounted read-only through Emscripten WORKERFS and is not uploaded. Browser security requires selecting it again after a page reload.

The intended graphical Fedora path is a Fedora Workstation Live x86_64 ISO. An installer can boot, but this build does not create a writable persistent virtual hard disk. Existing uploaded disk images are also attached read-only.

## Important technical limits

- QEMU-Wasm graphics through SDL and OffscreenCanvas are experimental and have no guest GPU acceleration.
- Large Fedora or Windows ISOs may exceed iPhone browser memory.
- Text-only mode works only when the uploaded guest supports a serial console.
- Only one VM runs at a time.
- This is CPU emulation in WebAssembly. It is not expected to run Fedora GNOME, KDE, or Windows smoothly on an iPhone.
