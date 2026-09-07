/** Materials of a mesh, always as an array (glTF meshes may hold several). */
export function materialsOf(mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}
