"""Renders the mirror cube into public/favicon.png. Run via scripts/render-favicon.sh.

A three-quarter view of the full-detail original, silver on transparent, lit by a key
and a cooler rim so the chrome still reads as a cube at 16 px. Orthographic, so the
faces stay square in the tab.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, "tmp", "originals", "rubiksCube.orig.glb")
dst = os.path.join(root, "public", "favicon.png")
SIZE = 256
# The scene's own dulling of the mirror (see src/rubiksCube.js).
ROUGHNESS_MIN = 0.45

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
if not meshes:
    raise SystemExit("[favicon] import produced no meshes")

for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    for node in mat.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            rough = node.inputs["Roughness"]
            rough.default_value = max(rough.default_value, ROUGHNESS_MIN)

# World-space bounds of everything, for the framing.
corners = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
centre = (lo + hi) / 2
extent = max(hi - lo)

scene = bpy.context.scene

# Camera: a three-quarter view from above-front, orthographic and fitted to the bounds.
cam_data = bpy.data.cameras.new("FaviconCam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = extent * 1.75
# The source is 300 across; the default 100 clip would cut the far corners off.
cam_data.clip_end = extent * 20
cam = bpy.data.objects.new("FaviconCam", cam_data)
scene.collection.objects.link(cam)
direction = Vector((1, -0.75, 0.55)).normalized()
cam.location = centre + direction * extent * 4
cam.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam

# Lights: a broad key above-front, a cooler rim from behind for the far edges.
def add_light(name, offset, energy, colour, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = colour
    data.size = size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = centre + Vector(offset) * extent
    obj.rotation_euler = (centre - obj.location).to_track_quat("-Z", "Y").to_euler()

add_light("Key", (1.2, -1.6, 2.2), 4000 * extent, (1.0, 0.97, 0.92), extent * 2)
add_light("Rim", (-1.8, 1.4, 1.2), 2500 * extent, (0.8, 0.88, 1.0), extent * 2)

world = bpy.data.worlds.new("FaviconWorld")
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
# A light grey surround: the chrome is what it reflects, and a dark world made it a
# black cube. Not seen itself — the film is transparent.
bg.inputs["Color"].default_value = (0.6, 0.63, 0.68, 1)
bg.inputs["Strength"].default_value = 1.0
scene.world = world

scene.render.engine = "CYCLES"
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.resolution_x = SIZE
scene.render.resolution_y = SIZE
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = dst
bpy.ops.render.render(write_still=True)
print(f"[favicon] wrote {dst}")
