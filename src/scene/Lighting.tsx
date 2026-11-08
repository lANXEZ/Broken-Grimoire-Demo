import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { DirectionalLight, HemisphereLight } from 'three';

/**
 * The room's light: the sky light and the sun-like key light, dimmed down when the room is dark (a room the mage
 * walks into for the first time before its torches are lit, room 0 while its fire is out, the opening cutscene).
 * Torches, the campfire and the glowing spell marks by room 0's sealed door have their own lights and glows, so they
 * still show in the dark.
 *
 * Unit pictures don't take light (they're flat cut-outs), so units read `sceneLight.level` to dim themselves.
 */
export const sceneLight = { level: 1 };

const BRIGHT = { sky: 0.9, sun: 1.6 };
const DARK = { sky: 0.07, sun: 0.04 };

/** `dark`: 0 = normal, 1 = pitch dark. Going dark is near instant; the light comes back over about a second. */
export function SceneLights({ dark }: { dark: number }) {
  const sky = useRef<HemisphereLight>(null);
  const sun = useRef<DirectionalLight>(null);
  const level = useRef(1 - dark);
  useFrame((_, dt) => {
    const goal = 1 - dark;
    level.current += (goal - level.current) * Math.min(1, dt * (goal < level.current ? 20 : 2.6));
    const l = level.current;
    sceneLight.level = l;
    if (sky.current) sky.current.intensity = DARK.sky + (BRIGHT.sky - DARK.sky) * l;
    if (sun.current) sun.current.intensity = DARK.sun + (BRIGHT.sun - DARK.sun) * l;
  });
  return (
    <>
      <hemisphereLight ref={sky} args={['#fff1d6', '#2a1f18', BRIGHT.sky]} />
      <directionalLight
        ref={sun}
        position={[-6, 12, 4]}
        intensity={BRIGHT.sun}
        color="#ffe6c4"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
    </>
  );
}
