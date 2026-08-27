const ICON_MACHINE = "assets/chipset.png";
const SUPPORTED_EXTENSIONS = new Set(["iso", "img", "raw", "qcow2", "vhd", "vhdx", "bin"]);
const state = {
  machines: loadMachineMetadata(),
  files: new Map(),
  selectedId: null,
  runningId: null,
  terminal: null,
  pty: null,
  qemu: null,
};

const $ = (id) => document.getElementById(id);
const elements = {
  machineList: $("machineList"), emptyList: $("emptyList"), welcomePanel: $("welcomePanel"), detailsPanel: $("detailsPanel"),
  consolePanel: $("consolePanel"), detailName: $("detailName"), detailState: $("detailState"), detailMemory: $("detailMemory"),
  detailCpus: $("detailCpus"), detailDisplay: $("detailDisplay"), detailMedia: $("detailMedia"), statusText: $("statusText"),
  newVmDialog: $("newVmDialog"), newVmForm: $("newVmForm"), vmCanvas: $("vmCanvas"), displayMessage: $("displayMessage"),
  displayView: $("displayView"), serialView: $("serialView"), terminalHost: $("terminalHost"), terminalFallback: $("terminalFallback"),
  messageDialog: $("messageDialog"), messageTitle: $("messageTitle"), messageText: $("messageText"), reattachInput: $("reattachInput"),
};

function loadMachineMetadata() {
  try {
    const parsed = JSON.parse(localStorage.getItem("web-qemu-machines") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveMachineMetadata() {
  const safe = state.machines.map(({ id, name, memory, cpus, display, mediaName, mediaKind }) => ({ id, name, memory, cpus, display, mediaName, mediaKind }));
  localStorage.setItem("web-qemu-machines", JSON.stringify(safe));
}

function fileExtension(name) { return name.split(".").pop().toLowerCase(); }
function mediaKind(file) { return fileExtension(file.name) === "iso" ? "cdrom" : "disk"; }
function diskFormat(file) {
  return ({ qcow2: "qcow2", vhd: "vpc", vhdx: "vhdx" })[fileExtension(file.name)] || "raw";
}
function selectedMachine() { return state.machines.find((vm) => vm.id === state.selectedId) || null; }

function showMessage(title, text) {
  elements.messageTitle.textContent = title;
  elements.messageText.textContent = text;
  elements.messageDialog.showModal();
}

function renderMachineList() {
  elements.machineList.replaceChildren();
  elements.emptyList.hidden = state.machines.length > 0;
  for (const vm of state.machines) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `machine-item${vm.id === state.selectedId ? " selected" : ""}`;
    button.dataset.id = vm.id;
    const image = document.createElement("img");
    image.src = ICON_MACHINE; image.alt = "";
    const text = document.createElement("div");
    const name = document.createElement("strong"); name.textContent = vm.name;
    const status = document.createElement("span");
    status.textContent = vm.id === state.runningId ? "Running" : (state.files.has(vm.id) ? "Powered Off" : "Media not attached");
    text.append(name, status); button.append(image, text);
    button.addEventListener("click", () => selectMachine(vm.id));
    elements.machineList.append(button);
  }
}

function selectMachine(id) {
  state.selectedId = id;
  const vm = selectedMachine();
  renderMachineList();
  elements.welcomePanel.hidden = true;
  elements.consolePanel.hidden = vm.id !== state.runningId;
  elements.detailsPanel.hidden = vm.id === state.runningId;
  elements.detailName.textContent = vm.name;
  elements.detailState.textContent = vm.id === state.runningId ? "Running" : "Powered Off";
  elements.detailMemory.textContent = `${vm.memory} MB`;
  elements.detailCpus.textContent = String(vm.cpus);
  elements.detailDisplay.textContent = vm.display === "graphical" ? "Graphical SDL + serial" : "Serial console";
  elements.detailMedia.textContent = state.files.has(vm.id) ? vm.mediaName : `${vm.mediaName} (reattach required)`;
  $("settingsButton").disabled = vm.id === state.runningId;
  $("attachButton").disabled = vm.id === state.runningId;
  $("startButton").disabled = vm.id === state.runningId;
  $("startButton").querySelector("span").textContent = state.files.has(vm.id) ? "Start" : "Attach & Start";
}

function openNewDialog() {
  elements.newVmForm.reset();
  $("vmName").value = `Virtual Machine ${state.machines.length + 1}`;
  elements.newVmDialog.showModal();
}

elements.newVmForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const file = $("vmMedia").files[0];
  if (!file || !SUPPORTED_EXTENSIONS.has(fileExtension(file.name))) {
    showMessage("Unsupported media", "Choose an ISO, IMG, RAW, QCOW2, VHD, VHDX or BIN file.");
    return;
  }
  const vm = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name: $("vmName").value.trim() || "Virtual Machine",
    memory: Number($("vmMemory").value), cpus: Number($("vmCpus").value), display: $("vmDisplay").value,
    mediaName: file.name, mediaKind: mediaKind(file),
  };
  state.machines.push(vm); state.files.set(vm.id, file); saveMachineMetadata();
  elements.newVmDialog.close(); selectMachine(vm.id); elements.statusText.textContent = "Virtual machine created";
});

