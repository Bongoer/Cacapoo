# VoxelForge 3D

A browser-based 3D engine prototype with a Godot-inspired editor. Everything runs locally in the browser and can be hosted as a static GitHub Pages site.

## Included

- WebGL 3D viewport with orbit navigation, object picking, transform gizmos, shadows, PBR materials, and a scene tree
- Meshes, cameras, directional and point lights
- Billboard, procedural flipbook, and trail particle renderers
- Bloom, fog, vignette, scanline, exposure, and shadow controls
- A live GLSL hologram material
- EditableImage-style canvas painting that can be applied to a mesh as a texture
- `.vforge` project save and load
- Godot 3/4 text-scene converter for common `Node3D`, `MeshInstance3D`, lights, cameras, and particle nodes
- Responsive phone layout with slide-out Scene and Inspector panels

## Run locally

```bash
npm install
npm run build:pages
npm run preview:pages
```

## Publish with GitHub Pages

1. Create an empty GitHub repository.
2. Upload every file from this project to the repository, preserving the folders.
3. In the repository, open **Settings > Pages**.
4. Under **Build and deployment**, choose **GitHub Actions** as the source.
5. Push to the `main` branch. The included workflow builds and publishes the editor.
6. Open the Actions tab and wait for **Deploy VoxelForge to GitHub Pages** to finish.

The generated page uses relative asset paths, so it works from a repository subpath such as `https://username.github.io/voxelforge-3d/`.

## Godot converter scope

Import a `.zip` containing `project.godot` and text-based `.tscn` scenes, or select `.godot` and `.tscn` files together. The converter reads the main scene when it can find it. It maps common 3D nodes and primitive mesh resources. Godot scripts, binary `.scn` scenes, imported models, physics behavior, animation graphs, and engine-specific shaders aren’t executable in this browser runtime; unsupported items are listed after import.
