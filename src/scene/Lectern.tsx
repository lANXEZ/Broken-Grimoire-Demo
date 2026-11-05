import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { AdditiveBlending, type Mesh, type MeshBasicMaterial, type Vector3 } from 'three';
import type { EventStep, Pos } from '../engine';
import { PLACEHOLDER_COLORS } from '../config/art';
import { TILE_TOP, tileToWorld, type RoomSize } from './iso';
import { Obstacle } from './Obstacle';
import { tileHandlers, type TilePointer } from './Board';
import { LECTERN_MESSAGE } from '../config/runeMessages';
import { inRunes } from '../game/runeMap';

/**
 * PLACEHOLDER: the Whispering Lectern, in the middle of the event room. A stone stand with an open book glowing
 * purple. Until the event is over it chants: its line (config/runeMessages.ts LECTERN_MESSAGE, in this computer's
 * rune alphabet) rises off the book again and again and fades. When it speaks plain words, they float above it in a
 * speech bubble. It's an <Obstacle>, so it fades when
 * the wizard stands behind it.
 */
const glow = { transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false } as const;

export function Lectern({ pos, room, step, said, pointer, unitFeet, pointerOnBoard }: {
  pos: Pos;
  room: RoomSize;
  step: EventStep | null;
  said: string | null;
  pointer: TilePointer;
  unitFeet: Vector3[];
  pointerOnBoard: { current: boolean };
}) {
  const light = useRef<Mesh>(null);
  const whispering = step !== null && step !== 'done';
  // drei's <Html> comes up empty if it's created in the scene's very first render (React mounts it twice there in
  // development), so the voice is added one render later.
  const [voiceReady, setVoiceReady] = useState(false);
  useEffect(() => setVoiceReady(true), []);
  useFrame(({ clock }) => {
    if (light.current) {
      const t = clock.elapsedTime;
      (light.current.material as MeshBasicMaterial).opacity = (whispering ? 0.45 : 0.18) + 0.15 * Math.sin(t * 2.4);
    }
  });
  const at = tileToWorld(pos, room, TILE_TOP);
  const C = PLACEHOLDER_COLORS;
  return (
    <group>
      <Obstacle position={at} size={{ width: 0.7, depth: 0.6, height: 1.05 }} unitFeet={unitFeet} pointerOnBoard={pointerOnBoard} handlers={tileHandlers(pos, pointer)}>
        {/* Base, column and the slanted top. */}
        <mesh position={[0, 0.06, 0]} castShadow>
          <boxGeometry args={[0.62, 0.12, 0.52]} />
          <meshStandardMaterial color={C.lecternStone} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.14, 0.7, 10]} />
          <meshStandardMaterial color={C.lecternStone} roughness={0.85} />
        </mesh>
        <group position={[0, 0.86, 0]} rotation={[-0.45, Math.PI / 4, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.66, 0.06, 0.48]} />
            <meshStandardMaterial color={C.lecternWood} roughness={0.75} />
          </mesh>
          {/* The open book: two pages. */}
          {[-0.15, 0.15].map((x) => (
            <mesh key={x} position={[x, 0.05, 0]} rotation={[0, 0, x > 0 ? -0.12 : 0.12]}>
              <boxGeometry args={[0.28, 0.025, 0.38]} />
              <meshStandardMaterial color={C.lecternPage} emissive={C.lecternGlow} emissiveIntensity={whispering ? 0.35 : 0.1} roughness={0.9} />
            </mesh>
          ))}
        </group>
      </Obstacle>
      {/* The book's purple glow. */}
      <mesh ref={light} position={[at[0], TILE_TOP + 1.0, at[2]]} raycast={() => null}>
        <sphereGeometry args={[0.38, 16, 12]} />
        <meshBasicMaterial color={C.lecternGlow} {...glow} opacity={0.4} />
      </mesh>
      {voiceReady && (
        <Html position={[at[0], TILE_TOP + 1.25, at[2]]} center zIndexRange={[18, 8]} style={{ pointerEvents: 'none' }}>
          <div className="lectern-voice">
            {said && <div className="lectern-said">{said}</div>}
            {whispering && (
              <div className="lectern-whispers">
                {[0, 1].map((i) => (
                  <span key={i} style={{ animationDelay: `${i * 1.8}s` }}>
                    {inRunes(LECTERN_MESSAGE)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}