function requestMedia(vm, startAfter = false) {
  elements.reattachInput.value = "";
  elements.reattachInput.onchange = () => {
    const file = elements.reattachInput.files[0];
    if (!file) return;
    if (!SUPPORTED_EXTENSIONS.has(fileExtension(file.name))) {
      showMessage("Unsupported media", "Choose an ISO, IMG, RAW, QCOW2, VHD, VHDX or BIN file."); return;
    }
    vm.mediaName = file.name; vm.mediaKind = mediaKind(file); state.files.set(vm.id, file); saveMachineMetadata(); selectMachine(vm.id);
    if (startAfter) startSelectedMachine();
  };
  elements.reattachInput.click();
}

function qemuArguments(vm, file) {
  const args = ["-m", `${vm.memory}M`, "-smp", String(vm.cpus), "-machine", "pc", "-accel", `tcg,tb-size=256${vm.cpus > 1 ? ",thread=multi" : ""}`, "-L", "/pack", "-nic", "none"];
  const path = `/media/${file.name}`;
  if (vm.mediaKind === "cdrom") args.push("-boot", "d", "-cdrom", path);
  else args.push("-drive", `file=${path},if=ide,readonly=on,format=${diskFormat(file)}`);
  if (vm.display === "serial") args.push("-nographic");
  else args.push("-display", "sdl", "-vga", "std", "-serial", "stdio");
  return args;
}

async function prepareTerminal() {
  elements.terminalFallback.textContent = "WEB QEMU SERIAL CONSOLE\nLoading terminal support...\n";
  try {
    if (!globalThis.Terminal || !globalThis.openpty) throw new Error("Terminal library unavailable");
    state.terminal = new globalThis.Terminal({ fontFamily: '"VT323 Local", "Courier New", monospace', fontSize: 20, theme: { background: "#0000aa", foreground: "#f5f5f5", cursor: "#ffffff" } });
    elements.terminalHost.replaceChildren(); state.terminal.open(elements.terminalHost);
    const pair = globalThis.openpty(); state.terminal.loadAddon(pair.master); state.pty = pair.slave;
    elements.terminalFallback.hidden = true;
  } catch (error) {
    elements.terminalFallback.hidden = false;
    elements.terminalFallback.textContent += `Terminal keyboard support unavailable: ${error.message}\n`;
  }
}

function loadFirmwarePackage(Module) {
  return new Promise((resolve, reject) => {
    globalThis.Module = Module;
    document.getElementById("qemuFirmwareLoader")?.remove();
    const script = document.createElement("script");
    script.id = "qemuFirmwareLoader";
    script.src = "runtime/load.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("The QEMU firmware package could not be loaded."));
    document.head.append(script);
  });
}

