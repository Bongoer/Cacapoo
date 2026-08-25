import JSZip from "jszip";
import { makeNode, type SceneNode } from "./types";

export interface ImportResult {
  name: string;
  nodes: SceneNode[];
  warnings: string[];
  filesRead: number;
}

const nodeTypeMap: Record<string, SceneNode["kind"]> = {
  Node3D: "world",
  Spatial: "world",
  MeshInstance3D: "mesh",
  MeshInstance: "mesh",
  Camera3D: "camera",
  Camera: "camera",
  DirectionalLight3D: "light",
  DirectionalLight: "light",
  OmniLight3D: "light",
  OmniLight: "light",
  GPUParticles3D: "particles",
  CPUParticles3D: "particles",
  WorldEnvironment: "environment",
};

function vec3(value: string | undefined): [number, number, number] | null {
  if (!value) return null;
  const values = value
    .replace(/Vector3|\(|\)/g, "")
    .split(",")
    .map(Number);
  return values.length >= 3 && values.every(Number.isFinite)
    ? [values[0], values[1], values[2]]
    : null;
}

function parseTscn(text: string, fallbackName: string): ImportResult {
  const warnings: string[] = [];
  const nodes: SceneNode[] = [];
  const lines = text.split(/\r?\n/);
  const primitiveByResource = new Map<string, string>();
  let current: SceneNode | null = null;
  let rootId: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const sub = line.match(/^\[sub_resource type="([^"]+)" id="([^"]+)"\]/);
    if (sub) {
      current = null;
      const primitive = sub[1].match(/(Box|Sphere|Plane|Cylinder|Torus)Mesh/);
      if (primitive) primitiveByResource.set(sub[2], primitive[1].toLowerCase());
      continue;
    }
    const header = line.match(/^\[node name="([^"]+)"(?: type="([^"]+)")?(?: parent="([^"]+)")?/);
    if (header) {
      const [, name, godotType = "Node3D", parentPath] = header;
      const kind = nodeTypeMap[godotType];
      if (!kind) {
        warnings.push(`${name}: ${godotType} was skipped (no web-engine equivalent yet).`);
        current = null;
        continue;
      }
      const parent = parentPath && parentPath !== "." ? nodes.find((node) => node.name === parentPath.split("/").at(-1)) : null;
      current = makeNode(name, kind, parent?.id ?? rootId, {});
      if (!rootId) {
        rootId = current.id;
        current.parentId = null;
      }
      if (godotType.includes("Directional")) current.props.lightType = "directional";
      if (godotType.includes("Omni")) current.props.lightType = "point";
      if (kind === "particles") {
        current.props.particleMode = "billboard";
        current.props.amount = 100;
        current.props.lifetime = 2;
        current.props.color = "#ffb454";
      }
      nodes.push(current);
      continue;
    }
    if (!current) continue;
    const pair = line.match(/^([\w/]+)\s*=\s*(.+)$/);
    if (!pair) continue;
    const [, key, rawValue] = pair;
    if (key === "position" || key === "translation") {
      current.transform.position = vec3(rawValue) ?? current.transform.position;
    } else if (key === "rotation_degrees") {
      current.transform.rotation = vec3(rawValue) ?? current.transform.rotation;
    } else if (key === "scale") {
      current.transform.scale = vec3(rawValue) ?? current.transform.scale;
    } else if (key === "transform") {
      const numbers = rawValue.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
      if (numbers && numbers.length >= 12) {
        current.transform.position = [numbers[9], numbers[10], numbers[11]];
      }
    } else if (key === "mesh") {
      const resourceId = rawValue.match(/SubResource\("([^"]+)"\)/)?.[1];
      current.props.shape = (resourceId && primitiveByResource.get(resourceId)) || "box";
      current.props.color = "#6f9dde";
      current.props.roughness = 0.45;
      current.props.metalness = 0.15;
    } else if (key === "light_energy" || key === "energy") {
      current.props.intensity = Number(rawValue) || 1;
    } else if (key === "fov") {
      current.props.fov = Number(rawValue) || 60;
    } else if (key === "amount") {
      current.props.amount = Number(rawValue) || 100;
    } else if (key === "lifetime") {
      current.props.lifetime = Number(rawValue) || 2;
    }
  }

  if (!nodes.length) {
    const root = makeNode(fallbackName, "world", null);
    nodes.push(root);
    warnings.push("No supported 3D nodes were found in this scene.");
  }
  return { name: fallbackName, nodes, warnings, filesRead: 1 };
}

export async function importGodotFiles(files: File[]): Promise<ImportResult> {
  const texts: { name: string; text: string }[] = [];
  for (const file of files) {
    if (file.name.toLowerCase().endsWith(".zip")) {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter(
        (entry) => !entry.dir && /\.(tscn|godot)$/i.test(entry.name),
      );
      for (const entry of entries) texts.push({ name: entry.name, text: await entry.async("text") });
    } else if (/\.(tscn|godot)$/i.test(file.name)) {
      texts.push({ name: file.name, text: await file.text() });
    }
  }
  if (!texts.length) throw new Error("No project.godot or .tscn scene files were found.");

  const project = texts.find((entry) => entry.name.endsWith("project.godot"));
  const configName = project?.text.match(/config\/name="([^"]+)"/)?.[1];
  const scenes = texts.filter((entry) => entry.name.toLowerCase().endsWith(".tscn"));
  if (!scenes.length) {
    throw new Error("The project contains no text-based .tscn 3D scenes.");
  }
  const mainPath = project?.text.match(/run\/main_scene="res:\/\/([^"]+)"/)?.[1];
  const selectedScene =
    scenes.find((entry) => entry.name.endsWith(mainPath ?? "__missing__")) ?? scenes[0];
  const fallbackName = selectedScene.name.split("/").at(-1)?.replace(/\.tscn$/i, "") ?? "Imported Scene";
  const result = parseTscn(selectedScene.text, configName ?? fallbackName);
  result.filesRead = texts.length;
  if (scenes.length > 1) {
    result.warnings.push(`Imported ${selectedScene.name}. ${scenes.length - 1} additional scene file(s) remain available in the source archive.`);
  }
  if (texts.some((entry) => /\.gd$/i.test(entry.name))) {
    result.warnings.push("GDScript files are preserved in the source project but can’t run in the browser engine.");
  }
  return result;
}
