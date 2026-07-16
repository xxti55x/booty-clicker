import * as THREE from 'three';

/** Shorthand for the physical material used throughout the rig and props. */
export const mk = (o: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial =>
  new THREE.MeshPhysicalMaterial(o);

/** Flag an object as a shadow caster and return it (chainable, like the prototype's `sh`). */
export function sh<T extends THREE.Object3D>(m: T): T {
  m.castShadow = true;
  return m;
}