async function startSelectedMachine() {
  const vm = selectedMachine(); if (!vm) return;
  if (state.runningId) { showMessage("Machine already running", "Power off the running machine before starting another one."); return; }
  const file = state.files.get(vm.id);
  if (!file) { requestMedia(vm, true); return; }
  if (!crossOriginIsolated) {
    showMessage("Browser isolation unavailable", "Reload the page once. If this remains, use Firebase Hosting or ensure the isolation service worker is active."); return;
  }
  state.runningId = vm.id; selectMachine(vm.id);
  showConsoleView(vm.display === "serial" ? "serial" : "display");
  elements.statusText.textContent = "Starting QEMU...";
  elements.displayMessage.hidden = false; elements.displayMessage.textContent = "Loading QEMU x86_64 runtime...";
  await prepareTerminal();
  const Module = {
    arguments: qemuArguments(vm, file), canvas: elements.vmCanvas, pty: state.pty,
    mainScriptUrlOrBlob: new URL("runtime/qemu-system-x86_64.js", location.href).href,
    locateFile: (path) => new URL(`runtime/${path}`, location.href).href,
    preRun: [() => {
      const FS = Module.FS;
      if (!FS.analyzePath("/media").exists) FS.mkdir("/media");
      FS.mount(Module.WORKERFS, { files: [file] }, "/media");
    }],
    print: (text) => appendFallback(text), printErr: (text) => appendFallback(text),
    onRuntimeInitialized: () => { elements.displayMessage.hidden = true; elements.statusText.textContent = "Running"; elements.vmCanvas.focus(); },
  };
  try {
    await loadFirmwarePackage(Module);
    const { default: initQemu } = await import("./runtime/qemu-system-x86_64.js");
    state.qemu = await initQemu(Module);
    if (state.qemu.TTY && state.pty) {
      const oldPoll = state.qemu.TTY.stream_ops.poll;
      state.qemu.TTY.stream_ops.poll = function(stream, timeout) {
        if (!state.pty.readable) return (state.pty.readable ? 1 : 0) | (state.pty.writable ? 4 : 0);
        return oldPoll.call(stream, timeout);
      };
    }
  } catch (error) {
    elements.displayMessage.hidden = false; elements.displayMessage.textContent = "QEMU failed to start";
    appendFallback(`QEMU START ERROR: ${error.stack || error.message}`);
    elements.statusText.textContent = "Start failed";
    state.runningId = null; selectMachine(vm.id);
    showMessage("QEMU failed to start", error.message.includes("Failed to fetch") ? "The QEMU runtime was not built or deployed. Check the GitHub Actions build." : error.message);
  }
}

function appendFallback(text) {
  elements.terminalFallback.textContent += `${text}\n`;
  elements.terminalFallback.scrollTop = elements.terminalFallback.scrollHeight;
}

function showConsoleView(view) {
  const serial = view === "serial";
  elements.serialView.hidden = !serial; elements.displayView.hidden = serial;
  $("showSerialButton").classList.toggle("selected", serial); $("showDisplayButton").classList.toggle("selected", !serial);
}

$("newVmButton").addEventListener("click", openNewDialog); $("emptyNewButton").addEventListener("click", openNewDialog);
$("startButton").addEventListener("click", startSelectedMachine);
$("attachButton").addEventListener("click", () => { const vm = selectedMachine(); if (vm) requestMedia(vm); });
$("settingsButton").addEventListener("click", () => {
  const vm = selectedMachine();
  if (!vm || vm.id === state.runningId) return;
  $("settingsVmName").value = vm.name;
  $("settingsVmMemory").value = String(vm.memory);
  $("settingsVmCpus").value = String(vm.cpus);
  $("settingsVmDisplay").value = vm.display;
  $("settingsDialog").showModal();
});
$("settingsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const vm = selectedMachine();
  if (!vm) return;
  vm.name = $("settingsVmName").value.trim() || vm.name;
  vm.memory = Number($("settingsVmMemory").value);
  vm.cpus = Number($("settingsVmCpus").value);
  vm.display = $("settingsVmDisplay").value;
  saveMachineMetadata();
  $("settingsDialog").close();
  selectMachine(vm.id);
  elements.statusText.textContent = "Hardware settings saved";
});
$("showDisplayButton").addEventListener("click", () => showConsoleView("display"));
$("showSerialButton").addEventListener("click", () => showConsoleView("serial"));
$("fullscreenButton").addEventListener("click", () => elements.consolePanel.requestFullscreen?.());
$("powerOffButton").addEventListener("click", () => location.reload());
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => elements.newVmDialog.close()));
document.querySelector("[data-close-settings]").addEventListener("click", () => $("settingsDialog").close());
document.querySelector("[data-close-message]").addEventListener("click", () => elements.messageDialog.close());
document.querySelectorAll("[data-menu]").forEach((button) => button.addEventListener("click", () => {
  const menu = button.dataset.menu;
  if (menu === "file") openNewDialog();
  else if (menu === "machine") { const vm = selectedMachine(); if (vm) startSelectedMachine(); else showMessage("Machine", "Select or create a virtual machine first."); }
  else showMessage("About", "Web QEMU Manager runs user-provided x86_64 media through experimental QEMU-Wasm. No operating system is included.");
}));

renderMachineList();
if (state.machines.length) selectMachine(state.machines[0].id);
