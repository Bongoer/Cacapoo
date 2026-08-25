"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { RenderEffects, SceneNode, Vec3 } from "./types";

type TransformMode = "translate" | "rotate" | "scale";

interface Props {
  nodes: SceneNode[];
  selectedId: string | null;
  mode: TransformMode;
  playing: boolean;
  effects: RenderEffects;
  onSelect: (id: string | null) => void;
  onTransform: (
    id: string,
    transform: SceneNode["transform"],
  ) => void;
  onStats: (stats: { fps: number; triangles: number }) => void;
}

const toRadians = (degrees: number) => THREE.MathUtils.degToRad(degrees);
const toDegrees = (radians: number) => THREE.MathUtils.radToDeg(radians);

function disposeObject(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Points)) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) value.dispose();
      });
      material.dispose();
    });
  });
}

function geometryFor(shape: string) {
  switch (shape) {
    case "sphere":
      return new THREE.SphereGeometry(0.7, 32, 20);
    case "plane":
      return new THREE.PlaneGeometry(2, 2, 1, 1);
    case "cylinder":
      return new THREE.CylinderGeometry(0.6, 0.6, 1.4, 28);
    case "torus":
      return new THREE.TorusGeometry(0.7, 0.22, 18, 48);
    default:
      return new THREE.BoxGeometry(1.4, 1.4, 1.4, 2, 2, 2);
  }
}

