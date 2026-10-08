import React, { useEffect, useState } from 'react';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as THREE from 'three';
import { DRACO_LIB_PATH } from '../simulation/constants';

const SIZE = 128;
const cache = new Map<string, string>();
const cacheKey = (color: string) => `${color}|flat`;
let modelPromise: Promise<THREE.Group> | null = null;
let queue: Promise<void> = Promise.resolve();

function loadModel(): Promise<THREE.Group> {
  if (!modelPromise) {
    modelPromise = new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      const draco = new DRACOLoader();
      draco.setDecoderPath(DRACO_LIB_PATH);
      loader.setDRACOLoader(draco);
      loader.load(
        `${import.meta.env.BASE_URL}models/character.glb`,
        (gltf) => {
          gltf.scene.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh) return;
            const name = mesh.name.toLowerCase();
            if (name.includes('headphone') || name.includes('cap')) mesh.visible = false;
          });
          resolve(gltf.scene);
          draco.dispose();
        },
        undefined,
        (error) => {
          modelPromise = null;
          reject(error);
        },
      );
    });
  }
  return modelPromise;
}

function paint(color: string): Promise<string> {
  const hit = cache.get(cacheKey(color));
  if (hit) return Promise.resolve(hit);
  const job = queue.then(async () => {
    const again = cache.get(cacheKey(color));
    if (again) return again;
    const source = await loadModel();
    const character = source.clone(true);
    character.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name = mesh.name.toLowerCase();
      const sourceMat = mesh.material as THREE.MeshStandardMaterial;
      if (name.includes('body')) {
        mesh.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
        return;
      }
      if (sourceMat?.map) {
        mesh.material = new THREE.MeshBasicMaterial({ map: sourceMat.map, transparent: true });
      }
    });

    character.updateMatrixWorld(true);
    let focus: THREE.Object3D | null = null;
    character.traverse((obj) => {
      if (focus) return;
      const name = obj.name.toLowerCase();
      if (name.includes('eye') || name === 'head') focus = obj;
    });
    const box = new THREE.Box3().setFromObject(focus ?? character);
    const size = box.getSize(new THREE.Vector3());
    const head = box.getCenter(new THREE.Vector3());
    const distance = Math.max(size.y, size.x, 0.15) * 1.35;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    camera.position.set(head.x, head.y + size.y * 0.2, head.z + distance);
    camera.lookAt(head.x, head.y + size.y * 0.08, head.z);

    const scene = new THREE.Scene();
    scene.add(character);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(SIZE, SIZE);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    renderer.dispose();
    cache.set(cacheKey(color), url);
    return url;
  });
  queue = job.then(() => undefined, () => undefined);
  return job;
}

export const AgentPortrait: React.FC<{ color: string; className?: string }> = ({ color, className }) => {
  const [src, setSrc] = useState<string | null>(() => cache.get(cacheKey(color)) ?? null);

  useEffect(() => {
    let live = true;
    const known = cache.get(cacheKey(color));
    if (known) {
      setSrc(known);
      return;
    }
    void paint(color).then((url) => {
      if (live) setSrc(url);
    }).catch(() => {
      if (live) setSrc(null);
    });
    return () => {
      live = false;
    };
  }, [color]);

  if (!src) {
    return <span className={className} style={{ backgroundColor: color }} />;
  }

  return <img src={src} alt="" className={`${className ?? ''} object-cover`} />;
};
