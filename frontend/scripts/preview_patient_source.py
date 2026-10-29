import math
import os
import sys
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
source = os.path.abspath(argv[0])
output = os.path.abspath(argv[1])
hide_terms = tuple(arg.lower() for arg in argv[2:])
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=source)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for obj in meshes:
    if any(term in obj.name.lower() for term in hide_terms):
        obj.hide_render = True
print("ASSET", os.path.basename(source))
for o in meshes:
    print("MESH", o.name, "groups", len(o.vertex_groups), "mats", [m.name for m in o.data.materials])
bpy.context.view_layer.update()
box = None
for o in meshes:
    ob = o.bound_box
    for corner in ob:
        p = o.matrix_world @ Vector(corner)
        if box is None:
            box = [p.copy(), p.copy()]
        else:
            box[0].x = min(box[0].x, p.x); box[0].y = min(box[0].y, p.y); box[0].z = min(box[0].z, p.z)
            box[1].x = max(box[1].x, p.x); box[1].y = max(box[1].y, p.y); box[1].z = max(box[1].z, p.z)
center = (box[0] + box[1]) * 0.5
print("BOUNDS", tuple(box[0]), tuple(box[1]))
world = bpy.context.scene.world
world.color = (0.82, 0.84, 0.87)
def light(name, location, power, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power; data.shape = "DISK"; data.size = size
    obj = bpy.data.objects.new(name, data); bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (center - obj.location).to_track_quat("-Z", "Y").to_euler()
light("Key", center + Vector((-2.5, -4.0, 2.8)), 500, 3.0)
light("Fill", center + Vector((3.0, -2.0, 1.5)), 330, 3.5)
light("Rim", center + Vector((1.0, 2.0, 2.6)), 500, 2.4)
data = bpy.data.cameras.new("PreviewCamera")
camera = bpy.data.objects.new("PreviewCamera", data); bpy.context.collection.objects.link(camera)
camera.location = center + Vector((2.7, -5.8, 1.2))
camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
data.type = "ORTHO"; data.ortho_scale = max(box[1].z - box[0].z, box[1].x - box[0].x) * 1.22
scene = bpy.context.scene
scene.camera = camera; scene.render.engine = "CYCLES"; scene.cycles.samples = 24; scene.cycles.use_denoising = False
scene.render.resolution_x = 850; scene.render.resolution_y = 1200; scene.render.resolution_percentage = 70
scene.render.image_settings.file_format = "PNG"; scene.render.filepath = output
scene.view_settings.view_transform = "AgX"
bpy.ops.render.render(write_still=True)