function hologramMaterial(color: string) {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      void main() {
        float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.2);
        float lines = smoothstep(0.35, 0.85, sin(vWorldPosition.y * 48.0 - uTime * 7.0) * 0.5 + 0.5);
        float pulse = 0.72 + 0.28 * sin(uTime * 2.2);
        gl_FragColor = vec4(uColor * (1.2 + lines * 1.5), (0.3 + fresnel * 0.65 + lines * 0.16) * pulse);
      }
    `,
  });
}

function standardMaterial(node: SceneNode, textureCache: Map<string, THREE.Texture>) {
  let map: THREE.Texture | null = null;
  const textureData = String(node.props.textureData ?? "");
  if (textureData) {
    map = textureCache.get(textureData) ?? null;
    if (!map) {
      map = new THREE.TextureLoader().load(textureData);
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      textureCache.set(textureData, map);
    }
  }
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(String(node.props.color ?? "#7f96b5")),
    roughness: Number(node.props.roughness ?? 0.45),
    metalness: Number(node.props.metalness ?? 0.15),
    map,
  });
}

function createParticleObject(node: SceneNode) {
  const amount = Math.max(1, Math.min(2000, Number(node.props.amount ?? 100)));
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(amount * 3);
  const velocities = new Float32Array(amount * 3);
  const ages = new Float32Array(amount);
  const lifetime = Math.max(0.1, Number(node.props.lifetime ?? 2));
  const spread = Number(node.props.spread ?? 0.8);
  const speed = Number(node.props.speed ?? 1.5);
  const shape = String(node.props.emissionShape ?? "point");
  const reset = (index: number, randomAge = false) => {
    const i = index * 3;
    const theta = Math.random() * Math.PI * 2;
    const radius = shape === "sphere" ? Math.cbrt(Math.random()) * spread : 0;
    positions[i] = Math.cos(theta) * radius;
    positions[i + 1] = shape === "box" ? Math.random() * spread : Math.random() * 0.12;
    positions[i + 2] = Math.sin(theta) * radius;
    velocities[i] = (Math.random() - 0.5) * spread * speed;
    velocities[i + 1] = speed * (0.65 + Math.random() * 0.8);
    velocities[i + 2] = (Math.random() - 0.5) * spread * speed;
    ages[index] = randomAge ? Math.random() * lifetime : 0;
  };
  for (let i = 0; i < amount; i += 1) reset(i, true);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const mode = String(node.props.particleMode ?? "billboard");
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(String(node.props.color ?? "#ffb454")) },
      uSize: { value: Math.max(0.5, Number(node.props.size ?? 0.12) * 9) },
      uTime: { value: 0 },
      uFlipbook: { value: mode === "flipbook" ? 1 : 0 },
    },
    vertexShader: `
      uniform float uSize;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (220.0 / max(1.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform int uFlipbook;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        float alpha = smoothstep(0.5, 0.05, d);
        if (uFlipbook == 1) {
          float frame = mod(floor(uTime * 12.0), 4.0);
          float star = abs(uv.x) + abs(uv.y);
          alpha *= smoothstep(0.64 - frame * 0.055, 0.08, star);
        }
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(uColor * (1.4 + alpha), alpha);
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.userData.particleState = { positions, velocities, ages, lifetime, reset };
  return points;
}

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.45 } },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv; void main(){vec4 c=texture2D(tDiffuse,vUv);float d=distance(vUv,vec2(.5));c.rgb*=1.0-smoothstep(.28,.78,d)*strength;gl_FragColor=c;}`,
};

const ScanlineShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `uniform sampler2D tDiffuse;uniform float time;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);float line=.94+.06*sin(vUv.y*900.0+time*8.0);gl_FragColor=vec4(c.rgb*line,c.a);}`,
};

export default function EngineViewport({
  nodes,
  selectedId,
  mode,
  playing,
  effects,
  onSelect,
  onTransform,
  onStats,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rootRef = useRef<THREE.Group | null>(null);
  const objectMapRef = useRef(new Map<string, THREE.Object3D>());
  const controlsRef = useRef<TransformControls | null>(null);
  const textureCacheRef = useRef(new Map<string, THREE.Texture>());
  const callbacksRef = useRef({ onSelect, onTransform, onStats });
  const stateRef = useRef({ playing, effects });

  useEffect(() => {
    callbacksRef.current = { onSelect, onTransform, onStats };
  }, [onSelect, onStats, onTransform]);

  useEffect(() => {
    stateRef.current = { playing, effects };
  }, [playing, effects]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#10151d");
    scene.fog = new THREE.FogExp2("#10151d", 0);
    sceneRef.current = scene;
    const root = new THREE.Group();
    scene.add(root);
    rootRef.current = root;

    const camera = new THREE.PerspectiveCamera(54, 1, 0.05, 1000);
    camera.position.set(8.2, 6.3, 9.6);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.target.set(0, 1, 0);
    orbit.maxPolarAngle = Math.PI * 0.495;
    orbit.minDistance = 1.2;
    orbit.maxDistance = 90;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(0.82);
    transform.addEventListener("dragging-changed", (event) => {
      orbit.enabled = !event.value;
    });
    transform.addEventListener("objectChange", () => {
      const object = transform.object;
      const id = object?.userData.nodeId as string | undefined;
      if (!object || !id) return;
      callbacksRef.current.onTransform(id, {
        position: object.position.toArray() as Vec3,
        rotation: [
          toDegrees(object.rotation.x),
          toDegrees(object.rotation.y),
          toDegrees(object.rotation.z),
        ],
        scale: object.scale.toArray() as Vec3,
      });
    });
    scene.add(transform.getHelper());
    controlsRef.current = transform;

    const grid = new THREE.GridHelper(30, 30, "#37506f", "#263244");
    grid.position.y = 0.003;
    scene.add(grid);
    const axes = new THREE.AxesHelper(1.6);
    scene.add(axes);
    const ambient = new THREE.HemisphereLight("#b9d6ff", "#0a1018", 0.7);
    scene.add(ambient);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.5, 0.72);
    composer.addPass(bloom);
    const vignette = new ShaderPass(VignetteShader);
    composer.addPass(vignette);
    const scanlines = new ShaderPass(ScanlineShader);
    composer.addPass(scanlines);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    const pointerDown = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
    };
    const pointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([...objectMapRef.current.values()], true);
      const hit = hits.find((entry) => {
        let current: THREE.Object3D | null = entry.object;
        while (current && !current.userData.nodeId) current = current.parent;
        return Boolean(current?.userData.nodeId);
      });
      let current: THREE.Object3D | null = hit?.object ?? null;
      while (current && !current.userData.nodeId) current = current.parent;
      callbacksRef.current.onSelect((current?.userData.nodeId as string) ?? null);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);

    const clock = new THREE.Clock();
    let animationFrame = 0;
    let frames = 0;
    let statsTime = performance.now();
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.elapsedTime;
      const { effects: currentEffects, playing: isPlaying } = stateRef.current;
      renderer.toneMappingExposure = currentEffects.exposure;
      renderer.shadowMap.enabled = currentEffects.shadows;
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.density = currentEffects.fog ? currentEffects.fogDensity : 0;
      }
      bloom.enabled = currentEffects.bloom;
      bloom.strength = currentEffects.bloomStrength;
      vignette.enabled = currentEffects.vignette;
      scanlines.enabled = currentEffects.scanlines;
      scanlines.uniforms.time.value = elapsed;

      root.traverse((object) => {
        const material = (object as THREE.Mesh).material;
        if (material instanceof THREE.ShaderMaterial && material.uniforms.uTime) {
          material.uniforms.uTime.value = elapsed;
        }
        if (object instanceof THREE.Points && object.userData.particleState) {
          const state = object.userData.particleState;
          if (isPlaying) {
            for (let i = 0; i < state.ages.length; i += 1) {
              state.ages[i] += delta;
              if (state.ages[i] > state.lifetime) {
                state.reset(i);
                continue;
              }
              const p = i * 3;
              state.velocities[p + 1] -= 0.35 * delta;
              state.positions[p] += state.velocities[p] * delta;
              state.positions[p + 1] += state.velocities[p + 1] * delta;
              state.positions[p + 2] += state.velocities[p + 2] * delta;
            }
            object.geometry.attributes.position.needsUpdate = true;
          }
        }
      });
      orbit.update();
      composer.render();
      frames += 1;
      const now = performance.now();
      if (now - statsTime > 600) {
        callbacksRef.current.onStats({
          fps: Math.round((frames * 1000) / (now - statsTime)),
          triangles: renderer.info.render.triangles,
        });
        frames = 0;
        statsTime = now;
      }
    };
    animate();

    const textureCache = textureCacheRef.current;
    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      transform.detach();
      transform.dispose();
      orbit.dispose();
      composer.dispose();
      renderer.dispose();
      textureCache.forEach((texture) => texture.dispose());
      textureCache.clear();
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
      rootRef.current = null;
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    controlsRef.current?.detach();
    while (root.children.length) {
      const child = root.children.pop();
      if (child) disposeObject(child);
    }
    objectMapRef.current.clear();

    const objects = new Map<string, THREE.Object3D>();
    nodes.forEach((node) => {
      if (node.kind === "world" || node.kind === "environment") return;
      let object: THREE.Object3D;
      if (node.kind === "mesh") {
        const material =
          node.props.material === "hologram"
            ? hologramMaterial(String(node.props.color ?? "#68f5d2"))
            : standardMaterial(node, textureCacheRef.current);
        const mesh = new THREE.Mesh(geometryFor(String(node.props.shape)), material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        object = mesh;
      } else if (node.kind === "light") {
        const color = String(node.props.color ?? "#ffffff");
        const intensity = Number(node.props.intensity ?? 2);
        if (node.props.lightType === "point") {
          const light = new THREE.PointLight(color, intensity, 20, 1.6);
          light.castShadow = true;
          const marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 12, 8),
            new THREE.MeshBasicMaterial({ color }),
          );
          light.add(marker);
          object = light;
        } else {
          const light = new THREE.DirectionalLight(color, intensity);
          light.castShadow = true;
          light.shadow.mapSize.set(1024, 1024);
          light.shadow.camera.left = light.shadow.camera.bottom = -12;
          light.shadow.camera.right = light.shadow.camera.top = 12;
          object = light;
        }
      } else if (node.kind === "particles") {
        if (node.props.particleMode === "trail") {
          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(-0.4, 0.6, 0.2),
            new THREE.Vector3(0.3, 0.25, -0.2),
            new THREE.Vector3(1, 0.9, 0),
          ]);
          object = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 42, Number(node.props.size ?? 0.08), 8, false),
            new THREE.MeshBasicMaterial({
              color: String(node.props.color ?? "#77e8ff"),
              transparent: true,
              opacity: 0.8,
              blending: THREE.AdditiveBlending,
            }),
          );
        } else {
          object = createParticleObject(node);
        }
      } else {
        const group = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.25, 0.45),
          new THREE.MeshBasicMaterial({ color: "#9ab8dc", wireframe: true }),
        );
        const lens = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.12, 0.2, 12),
          new THREE.MeshBasicMaterial({ color: "#77e8ff", wireframe: true }),
        );
        lens.rotation.x = Math.PI / 2;
        lens.position.z = -0.28;
        group.add(body, lens);
        object = group;
      }
      object.name = node.name;
      object.userData.nodeId = node.id;
      object.visible = node.visible;
      object.position.fromArray(node.transform.position);
      object.rotation.set(
        toRadians(node.transform.rotation[0]),
        toRadians(node.transform.rotation[1]),
        toRadians(node.transform.rotation[2]),
      );
      object.scale.fromArray(node.transform.scale);
      objects.set(node.id, object);
    });

    nodes.forEach((node) => {
      const object = objects.get(node.id);
      if (!object) return;
      const parent = node.parentId ? objects.get(node.parentId) : undefined;
      (parent ?? root).add(object);
    });
    objectMapRef.current = objects;
    const selected = selectedId ? objects.get(selectedId) : undefined;
    if (selected) controlsRef.current?.attach(selected);
  }, [nodes, selectedId]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.setMode(mode);
    const selected = selectedId
      ? objectMapRef.current.get(selectedId)
      : undefined;
    if (selected) controls.attach(selected);
    else controls.detach();
  }, [mode, selectedId]);

  return <div ref={mountRef} className="engine-viewport" aria-label="3D viewport" />;
}
