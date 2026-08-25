"use client";

import {
  Box,
  Camera,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Code2,
  Cuboid,
  Download,
  Eye,
  EyeOff,
  FileArchive,
  FolderOpen,
  Gauge,
  Image as ImageIcon,
  Lightbulb,
  Menu,
  MousePointer2,
  Move3d,
  Pause,
  Play,
  Plus,
  Redo2,
  Rotate3d,
  Save,
  Search,
  Settings2,
  Sparkles,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EditableImage from "./editable-image";
import EngineViewport from "./engine-viewport";
import { importGodotFiles, type ImportResult } from "./godot-importer";
import {
  createStarterScene,
  defaultEffects,
  makeNode,
  type NodeKind,
  type ProjectData,
  type RenderEffects,
  type SceneNode,
  type Vec3,
} from "./types";

type TransformMode = "translate" | "rotate" | "scale";
type BottomTab = "output" | "effects" | "image" | "shader";

const iconFor = (node: SceneNode) => {
  const common = { size: 14 };
  if (node.kind === "world") return <CircleDot {...common} />;
  if (node.kind === "mesh") return <Cuboid {...common} />;
  if (node.kind === "light") return <Lightbulb {...common} />;
  if (node.kind === "camera") return <Camera {...common} />;
  if (node.kind === "particles") return <Sparkles {...common} />;
  return <Settings2 {...common} />;
};

const numberValue = (value: string) => (Number.isFinite(Number(value)) ? Number(value) : 0);

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

interface VectorEditorProps {
  label: string;
  value: Vec3;
  step?: number;
  onChange: (value: Vec3) => void;
}

function VectorEditor({ label, value, step = 0.1, onChange }: VectorEditorProps) {
  return (
    <div className="vector-row">
      <span>{label}</span>
      {(["X", "Y", "Z"] as const).map((axis, index) => (
        <label key={axis} className={`axis axis-${axis.toLowerCase()}`}>
          <b>{axis}</b>
          <input
            type="number"
            step={step}
            value={Number(value[index].toFixed(3))}
            onChange={(event) => {
              const next = [...value] as Vec3;
              next[index] = numberValue(event.target.value);
              onChange(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}

function SceneTree({
  nodes,
  selectedId,
  onSelect,
  onToggleVisible,
}: {
  nodes: SceneNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
}) {
  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, SceneNode[]>();
    nodes.forEach((node) => map.set(node.parentId, [...(map.get(node.parentId) ?? []), node]));
    return map;
  }, [nodes]);
  const [closed, setClosed] = useState(new Set<string>());

  const renderBranch = (parentId: string | null, depth: number): React.ReactNode =>
    (childrenByParent.get(parentId) ?? []).map((node) => {
      const hasChildren = Boolean(childrenByParent.get(node.id)?.length);
      const isClosed = closed.has(node.id);
      return (
        <div key={node.id}>
          <div
            className={`scene-node ${selectedId === node.id ? "selected" : ""}`}
            style={{ paddingLeft: 7 + depth * 14 }}
            onClick={() => onSelect(node.id)}
          >
            <button
              className="tree-disclosure"
              aria-label={isClosed ? "Expand node" : "Collapse node"}
              onClick={(event) => {
                event.stopPropagation();
                if (!hasChildren) return;
                setClosed((current) => {
                  const next = new Set(current);
                  if (next.has(node.id)) next.delete(node.id);
                  else next.add(node.id);
                  return next;
                });
              }}
            >
              {hasChildren ? isClosed ? <ChevronRight size={13} /> : <ChevronDown size={13} /> : <span />}
            </button>
            {iconFor(node)}
            <span className="node-name">{node.name}</span>
            <button
              className="visibility-button"
              aria-label={node.visible ? "Hide node" : "Show node"}
              onClick={(event) => { event.stopPropagation(); onToggleVisible(node.id); }}
            >
              {node.visible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          </div>
          {!isClosed && renderBranch(node.id, depth + 1)}
        </div>
      );
    });
  return <div className="scene-tree">{renderBranch(null, 0)}</div>;
}

function Inspector({
  node,
  onChange,
}: {
  node: SceneNode | undefined;
  onChange: (node: SceneNode) => void;
}) {
  const [filter, setFilter] = useState("");
  if (!node) {
    return <div className="empty-inspector"><MousePointer2 size={28} /><p>Select an object to inspect it.</p></div>;
  }
  const setProp = (key: string, value: string | number | boolean) =>
    onChange({ ...node, props: { ...node.props, [key]: value } });
  const show = (text: string) => text.toLowerCase().includes(filter.toLowerCase());
  return (
    <div className="inspector-content">
      <div className="inspector-title">{iconFor(node)}<input value={node.name} onChange={(event) => onChange({ ...node, name: event.target.value })} /></div>
      <label className="property-search"><Search size={13} /><input placeholder="Filter properties" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
      {show("transform position rotation scale") && (
        <section className="property-section">
          <h3>Transform</h3>
          <VectorEditor label="Position" value={node.transform.position} onChange={(position) => onChange({ ...node, transform: { ...node.transform, position } })} />
          <VectorEditor label="Rotation" value={node.transform.rotation} step={1} onChange={(rotation) => onChange({ ...node, transform: { ...node.transform, rotation } })} />
          <VectorEditor label="Scale" value={node.transform.scale} onChange={(scale) => onChange({ ...node, transform: { ...node.transform, scale } })} />
        </section>
      )}
      {node.kind === "mesh" && show("mesh geometry material shape color roughness metalness shader") && (
        <>
          <section className="property-section two-column-properties">
            <h3>Geometry</h3>
            <label>Shape<select value={String(node.props.shape ?? "box")} onChange={(event) => setProp("shape", event.target.value)}><option value="box">Box</option><option value="sphere">Sphere</option><option value="plane">Plane</option><option value="cylinder">Cylinder</option><option value="torus">Torus</option></select></label>
          </section>
          <section className="property-section two-column-properties">
            <h3>Material</h3>
            <label>Shader<select value={String(node.props.material ?? "standard")} onChange={(event) => setProp("material", event.target.value)}><option value="standard">Standard PBR</option><option value="hologram">Hologram shader</option></select></label>
            <label>Albedo<input type="color" value={String(node.props.color ?? "#7f96b5")} onChange={(event) => setProp("color", event.target.value)} /></label>
            <label>Roughness<input type="range" min="0" max="1" step="0.01" value={Number(node.props.roughness ?? 0.45)} onChange={(event) => setProp("roughness", Number(event.target.value))} /></label>
            <label>Metalness<input type="range" min="0" max="1" step="0.01" value={Number(node.props.metalness ?? 0.15)} onChange={(event) => setProp("metalness", Number(event.target.value))} /></label>
          </section>
        </>
      )}
      {node.kind === "light" && show("light color energy intensity") && (
        <section className="property-section two-column-properties">
          <h3>Light</h3>
          <label>Type<select value={String(node.props.lightType ?? "directional")} onChange={(event) => setProp("lightType", event.target.value)}><option value="directional">Directional</option><option value="point">Point</option></select></label>
          <label>Color<input type="color" value={String(node.props.color ?? "#ffffff")} onChange={(event) => setProp("color", event.target.value)} /></label>
          <label>Energy<input type="number" min="0" step="0.1" value={Number(node.props.intensity ?? 2)} onChange={(event) => setProp("intensity", Number(event.target.value))} /></label>
        </section>
      )}
      {node.kind === "camera" && show("camera field view fov") && (
        <section className="property-section two-column-properties"><h3>Camera</h3><label>Field of view<input type="number" min="10" max="150" value={Number(node.props.fov ?? 60)} onChange={(event) => setProp("fov", Number(event.target.value))} /></label></section>
      )}
      {node.kind === "particles" && show("particles emission flipbook billboard trail amount lifetime speed size shape color") && (
        <section className="property-section two-column-properties">
          <h3>Particle Emitter</h3>
          <label>Renderer<select value={String(node.props.particleMode ?? "billboard")} onChange={(event) => setProp("particleMode", event.target.value)}><option value="billboard">Billboard</option><option value="flipbook">Flipbook</option><option value="trail">Trail ribbon</option></select></label>
          <label>Emission shape<select value={String(node.props.emissionShape ?? "point")} onChange={(event) => setProp("emissionShape", event.target.value)}><option value="point">Point</option><option value="sphere">Sphere</option><option value="box">Box</option></select></label>
          <label>Amount<input type="number" min="1" max="2000" value={Number(node.props.amount ?? 100)} onChange={(event) => setProp("amount", Number(event.target.value))} /></label>
          <label>Lifetime<input type="number" min="0.1" step="0.1" value={Number(node.props.lifetime ?? 2)} onChange={(event) => setProp("lifetime", Number(event.target.value))} /></label>
          <label>Speed<input type="number" min="0" step="0.1" value={Number(node.props.speed ?? 1.5)} onChange={(event) => setProp("speed", Number(event.target.value))} /></label>
          <label>Size<input type="number" min="0.01" step="0.01" value={Number(node.props.size ?? 0.12)} onChange={(event) => setProp("size", Number(event.target.value))} /></label>
          <label>Color<input type="color" value={String(node.props.color ?? "#ffb454")} onChange={(event) => setProp("color", event.target.value)} /></label>
        </section>
      )}
    </div>
  );
}

export default function EditorApp() {
  const [projectName, setProjectName] = useState("Neon Playground");
  const [nodes, setNodes] = useState<SceneNode[]>(createStarterScene);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<TransformMode>("translate");
  const [playing, setPlaying] = useState(true);
  const [effects, setEffects] = useState<RenderEffects>(defaultEffects);
  const [bottomTab, setBottomTab] = useState<BottomTab>("output");
  const [consoleLines, setConsoleLines] = useState(["VoxelForge Engine 0.1 ready", "WebGL renderer initialized", "Scene loaded in 34 ms"]);
  const [stats, setStats] = useState({ fps: 60, triangles: 0 });
  const [addOpen, setAddOpen] = useState(false);
  const [importReport, setImportReport] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"scene" | "inspector" | null>(null);
  const godotInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const undoRef = useRef<SceneNode[][]>([]);
  const redoRef = useRef<SceneNode[][]>([]);
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 });

  const selected = nodes.find((node) => node.id === selectedId);
  const rootId = nodes.find((node) => node.parentId === null)?.id ?? null;

  const commitNodes = useCallback((next: SceneNode[] | ((current: SceneNode[]) => SceneNode[]), record = true) => {
    if (record) setHistoryCounts({ undo: Math.min(undoRef.current.length + 1, 60), redo: 0 });
    setNodes((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      if (record) {
        undoRef.current.push(structuredClone(current));
        if (undoRef.current.length > 60) undoRef.current.shift();
        redoRef.current = [];
      }
      return resolved;
    });
  }, []);

  const updateNode = useCallback((changed: SceneNode, record = true) => {
    commitNodes((current) => current.map((node) => node.id === changed.id ? changed : node), record);
  }, [commitNodes]);

  const addConsole = (message: string) =>
    setConsoleLines((current) => [...current.slice(-20), `${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}  ${message}`]);

  const saveProject = useCallback(() => {
    const data: ProjectData = { format: "voxelforge-project", version: 1, name: projectName, nodes, effects, savedAt: new Date().toISOString() };
    downloadFile(`${projectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "project"}.vforge`, JSON.stringify(data, null, 2), "application/json");
    addConsole("Project saved to a .vforge file");
  }, [effects, nodes, projectName]);

  const undo = useCallback(() => {
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current.push(structuredClone(nodes));
    setNodes(previous);
    setHistoryCounts({ undo: undoRef.current.length, redo: redoRef.current.length });
  }, [nodes]);
  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(structuredClone(nodes));
    setNodes(next);
    setHistoryCounts({ undo: undoRef.current.length, redo: redoRef.current.length });
  }, [nodes]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).matches("input, textarea, select")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveProject(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      else if (event.key.toLowerCase() === "w") setMode("translate");
      else if (event.key.toLowerCase() === "e") setMode("rotate");
      else if (event.key.toLowerCase() === "r") setMode("scale");
      else if (event.key === "Delete" && selectedId) {
        commitNodes((current) => current.filter((node) => node.id !== selectedId && node.parentId !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [commitNodes, redo, saveProject, selectedId, undo]);

  const addNode = (kind: NodeKind, preset?: string) => {
    let node: SceneNode;
    if (kind === "mesh") node = makeNode(preset ? `${preset[0].toUpperCase()}${preset.slice(1)}` : "Mesh3D", "mesh", selected?.kind === "world" ? selected.id : rootId, { shape: preset ?? "box", color: "#6f9dde", roughness: 0.45, metalness: 0.15, material: "standard" });
    else if (kind === "particles") node = makeNode(`${preset === "trail" ? "Trail" : preset === "flipbook" ? "Flipbook" : "Billboard"} Particles`, "particles", rootId, { particleMode: preset ?? "billboard", emissionShape: "sphere", amount: 100, lifetime: 2, speed: 1.5, size: 0.12, color: preset === "trail" ? "#77e8ff" : "#ffb454", spread: 0.8, playing: true });
    else if (kind === "light") node = makeNode(preset === "point" ? "Point Light" : "Directional Light", "light", rootId, { lightType: preset ?? "directional", color: "#ffffff", intensity: 2 });
    else node = makeNode("Camera3D", "camera", rootId, { fov: 60 });
    node.transform.position = [0, kind === "mesh" ? 1 : 2, 0];
    commitNodes((current) => [...current, node]);
    setSelectedId(node.id);
    setAddOpen(false);
    addConsole(`Added ${node.name}`);
  };

  const loadProject = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as ProjectData;
      if (data.format !== "voxelforge-project" || !Array.isArray(data.nodes)) throw new Error("Not a VoxelForge project file.");
      commitNodes(data.nodes);
      setEffects({ ...defaultEffects, ...data.effects });
      setProjectName(data.name || "Imported Project");
      setSelectedId(null);
      addConsole(`Loaded ${data.nodes.length} scene nodes`);
    } catch (error) {
      addConsole(`Load failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
    if (projectInputRef.current) projectInputRef.current.value = "";
  };

  const loadGodot = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const result = await importGodotFiles(Array.from(files));
      commitNodes(result.nodes);
      setProjectName(result.name);
      setSelectedId(null);
      setImportReport(result);
      addConsole(`Godot import: ${result.nodes.length} supported nodes from ${result.filesRead} files`);
    } catch (error) {
      setImportReport({ name: "Import failed", nodes: [], warnings: [error instanceof Error ? error.message : "Unknown import error"], filesRead: 0 });
      addConsole("Godot import failed");
    } finally {
      setBusy(false);
      if (godotInputRef.current) godotInputRef.current.value = "";
    }
  };

  return (
    <main className="editor-shell">
      <header className="titlebar">
        <div className="brand"><div className="brand-mark"><Box size={17} /></div><strong>VoxelForge</strong><span>3D</span></div>
        <nav className="main-menu" aria-label="Main menu">
          <button onClick={() => { setProjectName("Untitled Project"); commitNodes(createStarterScene()); setSelectedId(null); }}>File</button>
          <button onClick={undo}>Edit</button>
          <button onClick={() => setAddOpen(true)}>Scene</button>
          <button onClick={() => setBottomTab("shader")}>Shaders</button>
          <button onClick={() => setBottomTab("effects")}>Effects</button>
        </nav>
        <div className="document-title"><span>{projectName}</span><small>local project</small></div>
        <div className="title-actions">
          <button onClick={() => projectInputRef.current?.click()} title="Open VoxelForge project"><FolderOpen size={15} /><span>Open</span></button>
          <button onClick={saveProject} title="Save project"><Save size={15} /><span>Save</span></button>
          <button className="import-button" onClick={() => godotInputRef.current?.click()} disabled={busy}><Upload size={15} /><span>{busy ? "Converting..." : "Import Godot"}</span></button>
          <button className="mobile-menu-button" onClick={() => setMobilePanel(mobilePanel ? null : "scene")}><Menu size={18} /></button>
        </div>
        <input ref={projectInputRef} type="file" accept=".vforge,.json" hidden onChange={(event) => loadProject(event.target.files)} />
        <input ref={godotInputRef} type="file" accept=".zip,.tscn,.godot" multiple hidden onChange={(event) => loadGodot(event.target.files)} />
      </header>

      <div className="workspace-toolbar">
        <div className="tool-group">
          <button onClick={undo} disabled={!historyCounts.undo} title="Undo (Ctrl+Z)"><Undo2 size={15} /></button>
          <button onClick={redo} disabled={!historyCounts.redo} title="Redo (Ctrl+Shift+Z)"><Redo2 size={15} /></button>
        </div>
        <div className="tool-group transform-tools">
          <button className={mode === "translate" ? "active" : ""} onClick={() => setMode("translate")} title="Move (W)"><Move3d size={16} /></button>
          <button className={mode === "rotate" ? "active" : ""} onClick={() => setMode("rotate")} title="Rotate (E)"><Rotate3d size={16} /></button>
          <button className={mode === "scale" ? "active" : ""} onClick={() => setMode("scale")} title="Scale (R)"><Box size={15} /></button>
        </div>
        <div className="viewport-mode"><button className="active">3D</button><button onClick={() => setBottomTab("image")}>Image</button><button onClick={() => setBottomTab("shader")}>Shader</button></div>
        <div className="play-controls">
          <button className={playing ? "run active" : "run"} onClick={() => setPlaying((value) => !value)} title={playing ? "Pause simulation" : "Play simulation"}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        </div>
      </div>

      <div className="editor-grid">
        <aside className={`scene-panel panel ${mobilePanel === "scene" ? "mobile-open" : ""}`}>
          <div className="panel-header"><span>Scene</span><button onClick={() => setAddOpen(true)} title="Add node"><Plus size={15} /></button></div>
          <label className="scene-filter"><Search size={13} /><input placeholder="Filter nodes" /></label>
          <SceneTree nodes={nodes} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setMobilePanel(null); }} onToggleVisible={(id) => commitNodes((current) => current.map((node) => node.id === id ? { ...node, visible: !node.visible } : node))} />
          <div className="assets-mini"><div className="panel-header"><span>Project</span><Plus size={13} /></div><div className="asset-row"><FileArchive size={14} /> scenes/</div><div className="asset-row"><ImageIcon size={14} /> textures/</div><div className="asset-row"><Code2 size={14} /> shaders/</div></div>
        </aside>

        <section className="viewport-panel">
          <EngineViewport
            nodes={nodes}
            selectedId={selectedId}
            mode={mode}
            playing={playing}
            effects={effects}
            onSelect={setSelectedId}
            onTransform={(id, transform) => {
              const target = nodes.find((node) => node.id === id);
              if (target) updateNode({ ...target, transform }, false);
            }}
            onStats={setStats}
          />
          <div className="viewport-overlay top-left"><button><Gauge size={13} /> Perspective</button><button>Lit <ChevronDown size={12} /></button></div>
          <div className="viewport-overlay top-right"><span>{playing ? "SIMULATING" : "PAUSED"}</span></div>
          <div className="viewport-overlay bottom-left"><span>{stats.fps} FPS</span><span>{stats.triangles.toLocaleString()} tris</span><span>WebGL2</span></div>
          <div className="mobile-panel-tabs"><button onClick={() => setMobilePanel("scene")}>Scene</button><button onClick={() => setMobilePanel("inspector")}>Inspector</button></div>
        </section>

        <aside className={`inspector-panel panel ${mobilePanel === "inspector" ? "mobile-open" : ""}`}>
          <div className="panel-header"><span>Inspector</span><button><Settings2 size={14} /></button></div>
          <Inspector node={selected} onChange={updateNode} />
        </aside>

        <section className="bottom-panel">
          <div className="bottom-tabs">
            <button className={bottomTab === "output" ? "active" : ""} onClick={() => setBottomTab("output")}>Output <span>{consoleLines.length}</span></button>
            <button className={bottomTab === "effects" ? "active" : ""} onClick={() => setBottomTab("effects")}>Environment & Effects</button>
            <button className={bottomTab === "image" ? "active" : ""} onClick={() => setBottomTab("image")}>EditableImage</button>
            <button className={bottomTab === "shader" ? "active" : ""} onClick={() => setBottomTab("shader")}>Shader Lab</button>
          </div>
          <div className="bottom-content">
            {bottomTab === "output" && <div className="console-output">{consoleLines.map((line, index) => <div key={`${line}-${index}`}><span>{index ? "›" : "◆"}</span>{line}</div>)}</div>}
            {bottomTab === "effects" && <EffectsPanel effects={effects} onChange={setEffects} />}
            {bottomTab === "image" && <EditableImage activeTexture={selected?.kind === "mesh" ? String(selected.props.textureData ?? "") : ""} onApply={(textureData) => { if (selected?.kind === "mesh") { updateNode({ ...selected, props: { ...selected.props, textureData } }); addConsole(`EditableImage applied to ${selected.name}`); } else addConsole("Select a mesh before applying an image"); }} />}
            {bottomTab === "shader" && <ShaderLab selected={selected} onApply={() => { if (selected?.kind === "mesh") { updateNode({ ...selected, props: { ...selected.props, material: "hologram" } }); addConsole(`Custom hologram shader applied to ${selected.name}`); } else addConsole("Select a mesh before applying a shader"); }} />}
          </div>
        </section>
      </div>

      <footer className="statusbar"><span><span className="status-dot" /> WebGL ready</span><span>{nodes.length} nodes</span><span>Autosave: browser only</span><span className="status-spacer" /><span>W move</span><span>E rotate</span><span>R scale</span></footer>

      {addOpen && <AddNodeDialog onClose={() => setAddOpen(false)} onAdd={addNode} />}
      {importReport && <ImportDialog report={importReport} onClose={() => setImportReport(null)} />}
    </main>
  );
}

function EffectsPanel({ effects, onChange }: { effects: RenderEffects; onChange: (effects: RenderEffects) => void }) {
  const set = <K extends keyof RenderEffects>(key: K, value: RenderEffects[K]) => onChange({ ...effects, [key]: value });
  return (
    <div className="effects-grid">
      <label><input type="checkbox" checked={effects.bloom} onChange={(event) => set("bloom", event.target.checked)} /><span><b>Bloom</b><small>Real-time glow on bright materials</small></span></label>
      <label className="effect-slider">Strength<input type="range" min="0" max="2.5" step="0.05" value={effects.bloomStrength} onChange={(event) => set("bloomStrength", Number(event.target.value))} /><output>{effects.bloomStrength.toFixed(2)}</output></label>
      <label><input type="checkbox" checked={effects.fog} onChange={(event) => set("fog", event.target.checked)} /><span><b>Volumetric-style fog</b><small>Distance-based exponential fog</small></span></label>
      <label className="effect-slider">Density<input type="range" min="0.001" max="0.12" step="0.001" value={effects.fogDensity} onChange={(event) => set("fogDensity", Number(event.target.value))} /><output>{effects.fogDensity.toFixed(3)}</output></label>
      <label><input type="checkbox" checked={effects.vignette} onChange={(event) => set("vignette", event.target.checked)} /><span><b>Vignette</b><small>Post-process edge shading</small></span></label>
      <label><input type="checkbox" checked={effects.scanlines} onChange={(event) => set("scanlines", event.target.checked)} /><span><b>Scanlines</b><small>Custom full-screen shader pass</small></span></label>
      <label><input type="checkbox" checked={effects.shadows} onChange={(event) => set("shadows", event.target.checked)} /><span><b>Soft shadows</b><small>PCF shadow maps</small></span></label>
      <label className="effect-slider">Exposure<input type="range" min="0.25" max="2.5" step="0.05" value={effects.exposure} onChange={(event) => set("exposure", Number(event.target.value))} /><output>{effects.exposure.toFixed(2)}</output></label>
    </div>
  );
}

function ShaderLab({ selected, onApply }: { selected?: SceneNode; onApply: () => void }) {
  const shader = `// VoxelForge fragment shader\nuniform float uTime;\nuniform vec3 uColor;\n\nvoid fragment() {\n  float scan = sin(WORLD_POSITION.y * 48.0 - uTime * 7.0);\n  float glow = smoothstep(0.35, 0.85, scan * 0.5 + 0.5);\n  COLOR = vec4(uColor * (1.2 + glow), 0.45 + glow * 0.2);\n}`;
  return <div className="shader-lab"><div className="shader-gutter">1<br />2<br />3<br />4<br />5<br />6<br />7<br />8<br />9</div><textarea spellCheck={false} defaultValue={shader} /><div className="shader-side"><b>Live shader</b><p>Apply the built-in hologram GLSL material to the currently selected mesh.</p><button onClick={onApply} disabled={selected?.kind !== "mesh"}><Play size={14} /> Apply & compile</button><small>{selected?.kind === "mesh" ? `Target: ${selected.name}` : "Select a mesh first"}</small></div></div>;
}

function AddNodeDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (kind: NodeKind, preset?: string) => void }) {
  const items: { name: string; detail: string; kind: NodeKind; preset?: string; icon: React.ReactNode }[] = [
    { name: "Box Mesh", detail: "PBR primitive", kind: "mesh", preset: "box", icon: <Cuboid /> },
    { name: "Sphere Mesh", detail: "PBR primitive", kind: "mesh", preset: "sphere", icon: <CircleDot /> },
    { name: "Camera3D", detail: "Perspective camera", kind: "camera", icon: <Camera /> },
    { name: "Directional Light", detail: "Sun-style light", kind: "light", preset: "directional", icon: <Lightbulb /> },
    { name: "Point Light", detail: "Omnidirectional light", kind: "light", preset: "point", icon: <Lightbulb /> },
    { name: "Billboard Particles", detail: "Camera-facing sprites", kind: "particles", preset: "billboard", icon: <Sparkles /> },
    { name: "Flipbook Particles", detail: "Animated sprite frames", kind: "particles", preset: "flipbook", icon: <Sparkles /> },
    { name: "Trail Ribbon", detail: "Nextbot-style moving trail", kind: "particles", preset: "trail", icon: <Sparkles /> },
  ];
  return <div className="dialog-backdrop" onMouseDown={onClose}><div className="dialog add-dialog" onMouseDown={(event) => event.stopPropagation()}><header><div><h2>Add Node</h2><p>Choose an engine object</p></div><button onClick={onClose}><X size={17} /></button></header><label className="dialog-search"><Search size={14} /><input autoFocus placeholder="Search nodes" /></label><div className="node-catalog">{items.map((item) => <button key={item.name} onClick={() => onAdd(item.kind, item.preset)}><span>{item.icon}</span><div><b>{item.name}</b><small>{item.detail}</small></div><Plus size={14} /></button>)}</div></div></div>;
}

function ImportDialog({ report, onClose }: { report: ImportResult; onClose: () => void }) {
  return <div className="dialog-backdrop"><div className="dialog import-dialog"><header><div><h2>{report.nodes.length ? "Godot project converted" : "Godot import stopped"}</h2><p>{report.filesRead} files scanned, {report.nodes.length} supported nodes created</p></div><button onClick={onClose}><X size={17} /></button></header><div className="import-summary"><div className={report.nodes.length ? "import-status success" : "import-status failure"}>{report.nodes.length ? <Download /> : <X />}</div><div><b>{report.name}</b><p>The converted scene is now open in VoxelForge.</p></div></div>{report.warnings.length > 0 && <div className="warning-list"><h3>Conversion notes</h3>{report.warnings.map((warning) => <p key={warning}>• {warning}</p>)}</div>}<footer><button onClick={onClose}>Continue editing</button></footer></div></div>;
}
