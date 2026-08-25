export type Vec3 = [number, number, number];

export type NodeKind =
  | "world"
  | "mesh"
  | "light"
  | "camera"
  | "particles"
  | "environment";

export type MeshShape = "box" | "sphere" | "plane" | "cylinder" | "torus";
export type ParticleMode = "billboard" | "flipbook" | "trail";

export interface SceneNode {
  id: string;
  name: string;
  kind: NodeKind;
  parentId: string | null;
  visible: boolean;
  transform: {
    position: Vec3;
    rotation: Vec3;
    scale: Vec3;
  };
  props: Record<string, string | number | boolean | undefined>;
}

export interface RenderEffects {
  bloom: boolean;
  bloomStrength: number;
  fog: boolean;
  fogDensity: number;
  vignette: boolean;
  scanlines: boolean;
  shadows: boolean;
  exposure: number;
}

export interface ProjectData {
  format: "voxelforge-project";
  version: 1;
  name: string;
  nodes: SceneNode[];
  effects: RenderEffects;
  savedAt: string;
}

export const makeId = () =>
  globalThis.crypto?.randomUUID?.() ?? `node-${Date.now()}-${Math.random()}`;

export const defaultEffects: RenderEffects = {
  bloom: true,
  bloomStrength: 0.7,
  fog: false,
  fogDensity: 0.025,
  vignette: true,
  scanlines: false,
  shadows: true,
  exposure: 1,
};

export const makeNode = (
  name: string,
  kind: NodeKind,
  parentId: string | null,
  props: SceneNode["props"] = {},
): SceneNode => ({
  id: makeId(),
  name,
  kind,
  parentId,
  visible: true,
  transform: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  props,
});

export function createStarterScene(): SceneNode[] {
  const world = makeNode("World", "world", null);
  const camera = makeNode("Camera3D", "camera", world.id, { fov: 60 });
  camera.transform.position = [7, 5, 8];
  const sun = makeNode("Sun", "light", world.id, {
    lightType: "directional",
    color: "#fff2d2",
    intensity: 2.4,
  });
  sun.transform.position = [4, 7, 5];
  sun.transform.rotation = [-45, -35, 0];
  const floor = makeNode("Ground", "mesh", world.id, {
    shape: "plane",
    color: "#273343",
    roughness: 0.82,
    metalness: 0.06,
  });
  floor.transform.rotation = [-90, 0, 0];
  floor.transform.scale = [5, 5, 5];
  const cube = makeNode("Energy Crate", "mesh", world.id, {
    shape: "box",
    color: "#4f8cff",
    roughness: 0.28,
    metalness: 0.55,
    material: "standard",
  });
  cube.transform.position = [0, 1, 0];
  const orb = makeNode("Hologram", "mesh", world.id, {
    shape: "sphere",
    color: "#68f5d2",
    material: "hologram",
    roughness: 0.2,
    metalness: 0.1,
  });
  orb.transform.position = [-2.4, 1.25, -0.5];
  const particles = makeNode("Flipbook Sparks", "particles", world.id, {
    particleMode: "flipbook",
    emissionShape: "sphere",
    amount: 110,
    lifetime: 2.4,
    speed: 1.8,
    size: 0.13,
    color: "#ffb454",
    spread: 0.85,
    playing: true,
  });
  particles.transform.position = [2.4, 0.25, 0];
  return [world, camera, sun, floor, cube, orb, particles];
}
