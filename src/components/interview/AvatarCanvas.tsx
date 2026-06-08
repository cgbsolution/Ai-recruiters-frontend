"use client";

import { useEffect, useRef, useCallback, Suspense, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

interface Props {
  isSpeaking: boolean;
  isThinking: boolean;
}

// ── Viseme sequence for natural speech animation ─────────────────────────────
const VISEME_NAMES = [
  "viseme_PP", "viseme_FF", "viseme_TH", "viseme_DD",
  "viseme_kk", "viseme_CH", "viseme_SS", "viseme_nn",
  "viseme_RR", "viseme_aa", "viseme_E", "viseme_I",
  "viseme_O", "viseme_U",
] as const;

// ── RPM Avatar Model ─────────────────────────────────────────────────────────
function AvatarModel({ isSpeaking, isThinking, onLoaded }: Props & { onLoaded?: () => void }) {
  const { scene } = useGLTF("/models/avatar.glb");
  const meshesRef = useRef<THREE.SkinnedMesh[]>([]);
  const loadedRef = useRef(false);
  const clockRef = useRef(0);
  const blinkTimerRef = useRef(0);
  const nextBlinkRef = useRef(2 + Math.random() * 3);
  const isBlinkingRef = useRef(false);
  const blinkProgressRef = useRef(0);
  const headBoneRef = useRef<THREE.Bone | null>(null);
  const neckBoneRef = useRef<THREE.Bone | null>(null);
  const initialHeadRotRef = useRef<THREE.Euler | null>(null);
  const initialNeckRotRef = useRef<THREE.Euler | null>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Viseme animation state
  const visemeRef = useRef({
    currentIndex: 0,
    progress: 0,
    changeInterval: 0.08,
    timeSinceChange: 0,
  });

  // Collect skinned meshes and bones from the ACTUAL rendered scene
  useEffect(() => {
    // Reset refs
    headBoneRef.current = null;
    neckBoneRef.current = null;
    const meshes: THREE.SkinnedMesh[] = [];
    scene.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        const mesh = child as THREE.SkinnedMesh;
        if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
          meshes.push(mesh);
        }
      }
      if ((child as THREE.Bone).isBone) {
        const bone = child as THREE.Bone;
        const name = bone.name.toLowerCase();
        if (name.includes("head") && !headBoneRef.current) {
          headBoneRef.current = bone;
          initialHeadRotRef.current = bone.rotation.clone();
        }
        if (name.includes("neck") && !neckBoneRef.current) {
          neckBoneRef.current = bone;
          initialNeckRotRef.current = bone.rotation.clone();
        }
      }
    });
    meshesRef.current = meshes;
    // Signal that the model is loaded and ready to render
    if (!loadedRef.current && meshes.length > 0) {
      loadedRef.current = true;
      onLoaded?.();
    }
  }, [scene, onLoaded]);

  // Helper: set a morph target by name across all meshes
  const setMorph = useCallback((name: string, value: number) => {
    meshesRef.current.forEach((mesh) => {
      const idx = mesh.morphTargetDictionary?.[name];
      if (idx !== undefined && mesh.morphTargetInfluences) {
        mesh.morphTargetInfluences[idx] = value;
      }
    });
  }, []);

  useFrame((_, delta) => {
    clockRef.current += delta;
    const t = clockRef.current;

    // ── Eye Blinking ───────────────────────────────────────────────────────
    blinkTimerRef.current += delta;
    if (!isBlinkingRef.current && blinkTimerRef.current >= nextBlinkRef.current) {
      isBlinkingRef.current = true;
      blinkProgressRef.current = 0;
      blinkTimerRef.current = 0;
      nextBlinkRef.current = 2 + Math.random() * 4;
    }

    if (isBlinkingRef.current) {
      blinkProgressRef.current += delta * 8;
      if (blinkProgressRef.current >= 1) {
        isBlinkingRef.current = false;
        blinkProgressRef.current = 0;
        setMorph("eyeBlinkLeft", 0);
        setMorph("eyeBlinkRight", 0);
      } else {
        const blinkVal = blinkProgressRef.current < 0.4
          ? blinkProgressRef.current / 0.4
          : 1 - (blinkProgressRef.current - 0.4) / 0.6;
        setMorph("eyeBlinkLeft", blinkVal);
        setMorph("eyeBlinkRight", blinkVal);
      }
    }

    // ── Lip-sync / Visemes (when speaking) ─────────────────────────────────
    if (isSpeaking) {
      const vs = visemeRef.current;
      vs.timeSinceChange += delta;

      if (vs.timeSinceChange >= vs.changeInterval) {
        vs.timeSinceChange = 0;
        const vowelBias = Math.random();
        if (vowelBias > 0.4) {
          vs.currentIndex = 9 + Math.floor(Math.random() * 5);
        } else {
          vs.currentIndex = Math.floor(Math.random() * VISEME_NAMES.length);
        }
        vs.changeInterval = 0.06 + Math.random() * 0.08;
      }

      const visemeProgress = vs.timeSinceChange / vs.changeInterval;
      const smoothProgress = Math.sin(visemeProgress * Math.PI);

      VISEME_NAMES.forEach((name, i) => {
        const targetVal = i === vs.currentIndex ? 0.6 + Math.random() * 0.3 : 0;
        const currentVal = meshesRef.current[0]?.morphTargetInfluences?.[
          meshesRef.current[0]?.morphTargetDictionary?.[name] ?? -1
        ] ?? 0;
        setMorph(name, THREE.MathUtils.lerp(currentVal, targetVal * smoothProgress, 0.3));
      });

      const jawOpen = 0.15 + Math.sin(t * 8) * 0.1 + Math.sin(t * 12.7) * 0.05 + Math.random() * 0.05;
      setMorph("jawOpen", jawOpen);
      setMorph("mouthSmileLeft", 0.05 + Math.sin(t * 2) * 0.03);
      setMorph("mouthSmileRight", 0.05 + Math.sin(t * 2.3) * 0.03);
    } else {
      VISEME_NAMES.forEach((name) => {
        const mesh = meshesRef.current[0];
        if (!mesh) return;
        const idx = mesh.morphTargetDictionary?.[name];
        if (idx !== undefined && mesh.morphTargetInfluences) {
          mesh.morphTargetInfluences[idx] *= 0.85;
        }
      });
      setMorph("jawOpen", THREE.MathUtils.lerp(
        meshesRef.current[0]?.morphTargetInfluences?.[
          meshesRef.current[0]?.morphTargetDictionary?.["jawOpen"] ?? -1
        ] ?? 0, 0, 0.15
      ));
      setMorph("mouthSmileLeft", 0.02);
      setMorph("mouthSmileRight", 0.02);
    }

    // ── Subtle Brow Movement ───────────────────────────────────────────────
    if (isThinking) {
      setMorph("browInnerUp", 0.15 + Math.sin(t * 1.5) * 0.08);
      setMorph("browOuterUpLeft", 0.05 + Math.sin(t * 1.2) * 0.04);
      setMorph("browOuterUpRight", 0.05 + Math.sin(t * 1.4) * 0.04);
    } else if (isSpeaking) {
      setMorph("browInnerUp", 0.05 + Math.sin(t * 2) * 0.05);
      setMorph("browOuterUpLeft", 0.03 + Math.sin(t * 1.8) * 0.03);
      setMorph("browOuterUpRight", 0.03 + Math.sin(t * 2.1) * 0.03);
    } else {
      setMorph("browInnerUp", 0.02);
      setMorph("browOuterUpLeft", 0);
      setMorph("browOuterUpRight", 0);
    }

    // ── Eye Look (subtle micro-saccades for direct gaze) ─────────────────
    const lookX = Math.sin(t * 0.3) * 0.015 + Math.sin(t * 0.7) * 0.008;
    const lookY = Math.sin(t * 0.4) * 0.01 + Math.cos(t * 0.6) * 0.005;
    setMorph("eyeLookOutLeft", Math.max(0, lookX));
    setMorph("eyeLookInLeft", Math.max(0, -lookX));
    setMorph("eyeLookOutRight", Math.max(0, -lookX));
    setMorph("eyeLookInRight", Math.max(0, lookX));
    setMorph("eyeLookUpLeft", Math.max(0, lookY));
    setMorph("eyeLookUpRight", Math.max(0, lookY));
    setMorph("eyeLookDownLeft", Math.max(0, -lookY));
    setMorph("eyeLookDownRight", Math.max(0, -lookY));

    // ── Head & Neck Idle Animation ─────────────────────────────────────────
    if (headBoneRef.current && initialHeadRotRef.current) {
      const head = headBoneRef.current;
      const base = initialHeadRotRef.current;

      if (isSpeaking) {
        head.rotation.x = base.x + Math.sin(t * 1.5) * 0.02 + Math.sin(t * 3.1) * 0.01;
        head.rotation.y = base.y + Math.sin(t * 0.8) * 0.025 + Math.sin(t * 2.2) * 0.01;
        head.rotation.z = base.z + Math.sin(t * 1.1) * 0.008;
      } else {
        // Always face the camera directly (no chin-down/head-tilt offset),
        // even while "thinking" — micro-motion only, so she keeps eye contact.
        head.rotation.x = base.x + Math.sin(t * 0.4) * 0.008 + Math.sin(t * 0.9) * 0.004;
        head.rotation.y = base.y + Math.sin(t * 0.3) * 0.01 + Math.sin(t * 0.7) * 0.005;
        head.rotation.z = base.z + Math.sin(t * 0.35) * 0.005;
      }
    }

    if (neckBoneRef.current && initialNeckRotRef.current) {
      const neck = neckBoneRef.current;
      const base = initialNeckRotRef.current;
      neck.rotation.x = base.x + Math.sin(t * 0.25) * 0.005;
      neck.rotation.y = base.y + Math.sin(t * 0.2) * 0.006;
    }

  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

// ── Camera Setup — auto-frames head+shoulders ────────────────────────────────
function CameraRig() {
  const { camera } = useThree();
  const { scene } = useGLTF("/models/avatar.glb");
  const hasFramed = useRef(false);

  useEffect(() => {
    if (hasFramed.current) return;

    // Find the Head bone to position camera at eye level
    let headWorldPos: THREE.Vector3 | null = null;
    scene.traverse((child) => {
      if ((child as THREE.Bone).isBone) {
        const name = child.name.toLowerCase();
        if (name.includes("head") && !headWorldPos) {
          child.updateWorldMatrix(true, false);
          headWorldPos = new THREE.Vector3();
          child.getWorldPosition(headWorldPos);
        }
      }
    });

    if (headWorldPos) {
      const hp = headWorldPos as THREE.Vector3;
      // Head in middle of frame with gap above — chest can be cut off at bottom
      camera.position.set(0, hp.y, 1.1);
      camera.lookAt(0, hp.y - 0.05, 0);
    } else {
      camera.position.set(0, 1.55, 1.1);
      camera.lookAt(0, 1.50, 0);
    }

    hasFramed.current = true;
  }, [camera, scene]);

  return null;
}

// ── Main Export ──────────────────────────────────────────────────────────────
function LoadingFallback() {
  return (
    <mesh>
      <sphereGeometry args={[0.01, 1, 1]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}

export default function AvatarCanvas({ isSpeaking, isThinking }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  // If the GLB hasn't loaded within 20 seconds, set loadTimedOut so we throw
  // after all hooks (React rules require hooks before any conditional throw).
  // On slow connections the GLB (30+ MB) can take minutes — blocking the entire
  // avatar tile. The throw triggers the parent ErrorBoundary → VoiceVisualizer.
  useEffect(() => {
    if (loaded) return;
    const timer = setTimeout(() => setLoadTimedOut(true), 20_000);
    return () => clearTimeout(timer);
  }, [loaded]);

  // When this canvas unmounts, evict the parsed GLTF from drei's cache so Three.js
  // can release geometry, skeleton, and texture data from the JS heap.
  // Without this the ~30-50 MB deserialized model stays alive until page unload.
  // Must be declared before any conditional throw to satisfy Rules of Hooks.
  useEffect(() => {
    return () => {
      useGLTF.clear("/models/avatar.glb");
    };
  }, []);

  // Throw AFTER all hooks — React's ErrorBoundary catches this and renders the
  // VoiceVisualizer fallback configured in InterviewRoom.
  if (loadTimedOut && !loaded) {
    throw new Error("Avatar model did not load within 20 s — switching to VoiceVisualizer");
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#eef0f8]">
      {/* Loading spinner — shown until 3D model is ready */}
      {!loaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#eef0f8]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-xs text-gray-400">Loading avatar...</span>
          </div>
        </div>
      )}
      <Canvas
        // Shadows OFF — no floor/surface to catch them, pure GPU cost for zero gain.
        camera={{ fov: 30, near: 0.01, far: 10 }}
        // dpr=1 everywhere: the avatar tile is small (~300px²), rendering at 2×
        // or 3× DPR gives no visible improvement but doubles/triples GPU memory.
        dpr={1}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
          // "default" lets the OS/driver pick the GPU. "high-performance" forces
          // the discrete GPU even on integrated-only laptops where it means nothing,
          // and on dual-GPU laptops it can exhaust VRAM faster.
          powerPreference: "default",
        }}
        style={{ background: "linear-gradient(180deg, #f0f2fa 0%, #e4e7f3 100%)" }}
      >
        <CameraRig />

        {/* Key light — bright warm, from upper-right */}
        <directionalLight position={[2, 3, 2]} intensity={3.0} color="#fff8f0" />

        {/* Fill light — soft neutral, from left */}
        <directionalLight position={[-2, 1.5, 1.5]} intensity={1.4} color="#e8e4f0" />

        {/* Rim/back light */}
        <directionalLight position={[0, 2, -2]} intensity={0.9} color="#f0ece8" />

        {/* Ambient base — slightly brighter to compensate for no Environment map */}
        <ambientLight intensity={1.1} color="#f5f3f0" />

        {/* Hemisphere — sky/ground tones */}
        <hemisphereLight args={["#e8eaf8", "#d0c8c0", 0.8]} />

        {/* Environment HDR removed — it downloads a ~20 MB HDR texture on every
            mount and keeps it in GPU memory for the whole interview. The extra
            directional/ambient lights above reproduce the same look on low-end devices. */}

        {/* Avatar — placed at origin, camera finds the head */}
        <Suspense fallback={<LoadingFallback />}>
          <AvatarModel isSpeaking={isSpeaking} isThinking={isThinking} onLoaded={() => setLoaded(true)} />
        </Suspense>
      </Canvas>

      {/* Soft vignette for light mode */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 40%, transparent 60%, rgba(200,200,220,0.3) 100%)",
        }}
      />
    </div>
  );
}

// Preload intentionally removed — eagerly loading the ~30-50 MB GLB on every
// page visit wastes memory on devices where the avatar may never even render
// (low-RAM machines that get swapped to VoiceVisualizer under pressure).
// The Suspense fallback spinner handles the brief load delay on first mount.
