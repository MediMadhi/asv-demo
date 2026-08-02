import React, { useEffect, useRef, useState } from 'react';
import { Euler, Matrix4, Vector3 } from 'three';
import type { VisualizerState } from './core/types';

interface FilamentWebGLVisualizerProps {
  width: number;
  height: number;
  color: string;
  backgroundColor: string;
  audioLevel?: number;
  zcr?: number;
  rmsHigh?: number;
  state?: VisualizerState;
}

type FilamentApi = Record<string, any>;

declare global {
  interface Window {
    Filament?: FilamentApi;
  }
}

const FILAMENT_ROOT = `${import.meta.env.BASE_URL}filament/`;
const FILAMENT_SCRIPT_URL = `${FILAMENT_ROOT}filament.js`;
const FILAMENT_MATERIAL_URL = `${FILAMENT_ROOT}filamentAvatar.filamat`;

let filamentReadyPromise: Promise<FilamentApi> | null = null;

const loadFilament = (): Promise<FilamentApi> => {
  if (filamentReadyPromise) return filamentReadyPromise;

  filamentReadyPromise = new Promise((resolve, reject) => {
    const initialize = () => {
      const filament = window.Filament;
      if (!filament) {
        reject(new Error('Filament WebGL runtime was not loaded.'));
        return;
      }

      let settled = false;
      const timeout = window.setTimeout(() => {
        if (!settled) reject(new Error('Filament WebGL initialization timed out.'));
      }, 15000);
      filament.init([FILAMENT_MATERIAL_URL], () => {
        settled = true;
        window.clearTimeout(timeout);
        resolve(window.Filament ?? filament);
      });
    };

    if (window.Filament) {
      initialize();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${FILAMENT_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener('load', initialize, { once: true });
      existing.addEventListener('error', () => reject(new Error('Filament WebGL script failed to load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = FILAMENT_SCRIPT_URL;
    script.async = true;
    script.addEventListener('load', initialize, { once: true });
    script.addEventListener('error', () => reject(new Error('Filament WebGL script failed to load.')), { once: true });
    document.head.appendChild(script);
  });

  return filamentReadyPromise;
};

const CUBE_POSITIONS = new Float32Array([
  -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5,
   0.5, -0.5, -0.5,  -0.5, -0.5, -0.5,  -0.5,  0.5, -0.5,   0.5,  0.5, -0.5,
   0.5, -0.5,  0.5,   0.5, -0.5, -0.5,   0.5,  0.5, -0.5,   0.5,  0.5,  0.5,
  -0.5, -0.5, -0.5,  -0.5, -0.5,  0.5,  -0.5,  0.5,  0.5,  -0.5,  0.5, -0.5,
  -0.5,  0.5,  0.5,   0.5,  0.5,  0.5,   0.5,  0.5, -0.5,  -0.5,  0.5, -0.5,
  -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,   0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,
]);

const CUBE_INDICES = new Uint16Array([
   0,  1,  2,  0,  2,  3,   4,  5,  6,  4,  6,  7,
   8,  9, 10,  8, 10, 11,  12, 13, 14, 12, 14, 15,
  16, 17, 18, 16, 18, 19,  20, 21, 22, 20, 22, 23,
]);

const FACE_SHADES = [0.95, 0.70, 0.60, 0.80, 1.00, 0.50];
const CUBE_COLORS = new Uint32Array(24);
FACE_SHADES.forEach((shade, face) => {
  const byte = Math.round(shade * 255);
  const packed = (0xff000000 | (byte << 16) | (byte << 8) | byte) >>> 0;
  CUBE_COLORS.fill(packed, face * 4, face * 4 + 4);
});

const parseHexColor = (value: string): [number, number, number] => {
  const match = /^#([0-9a-f]{6})$/iu.exec(value);
  if (!match) return [1, 1, 1];
  const packed = Number.parseInt(match[1], 16);
  return [((packed >> 16) & 0xff) / 255, ((packed >> 8) & 0xff) / 255, (packed & 0xff) / 255];
};

interface MotionRuntime {
  smoothedLevel: number;
  smoothedStateScale: number;
  smoothedGradient: number;
  smoothedZcr: number;
  euler: [number, number, number];
  lastTime: number;
}

export const FilamentWebGLVisualizer: React.FC<FilamentWebGLVisualizerProps> = ({
  width,
  height,
  color,
  backgroundColor,
  audioLevel = 0,
  zcr = 0,
  rmsHigh = 0,
  state = 'listening',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestRef = useRef({ width, height, color, backgroundColor, audioLevel, zcr, rmsHigh, state });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  latestRef.current = { width, height, color, backgroundColor, audioLevel, zcr, rmsHigh, state };

  useEffect(() => {
    let disposed = false;
    let animationFrame = 0;
    let teardown: (() => void) | null = null;

    const setup = async () => {
      try {
        const filament = await loadFilament();
        const canvas = canvasRef.current;
        if (disposed || !canvas) return;

        const engine = filament.Engine.create(canvas, {
          majorVersion: 2,
          backend: filament.Backend.OPENGL,
        });
        const scene = engine.createScene();
        const cube = filament.EntityManager.get().create();
        scene.addEntity(cube);

        const vertexBuffer = filament.VertexBuffer.Builder()
          .vertexCount(24)
          .bufferCount(2)
          .attribute(filament.VertexAttribute.POSITION, 0, filament.VertexBuffer$AttributeType.FLOAT3, 0, 12)
          .attribute(filament.VertexAttribute.COLOR, 1, filament.VertexBuffer$AttributeType.UBYTE4, 0, 4)
          .normalized(filament.VertexAttribute.COLOR)
          .build(engine);
        vertexBuffer.setBufferAt(engine, 0, CUBE_POSITIONS);
        vertexBuffer.setBufferAt(engine, 1, CUBE_COLORS);

        const indexBuffer = filament.IndexBuffer.Builder()
          .indexCount(CUBE_INDICES.length)
          .bufferType(filament.IndexBuffer$IndexType.USHORT)
          .build(engine);
        indexBuffer.setBuffer(engine, CUBE_INDICES);

        const material = engine.createMaterial(FILAMENT_MATERIAL_URL);
        const materialInstance = material.createInstance();
        materialInstance.setColor3Parameter('voiceColor', filament.RgbType.sRGB, [0.12, 0.45, 1.0]);
        materialInstance.setFloatParameter('audioLevel', 0);
        materialInstance.setFloatParameter('gradientAmount', 0);

        filament.RenderableManager.Builder(1)
          .boundingBox({ center: [0, 0, 0], halfExtent: [0.5, 0.5, 0.5] })
          .material(0, materialInstance)
          .geometry(0, filament.RenderableManager$PrimitiveType.TRIANGLES, vertexBuffer, indexBuffer)
          .culling(false)
          .castShadows(false)
          .receiveShadows(false)
          .build(engine, cube);

        const swapChain = engine.createSwapChain();
        const renderer = engine.createRenderer();
        const cameraEntity = filament.EntityManager.get().create();
        const camera = engine.createCamera(cameraEntity);
        const view = engine.createView();
        view.setSampleCount(4);
        view.setCamera(camera);
        view.setScene(scene);
        view.setPostProcessingEnabled(false);
        camera.lookAt([0, 0, 5.2], [0, 0, 0], [0, 1, 0]);

        const motion: MotionRuntime = {
          smoothedLevel: 0,
          smoothedStateScale: 1,
          smoothedGradient: 0,
          smoothedZcr: 0,
          euler: [0, 0, 0],
          lastTime: performance.now() / 1000,
        };
        const rotation = new Matrix4();
        const euler = new Euler(0, 0, 0, 'ZYX');
        const scaleVector = new Vector3(1, 1, 1);
        let viewportWidth = 0;
        let viewportHeight = 0;

        const render = (frameTimeMs: number) => {
          if (disposed) return;
          const input = latestRef.current;
          const now = frameTimeMs / 1000;
          const dt = Math.min(0.1, Math.max(0, now - motion.lastTime));
          motion.lastTime = now;
          const rawLevel = Math.max(0, Math.min(1, input.audioLevel));

          let spin: [number, number, number];
          let reactivity: number;
          let baseBreath: number;
          let breathSpeed: number;
          let stateScale: number;
          let spinLevelGain: number;

          if (input.state === 'speaking') {
            spin = [0, -30, -10]; reactivity = 0.75; baseBreath = 0.03;
            breathSpeed = 2.0; stateScale = 1.0; spinLevelGain = 6.0;
          } else if (input.state === 'thinking') {
            spin = [46, 78, 28]; reactivity = 0.1; baseBreath = 0.09;
            breathSpeed = 6.0; stateScale = 1.1; spinLevelGain = 0.6;
          } else if (input.state === 'muted') {
            spin = [0, 3, 0]; reactivity = 0; baseBreath = 0.02;
            breathSpeed = 1.0; stateScale = 0.7; spinLevelGain = 0;
          } else if (input.state === 'idle') {
            spin = [0, 8, 0]; reactivity = 0.08; baseBreath = 0.03;
            breathSpeed = 1.5; stateScale = 0.9; spinLevelGain = 0.25;
          } else {
            spin = [0, 14, 0]; reactivity = 0.18; baseBreath = 0.045;
            breathSpeed = 2.1; stateScale = 0.95; spinLevelGain = 0.6;
          }

          const levelSmoothing = rawLevel > motion.smoothedLevel ? 18 : 8;
          motion.smoothedLevel += (rawLevel - motion.smoothedLevel) * (1 - Math.exp(-levelSmoothing * dt));
          motion.smoothedStateScale += (stateScale - motion.smoothedStateScale) * (1 - Math.exp(-6 * dt));
          const gradientTarget = input.state === 'listening' ? 1 : 0;
          motion.smoothedGradient += (gradientTarget - motion.smoothedGradient) * (1 - Math.exp(-6 * dt));
          const audioGate = Math.max(0, Math.min(1, (rawLevel - 0.004) / 0.02));
          const zcrTarget = Math.max(0, Math.min(1, input.zcr * 5)) * audioGate;
          motion.smoothedZcr += (zcrTarget - motion.smoothedZcr) * (1 - Math.exp(-12 * dt));

          const angularGain = 1 + (motion.smoothedLevel + input.rmsHigh) * spinLevelGain;
          const degreesToRadians = Math.PI / 180;
          motion.euler[0] += (spin[0] * angularGain + motion.smoothedZcr * 120) * dt * degreesToRadians;
          motion.euler[1] += spin[1] * angularGain * dt * degreesToRadians;
          motion.euler[2] += (spin[2] * angularGain + motion.smoothedZcr * 160) * dt * degreesToRadians;

          const jitterMultiplier = input.state === 'speaking' ? 0.3 : 1;
          const jitterAmplitude = motion.smoothedZcr * 7 * jitterMultiplier * degreesToRadians;
          const jitterX = Math.sin(now * 53) * jitterAmplitude;
          const jitterY = Math.sin(now * 61) * jitterAmplitude;
          const jitterZ = Math.sin(now * 47) * jitterAmplitude;
          const breath = 1 + Math.sin(now * breathSpeed) * baseBreath;
          const pulse = 1 + motion.smoothedLevel * reactivity;
          const scale = breath * pulse * motion.smoothedStateScale * 1.2;

          euler.set(
            motion.euler[0] + jitterX,
            motion.euler[1] + jitterY,
            motion.euler[2] + jitterZ,
            'ZYX',
          );
          rotation.makeRotationFromEuler(euler);
          rotation.scale(scaleVector.set(scale, scale, scale));
          const transformManager = engine.getTransformManager();
          const transformInstance = transformManager.getInstance(cube);
          transformManager.setTransform(transformInstance, rotation.elements);
          transformInstance.delete();

          const accent = parseHexColor(input.color);
          const background = parseHexColor(input.backgroundColor);
          materialInstance.setColor3Parameter('baseColor', filament.RgbType.sRGB, accent);
          materialInstance.setFloatParameter('audioLevel', motion.smoothedLevel);
          materialInstance.setFloatParameter('gradientAmount', motion.smoothedGradient);
          renderer.setClearOptions({ clearColor: [...background, 1], clear: true });

          const dpr = window.devicePixelRatio || 1;
          const targetWidth = Math.max(1, Math.round(input.width * dpr));
          const targetHeight = Math.max(1, Math.round(input.height * dpr));
          if (targetWidth !== viewportWidth || targetHeight !== viewportHeight) {
            viewportWidth = targetWidth;
            viewportHeight = targetHeight;
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            view.setViewport([0, 0, targetWidth, targetHeight]);
            camera.setProjectionFov(45, targetWidth / targetHeight, 0.1, 50, filament.Camera$Fov.VERTICAL);
          }

          renderer.render(swapChain, view);
          animationFrame = window.requestAnimationFrame(render);
        };

        teardown = () => {
          window.cancelAnimationFrame(animationFrame);
          scene.remove(cube);
          engine.destroyEntity(cube);
          cube.delete();
          engine.destroyCameraComponent(cameraEntity);
          engine.destroyEntity(cameraEntity);
          cameraEntity.delete();
          engine.destroyVertexBuffer(vertexBuffer);
          engine.destroyIndexBuffer(indexBuffer);
          engine.destroyMaterialInstance(materialInstance);
          engine.destroyMaterial(material);
          engine.destroyView(view);
          engine.destroyScene(scene);
          engine.destroyRenderer(renderer);
          engine.destroySwapChain(swapChain);
          filament.Engine.destroy(engine);
        };

        if (disposed) {
          teardown();
          return;
        }
        setStatus('ready');
        animationFrame = window.requestAnimationFrame(render);
      } catch (error) {
        console.error('[FilamentWebGL] initialization failed', error);
        if (!disposed) setStatus('error');
      }
    };

    void setup();
    return () => {
      disposed = true;
      teardown?.();
    };
  }, []);

  return (
    <div style={{ width, height, position: 'relative', backgroundColor }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      {status !== 'ready' && (
        <div
          role={status === 'error' ? 'alert' : 'status'}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color,
            fontSize: 11,
            letterSpacing: '0.08em',
            opacity: 0.55,
          }}
        >
          {status === 'error' ? 'Filament WebGL unavailable' : 'Loading Filament…'}
        </div>
      )}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 12,
          bottom: 10,
          color,
          fontSize: 10,
          letterSpacing: '0.08em',
          opacity: 0.45,
          pointerEvents: 'none',
          textTransform: 'uppercase',
        }}
      >
        Filament WebGL
      </div>
    </div>
  );
};

export default FilamentWebGLVisualizer;
