import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Vector3, type Camera, type Group, type Material } from 'three';
import { OBSTACLE_FADE } from '../config/camera';
import { UNIT_SPRITE } from '../config/art';
import type { ThreeEvent } from '@react-three/fiber';

/**
 * Anything that stands on a tile and can hide what's behind it: pillars today, and any future wall, statue or
 * crate. Wrap its meshes in <Obstacle> and it fades out (config/camera.ts `OBSTACLE_FADE`) when:
 *
 * 1. a unit stands behind it, i.e. the obstacle covers part of the unit on screen and is nearer the camera, or
 * 2. the mouse is on or near it, so players can peek behind obstacles (and discover anything hidden there).
 *
 * While faded it stops catching the mouse, so the tiles and units behind it can be hovered and clicked.
 * The test is done in screen space every frame, so it keeps working if the camera angle changes.
 */
export interface ObstacleProps {
  /** World position of the obstacle's base centre (on top of its tile). */
  position: [number, number, number];
  /** Bounding box of the obstacle: footprint width/depth and height, in tiles, measured from `position`. */
  size: { width: number; depth: number; height: number };
  /** World positions of every unit's feet (player included), used for the "unit behind it" test. */
  unitFeet: Vector3[];
  /** Whether the mouse is over the board at all (not over the HUD). */
  pointerOnBoard: { current: boolean };
  handlers?: {
    onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
    onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
    onClick?: (e: ThreeEvent<MouseEvent>) => void;
  };
  children: ReactNode;
}

interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const tmp = new Vector3();
const right = new Vector3();

/** Screen rectangle (normalised device coordinates) around some world points. */
function rectOf(points: Vector3[], camera: Camera): Rect {
  const r = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const p of points) {
    tmp.copy(p).project(camera);
    r.minX = Math.min(r.minX, tmp.x);
    r.maxX = Math.max(r.maxX, tmp.x);
    r.minY = Math.min(r.minY, tmp.y);
    r.maxY = Math.max(r.maxY, tmp.y);
  }
  return r;
}

/** How much of `a` is covered by `b` (0–1). */
function coveredFraction(a: Rect, b: Rect): number {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.max(1e-6, (a.maxX - a.minX) * (a.maxY - a.minY));
}

/** Distance from the camera along its view direction (bigger = farther away). */
function depthOf(p: Vector3, camera: Camera): number {
  return -tmp.copy(p).applyMatrix4(camera.matrixWorldInverse).z;
}

const noRaycast = () => null;

export function Obstacle({ position, size, unitFeet, pointerOnBoard, handlers, children }: ObstacleProps) {
  const group = useRef<Group>(null);
  const opacity = useRef(1);
  const faded = useRef(false);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const cam = state.camera;
    const [px, py, pz] = position;
    const hw = size.width / 2;
    const hd = size.depth / 2;

    // The obstacle's box on screen, and how far it is from the camera.
    const corners: Vector3[] = [];
    for (const dx of [-hw, hw]) for (const dz of [-hd, hd]) for (const dy of [0, size.height]) corners.push(new Vector3(px + dx, py + dy, pz + dz));
    const box = rectOf(corners, cam);
    const depth = depthOf(new Vector3(px, py + size.height / 2, pz), cam);

    let fade = false;

    // 1. The mouse is on or near it.
    if (pointerOnBoard.current) {
      const mx = (OBSTACLE_FADE.mouseRadiusPx * 2) / state.size.width;
      const my = (OBSTACLE_FADE.mouseRadiusPx * 2) / state.size.height;
      const { x, y } = state.pointer;
      fade = x > box.minX - mx && x < box.maxX + mx && y > box.minY - my && y < box.maxY + my;
    }

    // 2. A unit stands behind it and is partly hidden.
    if (!fade) {
      right.setFromMatrixColumn(cam.matrixWorld, 0);
      const half = UNIT_SPRITE.width / 2;
      const top = UNIT_SPRITE.footY + UNIT_SPRITE.height;
      for (const foot of unitFeet) {
        const unitRect = rectOf(
          [
            tmp.copy(foot).addScaledVector(right, -half).clone(),
            tmp.copy(foot).addScaledVector(right, half).clone(),
            tmp.copy(foot).addScaledVector(right, -half).setY(foot.y + top).clone(),
            tmp.copy(foot).addScaledVector(right, half).setY(foot.y + top).clone(),
          ],
          cam,
        );
        const unitDepth = depthOf(new Vector3(foot.x, foot.y + top / 2, foot.z), cam);
        if (unitDepth > depth + 0.05 && coveredFraction(unitRect, box) > OBSTACLE_FADE.minCoveredFraction) {
          fade = true;
          break;
        }
      }
    }

    // Ease the opacity toward its target.
    const target = fade ? OBSTACLE_FADE.opacity : 1;
    opacity.current += (target - opacity.current) * (1 - Math.exp(-dt * OBSTACLE_FADE.speed));
    if (Math.abs(target - opacity.current) < 0.003) opacity.current = target;
    const see = opacity.current < 0.999;

    g.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      // Faded obstacles let the mouse through to whatever is behind them.
      if (fade !== faded.current) mesh.raycast = fade ? noRaycast : Mesh.prototype.raycast;
      for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]) {
        if (m.transparent !== see) {
          m.transparent = see;
          m.depthWrite = !see;
          m.needsUpdate = true;
        }
        m.opacity = opacity.current;
      }
    });
    faded.current = fade;
  });

  return (
    <group ref={group} position={position} {...handlers}>
      {children}
    </group>
  );
}
