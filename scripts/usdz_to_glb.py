"""Blender-side USD -> GLB conversion. Run via scripts/convert-usdz.sh."""
import sys
import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)

try:
    bpy.ops.wm.usd_import(filepath=src)
except Exception as exc:  # noqa: BLE001 - report and fall back to the original .usdz
    print(f"[convert] usd_import failed on {src}: {exc}")
    fallback = argv[2] if len(argv) > 2 else None
    if not fallback:
        raise
    print(f"[convert] retrying with {fallback}")
    bpy.ops.wm.usd_import(filepath=fallback)

if not any(o.type == "MESH" for o in bpy.data.objects):
    raise SystemExit("[convert] import produced no meshes")

bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format="GLB",
    export_yup=True,
    export_image_format="AUTO",
    export_draco_mesh_compression_enable=False,
    export_apply=True,
)
print(f"[convert] wrote {dst}")
