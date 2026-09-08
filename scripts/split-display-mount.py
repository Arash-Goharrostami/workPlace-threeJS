"""Splits the Pro Display XDR's mount off its panel. Run via scripts/split-display-mount.sh.

Three jobs, all of which the runtime would otherwise have to guess at.

It gives the mount a node of its own, `xdr_mount`, parented alongside the panel rather
than under it. `src/proDisplay.js` pivots the portrait display's quarter turn on that
node's centre, which is the point the screen actually turns about; without it the turn
falls back to the display's own centre, which is close but not the same.

It also drops the stand's custom split normals. Its shell is one big fan triangulation
shipping with authored normals that fan out with it, which from behind reads as four
bright shards radiating from the cable opening. The geometry is sound — only the normals
are wrong — so they are left to be derived from the faces. That repair used to be done
at load, reaching for the shell by name, but the round trip through Blender merges the
stand's four material primitives into one mesh and that name stops existing.

The mount is found by connected island rather than by any cut: its faces touch none of
the screen's. Three things mark its islands out, each by a wide margin — they sit within
a unit of the mount's axis, they are at most nine units across where the screen's span
the whole 72 x 41 panel, and they are painted in the stand's own materials. That last
one separates the arm's plate from the round recess it seats into, which are side by
side and much the same size but painted apart.

It then takes the recess too, as `xdr_recess`. That one is welded into the back shell
rather than being an island, so it is cut rather than picked up — but the shell tells us
exactly where to cut. Measured out from the mount's axis, the panel's vertices thin to
almost none between 5.0 and 5.5 cm, and from 5.0 cm out the shell is flat: everything
that stands proud of it lies inside. So the cut is a cylinder of radius 5.2 cm about the
axis, taking whole faces only, and its rim lands in that flat ring.

That leaves no seam to see, for two reasons. The rim is a circle centred on the axis, so
the hole it leaves in the shell is unchanged by the panel's quarter turn; and the ring it
sits in is flat, so the two sides of the cut stay coplanar. The recess can then be left
square while the screen turns, which is what the stand's plate needs — it slots in one
way up whichever way the screen faces.
"""
import sys

import bmesh
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst = argv[0], argv[1]

# The object the panel and its mount arrive merged into, and what the two become.
PANEL = "xdr panel"
MOUNT = "xdr_mount"
RECESS = "xdr_recess"

# Radius of the cylinder the recess is cut out along, in metres, about the mount's axis.
# It sits in the gap the shell leaves between 5.0 and 5.5 cm — see the note above.
RECESS_RADIUS = 0.052

# The stand: the source of both the shading repair below and the materials that say
# which pieces of the mount belong to it.
STAND = "xdr stand"

# How far from the mount's axis an island's centre may sit, and how far across it may
# be, to belong to the mount. The gap either side of both is wide: the mount's islands
# are within 0.09 of the axis and 9 units across, the screen's are 72.
AXIS_RADIUS = 1.0
MOUNT_SPAN = 20.0

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

panel = bpy.data.objects.get(PANEL)
if panel is None:
    raise SystemExit(f"[split] no object named {PANEL!r} in {src}")


def islands(mesh):
    """Groups a mesh's vertices into connected components."""
    mesh.verts.ensure_lookup_table()
    seen = set()
    groups = []
    for vert in mesh.verts:
        if vert.index in seen:
            continue
        stack = [vert]
        seen.add(vert.index)
        group = []
        while stack:
            current = stack.pop()
            group.append(current)
            for edge in current.link_edges:
                other = edge.other_vert(current)
                if other.index not in seen:
                    seen.add(other.index)
                    stack.append(other)
        groups.append(group)
    return groups


stand = bpy.data.objects.get(STAND)
stand_materials = {m.name for m in stand.data.materials if m} if stand else set()
if not stand_materials:
    raise SystemExit(f"[split] {STAND!r} has no materials to match the mount against")

panel_materials = [m.name if m else None for m in panel.data.materials]

bm = bmesh.new()
bm.from_mesh(panel.data)

# The axis runs through the panel's own centre, across its width and height; the third
# axis is its thickness, which the mount is strung out along and so says nothing here.
low = Vector((min(v.co.x for v in bm.verts), min(v.co.y for v in bm.verts), 0))
high = Vector((max(v.co.x for v in bm.verts), max(v.co.y for v in bm.verts), 0))
axis = (low + high) / 2

