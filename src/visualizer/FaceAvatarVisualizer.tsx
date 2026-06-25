/**
 * Face Avatar Visualizer (Web / three.js)
 *
 * olumo の Filament ASV と同じ face.glb（バスト型・unlit・頂点カラー＋モーフ
 * Fcl_MTH_A/I/U/E/O・Fcl_EYE_Close）を three.js で描画し、rms＋state で口パク駆動する。
 * 口パクは自己完結（rms で口の開き、state=speaking 中に母音を切替）。
 */
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { BaseVisualizerProps } from './core/types';

const VOWELS = ['Fcl_MTH_A', 'Fcl_MTH_I', 'Fcl_MTH_U', 'Fcl_MTH_E', 'Fcl_MTH_O'] as const;
const BLINK = 'Fcl_EYE_Close';

export interface FaceAvatarVisualizerProps extends BaseVisualizerProps {
  backgroundColor?: string;
}

export const FaceAvatarVisualizer: React.FC<FaceAvatarVisualizerProps> = ({
  audioLevel,
  state,
  width,
  height,
  backgroundColor = '#353535',
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  // 最新 props をループから参照するための ref
  const audioRef = useRef(audioLevel);
  const stateRef = useRef(state);
  audioRef.current = audioLevel;
  stateRef.current = state;

  // three オブジェクト保持
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // 初期化（マウント時1回）。width/height/bg は別 effect で反映。
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    cameraRef.current = camera;

    // unlit(MeshBasicMaterial)＋頂点カラーのため光源不要だが、保険に弱い環境光。
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    const morphMeshes: THREE.Mesh[] = [];
    const dict: Record<string, number> = {};
    let blinkTimer = 0;
    let blinkUntil = 0;
    let vowelIdx = 0;
    let vowelSwitchAt = 0;
    let mouthSmooth = 0;
    let blinkSmooth = 0;
    const vowelWeights = new Float32Array(VOWELS.length);

    const loader = new GLTFLoader();
    const url = `${import.meta.env.BASE_URL}models/face.glb`;
    let disposed = false;

    loader.load(url, (gltf) => {
      if (disposed) return;
      const root = gltf.scene;
      scene.add(root);

      // モーフを持つメッシュと名前→indexを収集
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
          morphMeshes.push(mesh);
          for (const [name, idx] of Object.entries(mesh.morphTargetDictionary)) {
            dict[name] = idx as number;
          }
        }
      });

      // 顔寄せカメラ（olumo の camDistMul=1.6 / camTargetFrac=0.35 を踏襲）。
      // Blender 顔前面 -Y は glTF(yup) で +Z を向くので、カメラは +Z 側から見る。
      const box = new THREE.Box3().setFromObject(root);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const ext = size.clone().multiplyScalar(0.5);
      const radius = Math.max(ext.x, ext.y, ext.z) || 1;
      const target = new THREE.Vector3(center.x, center.y + ext.y * 0.35, center.z);
      const dist = radius * 1.6;
      camera.position.set(target.x, target.y + dist * 0.05, target.z + dist);
      camera.lookAt(target);
      camera.userData.target = target;
    });

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const now = clock.elapsedTime * 1000;
      const speaking = stateRef.current === 'speaking';
      const level = Math.max(0, Math.min(1, audioRef.current));

      // 口の開き: 発話中のみ rms で開く（スムージング）
      const mouthTarget = speaking ? Math.min(1, 0.15 + level * 1.1) : 0;
      mouthSmooth += (mouthTarget - mouthSmooth) * Math.min(1, dt * 18);

      // 母音切替: 発話中、rms が高いほど速く切替（A/O を出やすく）
      if (speaking) {
        const interval = 90 + (1 - level) * 140;
        if (now >= vowelSwitchAt) {
          vowelSwitchAt = now + interval;
          // 高 rms は大きく開く A/O を優先、低めは I/U/E
          vowelIdx = level > 0.5
            ? (Math.random() < 0.6 ? (Math.random() < 0.5 ? 0 : 4) : Math.floor(Math.random() * 5))
            : Math.floor(Math.random() * 5);
        }
      }
      // 各母音重みをスムーズに目標へ
      for (let i = 0; i < VOWELS.length; i++) {
        const tgt = speaking && i === vowelIdx ? mouthSmooth : 0;
        vowelWeights[i] += (tgt - vowelWeights[i]) * Math.min(1, dt * 16);
      }

      // まばたき: 3〜5秒間隔、約120ms 閉眼
      if (now >= blinkTimer) {
        blinkTimer = now + 3000 + Math.random() * 2000;
        blinkUntil = now + 120;
      }
      const blinkTarget = now < blinkUntil ? 1 : 0;
      blinkSmooth += (blinkTarget - blinkSmooth) * Math.min(1, dt * 22);

      // 軽い頭の揺れ（生命感）
      if (morphMeshes.length) {
        const sway = speaking ? 1 : 0.4;
        const root = morphMeshes[0].parent;
        if (root) {
          root.rotation.y = Math.sin(clock.elapsedTime * 1.1) * 0.04 * sway;
          root.rotation.x = Math.sin(clock.elapsedTime * 1.7 + 0.5) * 0.02 * sway;
        }
      }

      // モーフ適用
      for (const mesh of morphMeshes) {
        const infl = mesh.morphTargetInfluences!;
        for (let i = 0; i < VOWELS.length; i++) {
          const idx = dict[VOWELS[i]];
          if (idx !== undefined) infl[idx] = vowelWeights[i];
        }
        const bidx = dict[BLINK];
        if (bidx !== undefined) infl[bidx] = blinkSmooth;
      }

      const cam = cameraRef.current;
      if (cam) renderer.render(scene, cam);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) mat.dispose();
      });
    };
  }, []);

  // サイズ・背景の反映
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!renderer || !camera) return;
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = `${width}px`;
    renderer.domElement.style.height = `${height}px`;
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    const c = new THREE.Color(backgroundColor);
    renderer.setClearColor(c, 1);
  }, [width, height, backgroundColor]);

  return <div ref={mountRef} style={{ width, height }} />;
};
