(() => {
  const systems = {
    debian: {
      name: "Debian",
      local: "./vm/debian/index.html?embed=1&args=/bin/bash",
      fallback: "https://ktock.github.io/container2wasm-demo/amd64-debian-wasi.html?args=sh",
      fallbackLabel: "Opening the public x86_64 Debian runtime"
    },
    fedora: {
      name: "Fedora",
      local: "./vm/fedora/index.html?embed=1&args=/bin/bash",
      fallback: null,
      fallbackLabel: "The Fedora QEMU image must finish building first"
    },
    alpine: {
      name: "Alpine",
      local: "./vm/alpine/index.html?embed=1&args=/bin/sh",
      fallback: "https://ktock.github.io/qemu-wasm-demo/alpine-x86_64.html",
      fallbackLabel: "Opening the public QEMU x86_64 test image"
    }
  };

  const state = { selected: "debian", running: false, timer: null, progress: 0 };
  const $ = (id) => document.getElementById(id);
  const cards = [...document.querySelectorAll(".os-card")];
  const frame = $("vmFrame");
  const empty = $("emptyState");
  const loading = $("loadingState");
  const boot = $("bootButton");

  function choose(os) {
    state.selected = os;
    const system = systems[os];
    cards.forEach((card) => {
      const active = card.dataset.os === os;
      card.classList.toggle("selected", active);
      card.setAttribute("aria-checked", String(active));
    });
    $("machineTitle").textContent = `${system.name} x86_64`;
    if (!state.running) $("machineStatus").textContent = "Ready to boot";
    boot.querySelector("span:last-child").textContent = `Boot ${system.name}`;
  }

  async function localRuntimeExists(path) {
    try {
      const response = await fetch(path.split("?")[0], { method: "HEAD", cache: "no-store" });
      return response.ok;
    } catch (_) {
      return false;
    }
  }

  function startProgress(label) {
    state.progress = 8;
    $("progressBar").style.width = `${state.progress}%`;
    $("loadingText").textContent = label;
    clearInterval(state.timer);
    state.timer = setInterval(() => {
      state.progress = Math.min(92, state.progress + Math.max(1, (92 - state.progress) * 0.08));
      $("progressBar").style.width = `${state.progress}%`;
    }, 420);
  }

  function showMachine() {
    clearInterval(state.timer);
    $("progressBar").style.width = "100%";
    setTimeout(() => {
      loading.classList.add("hidden");
      frame.classList.remove("hidden");
      $("machineStatus").textContent = "Running on this device";
      boot.disabled = false;
      boot.querySelector("span:last-child").textContent = "Restart machine";
      state.running = true;
    }, 260);
  }

  async function bootMachine() {
    const system = systems[state.selected];
    stopMachine(false);
    boot.disabled = true;
    empty.classList.add("hidden");
    loading.classList.remove("hidden");
    $("loadingTitle").textContent = `Starting ${system.name}`;
    $("machineStatus").textContent = "Loading QEMU WebAssembly";

    const hasLocal = await localRuntimeExists(system.local);
    if (!hasLocal && !system.fallback) {
      clearInterval(state.timer);
      loading.classList.add("hidden");
      empty.classList.remove("hidden");
      empty.querySelector("h1").textContent = "Fedora is not built yet.";
      empty.querySelector("p").textContent = "Push this project to GitHub. The included Pages workflow builds the Fedora x86_64 QEMU image automatically.";
      $("machineStatus").textContent = "Waiting for the first site build";
      boot.disabled = false;
      return;
    }

    const target = hasLocal ? system.local : system.fallback;
    startProgress(hasLocal ? "Loading the local x86_64 image" : system.fallbackLabel);
    frame.src = target;
    frame.onload = showMachine;
    setTimeout(() => {
      if (!state.running && frame.src) showMachine();
    }, 12000);
  }

  function stopMachine(showEmpty = true) {
    clearInterval(state.timer);
    frame.onload = null;
    frame.src = "about:blank";
    frame.classList.add("hidden");
    loading.classList.add("hidden");
    if (showEmpty) empty.classList.remove("hidden");
    state.running = false;
    boot.disabled = false;
    boot.querySelector("span:last-child").textContent = `Boot ${systems[state.selected].name}`;
    $("machineStatus").textContent = "Ready to boot";
  }

  function sendKey(key) {
    if (!state.running) return;
    frame.contentWindow?.postMessage({ type: "linux64-key", key }, "*");
    frame.focus();
  }

  function checkCompatibility() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const hasWasm = typeof WebAssembly === "object";
    const isolated = self.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined";
    const box = $("compatibility");
    $("deviceLabel").textContent = isIOS ? "iPhone / iPad detected" : "Browser device";
    if (!hasWasm) {
      box.classList.add("warn");
      $("compatTitle").textContent = "WebAssembly is disabled";
      $("compatText").textContent = "Enable WebAssembly in the browser before starting QEMU.";
    } else if (!isolated) {
      box.classList.add("warn");
      $("compatTitle").textContent = "Reloading once may be required";
      $("compatText").textContent = "The included isolation service worker enables QEMU threads on GitHub Pages. Firebase can use the included headers directly.";
    } else {
      box.classList.add("good");
      $("compatTitle").textContent = isIOS ? "This iPhone supports the required browser features" : "Browser features are ready";
      $("compatText").textContent = "QEMU x86_64 will execute locally inside the browser sandbox.";
    }
  }

  cards.forEach((card) => card.addEventListener("click", () => choose(card.dataset.os)));
  boot.addEventListener("click", bootMachine);
  $("stopButton").addEventListener("click", () => stopMachine(true));
  $("fullscreenButton").addEventListener("click", async () => {
    try { await $("machinePanel").requestFullscreen(); } catch (_) {}
  });
  $("keyboardButton").addEventListener("click", () => {
    frame.contentWindow?.postMessage({ type: "linux64-focus" }, "*");
    frame.focus();
  });
  document.querySelectorAll("[data-key]").forEach((button) => button.addEventListener("click", () => sendKey(button.dataset.key)));
  window.addEventListener("message", (event) => {
    if (event.data?.type === "linux64-ready") showMachine();
    if (event.data?.type === "linux64-status") $("machineStatus").textContent = event.data.text;
  });

  checkCompatibility();
  choose("debian");
})();
