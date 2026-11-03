// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared three.js preview: Z-up build plate, orbit camera, renders only when something changes.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Part } from './mesh';

export interface ViewPart extends Part {
  /** Smooth normals (for organic surfaces like lithophanes) instead of crisp flat faces. */
  smooth?: boolean;
  /** Optional per-vertex RGB colours, rendered without lighting. */
  colors?: Float32Array;
}

export class Viewer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
  private controls: OrbitControls;
  private group = new THREE.Group();
  private grid?: THREE.Group;
  private resize: ResizeObserver;
  private frame = 0;
  private lastRadius = 0;
  private onTheme = () => this.refreshTheme();

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'viewer-canvas';
    container.appendChild(this.canvas);

    this.camera.up.set(0, 0, 1);
    this.camera.position.set(0, -120, 90);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.addEventListener('change', () => this.render());

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-80, -120, 200);
    const rim = new THREE.DirectionalLight(0xffffff, 0.9);
    rim.position.set(120, 140, 60);
    this.scene.add(key, rim, this.group);

    this.resize = new ResizeObserver(() => this.onResize());
    this.resize.observe(container);
    window.addEventListener('themechange', this.onTheme);
    this.onResize();
  }

  private onResize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  render(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.renderer.render(this.scene, this.camera);
    });
  }

  setParts(parts: ViewPart[], opts: { fit?: boolean } = {}): void {
    for (const child of [...this.group.children]) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.group.remove(child);
    }
    for (const part of parts) {
      let geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(part.mesh.positions, 3));
      if (part.colors) geo.setAttribute('color', new THREE.BufferAttribute(part.colors, 3));
      geo.setIndex(new THREE.BufferAttribute(part.mesh.indices, 1));
      if (!part.smooth) {
        const flat = geo.toNonIndexed();
        geo.dispose();
        geo = flat;
      }
      geo.computeVertexNormals();
      const material = part.colors
        ? new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.6, metalness: 0.05 });
      this.group.add(new THREE.Mesh(geo, material));
    }

    const box = new THREE.Box3().setFromObject(this.group);
    if (box.isEmpty()) {
      this.render();
      return;
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.updateGrid(box);
    const changed = Math.abs(sphere.radius - this.lastRadius) > this.lastRadius * 0.35;
    if (opts.fit || changed || !this.lastRadius) this.fit(sphere);
    this.lastRadius = sphere.radius;
    this.render();
  }

  private fit(sphere: THREE.Sphere): void {
    const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.05;
    const dir = new THREE.Vector3(0.25, -1, 0.85).normalize();
    this.controls.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).addScaledVector(dir, dist);
    this.camera.near = dist / 100;
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  private updateGrid(box: THREE.Box3): void {
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.traverse((o) => {
        const m = o as THREE.LineSegments;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
    }
    const size = Math.max(box.max.x - box.min.x, box.max.y - box.min.y);
    const step = size > 150 ? 20 : size > 60 ? 10 : 5;
    const extent = Math.ceil((size * 1.6) / step / 2) * step * 2;
    const css = getComputedStyle(document.documentElement);
    const major = new THREE.Color(css.getPropertyValue('--grid-major').trim() || '#888');
    const minor = new THREE.Color(css.getPropertyValue('--grid-minor').trim() || '#ccc');
    const grid = new THREE.GridHelper(extent, extent / step, major, minor);
    grid.rotation.x = Math.PI / 2;
    const g = new THREE.Group();
    g.add(grid);
    g.position.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.min.z - 0.01);
    this.grid = g;
    this.scene.add(g);
  }

  resetView(): void {
    const box = new THREE.Box3().setFromObject(this.group);
    if (!box.isEmpty()) this.fit(box.getBoundingSphere(new THREE.Sphere()));
    this.render();
  }

  /** Re-reads theme colours after switching light/dark. */
  private refreshTheme(): void {
    const box = new THREE.Box3().setFromObject(this.group);
    if (!box.isEmpty()) this.updateGrid(box);
    this.render();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    window.removeEventListener('themechange', this.onTheme);
    this.controls.dispose();
    this.setParts([]);
    this.renderer.dispose();
    this.canvas.remove();
  }
}