chosen = set()
for group in islands(bm):
    xs = [v.co.x for v in group]
    ys = [v.co.y for v in group]
    zs = [v.co.z for v in group]
    span = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    centre = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, 0))

    if span > MOUNT_SPAN or (centre - axis).length > AXIS_RADIUS:
        continue

    painted = {
        panel_materials[face.material_index]
        for vert in group
        for face in vert.link_faces
        if face.material_index < len(panel_materials)
    }
    if painted & stand_materials:
        chosen.update(v.index for v in group)

bm.free()

if not chosen:
    raise SystemExit("[split] found no stand-side islands — the asset's layout has changed")

# Selected in the mesh itself rather than through bmesh, so the operator below sees it.
bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.objects.active = panel
panel.select_set(True)

bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_mode(type="VERT")
bpy.ops.mesh.select_all(action="DESELECT")
bpy.ops.object.mode_set(mode="OBJECT")
for index in chosen:
    panel.data.vertices[index].select = True

bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.separate(type="SELECTED")
bpy.ops.object.mode_set(mode="OBJECT")

mount = next(o for o in bpy.context.selected_objects if o is not panel)
mount.name = MOUNT
mount.data.name = MOUNT

# Alongside the panel, not under it: the panel's turn must not reach the mount. The
# world matrix is put back afterwards, because the panel's own node carries an offset
# and a hundredth scale that the mount would otherwise be re-read through and moved by.
world = mount.matrix_world.copy()
mount.parent = panel.parent.parent if panel.parent else None
mount.matrix_parent_inverse.identity()
mount.matrix_world = world

print(f"[split] {MOUNT}: {len(mount.data.vertices)} verts, parented to {mount.parent.name if mount.parent else 'the scene'}")
print(f"[split] {PANEL}: {len(panel.data.vertices)} verts left")

# ---- the recess -------------------------------------------------------------------
#
# Cut rather than picked up: it shares its vertices with the shell. Whole faces only, so
# nothing is left half on either side, and the rim lands in the flat ring the shell
# leaves outside 5 cm — see the note at the top of the file.

axis = sum((mount.matrix_world @ v.co for v in mount.data.vertices), Vector()) / len(mount.data.vertices)


def reach(local):
    """How far a panel vertex sits from the mount's axis, across the screen's face."""
    world = panel.matrix_world @ local
    return ((world.x - axis.x) ** 2 + (world.z - axis.z) ** 2) ** 0.5


inside = [v.index for v in panel.data.vertices if reach(v.co) < RECESS_RADIUS]
if not inside:
    raise SystemExit("[split] nothing within the recess radius — the asset's layout has changed")

within = set(inside)
faces = [f.index for f in panel.data.polygons if all(i in within for i in f.vertices)]

bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.objects.active = panel
panel.select_set(True)

# Faces rather than vertices, and set while out of edit mode so the operator sees them.
bpy.context.tool_settings.mesh_select_mode = (False, False, True)
for face in panel.data.polygons:
    face.select = False
for index in faces:
    panel.data.polygons[index].select = True

bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.separate(type="SELECTED")
bpy.ops.object.mode_set(mode="OBJECT")

recess = next(o for o in bpy.context.selected_objects if o is not panel)
recess.name = RECESS
recess.data.name = RECESS

# Alongside the panel for the same reason the mount is: the panel's turn must not
# reach it, and its own node carries an offset the recess would be re-read through.
world = recess.matrix_world.copy()
recess.parent = panel.parent.parent if panel.parent else None
recess.matrix_parent_inverse.identity()
recess.matrix_world = world

print(f"[split] {RECESS}: {len(recess.data.vertices)} verts from {len(faces)} faces")
print(f"[split] {PANEL}: {len(panel.data.vertices)} verts left")

# The stand's shell is one big fan triangulation shipping with authored normals that
# fan out with it, which from behind reads as four bright shards radiating from the
# cable opening. The geometry is sound — only the normals are wrong — so they are
# dropped here and left to be derived from the faces.
#
# `src/proDisplay.js` used to do this at load, reaching for the shell by name. The
# round-trip through Blender merges the stand's four material primitives into one mesh
# and that name stops existing, so the repair belongs in the asset now.
bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.objects.active = stand
stand.select_set(True)
bpy.ops.mesh.customdata_custom_splitnormals_clear()
print(f"[split] {STAND}: custom normals cleared")

bpy.ops.object.select_all(action="DESELECT")
bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format="GLB",
    export_draco_mesh_compression_enable=True,
    export_apply=False,
)
print(f"[split] wrote {dst}")
