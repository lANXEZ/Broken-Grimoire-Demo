import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { OrthographicCamera, Vector3 } from 'three';
import { BOARD_GEOMETRY, CAMERA } from '../config/camera';
import { LAYOUT, uiScale } from '../config/layout';
import type { RoomSize } from './iso';

const deg = (d: number) => (d * Math.PI) / 180;

/**
 * [CAMERA] Points the orthographic camera at the board from the angles in config/camera.ts, then zooms and shifts
 * it so the whole board fits in the free screen area between the HUD pieces ([UI-PLACEMENT] `LAYOUT.board`).
 * Re-runs when the window or the room size changes.
 */
export function CameraRig({ room }: { room: RoomSize }) {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const size = useThree((s) => s.size);

  useLayoutEffect(() => {
    const az = deg(CAMERA.azimuthDeg);
    const el = deg(CAMERA.elevationDeg);
    const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));

    // Look at the origin from the chosen angle, then read the camera's screen-right and screen-up axes.
    camera.position.copy(dir.clone().multiplyScalar(60));
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);

    // Everything that must stay on screen: the slab, plus head room for units, their intents and pillars.
    const hx = room.width / 2 + BOARD_GEOMETRY.slabMargin;
    const hz = room.height / 2 + BOARD_GEOMETRY.slabMargin;
    // Units' intent chips are HTML and may poke into the top margin, so only the 3D parts count here.
    const top = Math.max(BOARD_GEOMETRY.pillarHeight, BOARD_GEOMETRY.unitHeight + 0.2);
    let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity;
    for (const x of [-hx, hx]) for (const z of [-hz, hz]) for (const y of [-BOARD_GEOMETRY.slabDepth, top]) {
      const p = new Vector3(x, y, z);
      const r = p.dot(right);
      const u = p.dot(up);
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
    }

    // [UI-PLACEMENT] The free screen box, in real pixels.
    const k = uiScale(size.width, size.height);
    const boxTop = LAYOUT.board.top * k;
    const boxBottom = size.height - LAYOUT.board.bottom * k;
    const boxW = Math.max(100, size.width - 2 * LAYOUT.board.sideMargin * k);
    const boxH = Math.max(100, boxBottom - boxTop);

    // Orthographic zoom = pixels per world unit.
    const zoom = Math.min(boxW / (maxR - minR), boxH / (maxU - minU)) / CAMERA.fitPadding;

    // Shift the camera sideways so the board's centre lands in the middle of the free box.
    const centreR = (minR + maxR) / 2;
    const centreU = (minU + maxU) / 2;
    const dxPx = 0; // the box is horizontally centred
    const dyPx = size.height / 2 - (boxTop + boxBottom) / 2; // + = box centre is above the screen centre
    camera.position
      .copy(dir.multiplyScalar(60))
      .addScaledVector(right, centreR - dxPx / zoom)
      .addScaledVector(up, centreU - dyPx / zoom);
    camera.zoom = zoom;
    camera.near = 0.1;
    camera.far = 200;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }, [camera, size.width, size.height, room.width, room.height]);

  return null;
}
