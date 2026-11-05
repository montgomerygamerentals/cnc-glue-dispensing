import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type { Vec3 } from "./types";

export function loadStlGeometry(data: ArrayBuffer): {
  geometry: THREE.BufferGeometry;
  dimensions: Vec3;
} {
  const loader = new STLLoader();
  const geometry = loader.parse(data);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const dimensions = {
    x: box.max.x - box.min.x,
    y: box.max.y - box.min.y,
    z: box.max.z - box.min.z,
  };
  // Center geometry at local origin for fixture placement
  const center = new THREE.Vector3();
  box.getCenter(center);
  geometry.translate(-center.x, -center.y, -box.min.z);
  geometry.computeBoundingBox();
  return { geometry, dimensions };
}
