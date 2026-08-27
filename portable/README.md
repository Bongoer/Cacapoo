# Linux 64 Web

A mobile-first browser launcher for real `qemu-system-x86_64` Linux guests. It builds Debian and Fedora containers into QEMU WebAssembly bundles and runs them locally in the browser.

## Easiest hosting: GitHub Pages

1. Create an empty GitHub repository.
2. Upload every file in this folder, including `.github`.
3. In repository Settings, open Pages and set Source to `GitHub Actions`.
4. Open the Actions tab and wait for `Build Linux 64 Web` to finish.

The first build is large and can take a while because it creates both QEMU guest images. Later builds reuse Docker layers.

## Firebase Hosting

Docker is needed once to build the VM bundles:

```bash
chmod +x build-vms.sh
./build-vms.sh
firebase deploy
```

The included `firebase.json` sets the isolation headers needed by QEMU threads.

## What is real here

- CPU target: x86_64
- Emulator: QEMU TCG compiled to WebAssembly
- Guests: Linux kernel plus Debian or Fedora userland
- Execution: entirely on the device, inside the browser sandbox
- Networking: browser-based proxy, so normal browser CORS restrictions still apply

## iPhone notes

- Use a current iOS version and Safari.
- Keep the tab in the foreground while booting.
- Landscape mode gives the terminal more room.
- Older or low-memory iPhones may close the tab because QEMU WebAssembly is demanding.

This project uses the open-source container2wasm and QEMU-Wasm projects. Their generated bundles include software under their respective licenses.
