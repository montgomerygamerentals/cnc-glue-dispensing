import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
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

/** Procedural sample "Dangle-like" workpiece for demos without an upload. */
export function createSampleDangleGeometry(): {
  geometry: THREE.BufferGeometry;
  dimensions: Vec3;
  arrayBuffer: ArrayBuffer;
} {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(40, 18, 8));
  body.position.set(0, 0, 4);
  group.add(body);

  const lip = new THREE.Mesh(new THREE.BoxGeometry(40, 6, 3));
  lip.position.set(0, -12, 1.5);
  group.add(lip);

  const underhang = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 4));
  underhang.position.set(0, -18, 2);
  group.add(underhang);

  // Merge into one BufferGeometry via exporter route
  const scene = new THREE.Scene();
  scene.add(group);
  // Bake transforms
  group.updateMatrixWorld(true);

  const geometries: THREE.BufferGeometry[] = [];
  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const g = (mesh.geometry as THREE.BufferGeometry).clone();
      g.applyMatrix4(mesh.matrixWorld);
      geometries.push(g);
    }
  });

  const merged = mergeGeometries(geometries);
  merged.computeBoundingBox();
  const box = merged.boundingBox!;
  const dimensions = {
    x: box.max.x - box.min.x,
    y: box.max.y - box.min.y,
    z: box.max.z - box.min.z,
  };
  const center = new THREE.Vector3();
  box.getCenter(center);
  merged.translate(-center.x, -center.y, -box.min.z);
  merged.computeBoundingBox();
  merged.computeVertexNormals();

  const exporter = new STLExporter();
  const mesh = new THREE.Mesh(merged);
  const stlString = exporter.parse(mesh, { binary: false });
  const arrayBuffer = new TextEncoder().encode(stlString).buffer;

  return { geometry: merged, dimensions, arrayBuffer };
}

function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];

  for (const g of geometries) {
    const pos = g.getAttribute("position");
    const nor = g.getAttribute("normal");
    const index = g.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i++) {
        const vi = index.getX(i);
        positions.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
        if (nor) normals.push(nor.getX(vi), nor.getY(vi), nor.getZ(vi));
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        if (nor) normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      }
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length) {
    merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  } else {
    merged.computeVertexNormals();
  }
  return merged;
}
