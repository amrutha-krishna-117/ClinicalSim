"""Adapt the CC0 Innerscene/MakeHuman source GLB into our reusable patient.

Run: blender --background --python scripts/build_cc0_patient.py
The source mesh and textures are CC0. This adapter removes surgical accessories,
adds a patterned knee-length gown and exports the app's standard patient.glb.
"""
import math
import os
import random
import sys

if "/usr/lib/python3/dist-packages" not in sys.path:
    sys.path.append("/usr/lib/python3/dist-packages")

import bpy
import bmesh

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ASSET_DIR = os.path.join(ROOT, "public", "assets", "patients")
SOURCE = os.path.join(os.path.dirname(__file__), "assets", "daniel-source.glb")
if "--" in sys.argv and len(sys.argv) > sys.argv.index("--") + 1:
    SOURCE = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
OUTPUT = os.path.join(ASSET_DIR, "patient.glb")
random.seed(7)


def make_gown_material():
    size, spacing = 256, 4
    image = bpy.data.images.new("Patient gown woven dot print", width=size, height=size, alpha=True)
    pixels = []
    for y in range(size):
        for x in range(size):
            dx = min(x % spacing, spacing - x % spacing)
            dy = min(y % spacing, spacing - y % spacing)
            dist = math.sqrt(dx * dx + dy * dy)
            grain = random.uniform(-0.018, 0.018)
            if dist < 0.85:
                color = (0.47, 0.58, 0.62)
            elif dist < 1.4:
                color = (0.72, 0.79, 0.81)
            else:
                color = (0.89 + grain, 0.91 + grain, 0.92 + grain)
            pixels.extend((color[0], color[1], color[2], 1.0))
    image.pixels.foreach_set(pixels)
    image.pack()
    # Avoid the word "gown" here: the runtime swaps meshes whose material name
    # looks like clothing. Keeping this neutral preserves the lower-leg slot.
    mat = bpy.data.materials.new("Pale blue woven cotton")
    mat.use_nodes = True
    mat.diffuse_color = (0.87, 0.9, 0.91, 1)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.91
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Closest"
    tex.extension = "REPEAT"
    uv = nodes.new("ShaderNodeTexCoord")
    links.new(uv.outputs["UV"], tex.inputs["Vector"])
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def add_gown_skirt(mat):
    # Coordinates fit the source's 1.65 m standing body, facing -Y.
    # A single gently flared gown shell runs from the collar line to the knees.
    profile = [
        (0.49, 0.242, 0.170), (0.51, 0.252, 0.180), (0.56, 0.255, 0.182),
        (0.72, 0.244, 0.176), (0.84, 0.226, 0.162), (0.98, 0.207, 0.148),
        (1.12, 0.202, 0.145), (1.24, 0.214, 0.151), (1.32, 0.174, 0.125),
        (1.36, 0.116, 0.086),
    ]
    if "daniel" in os.path.basename(SOURCE).lower():
        # Keep the shell deep enough to cover the casual jacket while narrow
        # enough to leave the source hands visible beside the gown.
        profile = [(z * 1.09, rx * 1.08, ry * 1.28) for z, rx, ry in profile]
    rows, cols = 36, 64
    verts, faces, uvs = [], [], []
    for row in range(rows + 1):
        t = row / rows * (len(profile) - 1)
        i = min(len(profile) - 2, int(t))
        f = t - i
        z, rx, ry = [profile[i][n] * (1 - f) + profile[i + 1][n] * f for n in range(3)]
        for col in range(cols + 1):
            a = math.tau * col / cols
            # Front faces -Y. A slight side-to-side sway avoids a rigid tube.
            sway = math.sin(t * 0.8 + a * 2) * 0.003
            verts.append((math.cos(a) * rx + sway, math.sin(a) * ry, z))
            uvs.append((col / cols * 0.55, row / rows * 0.42))
            if row < rows and col < cols:
                n = row * (cols + 1) + col
                faces.append((n, n + 1, n + cols + 2, n + cols + 1))
    mesh = bpy.data.meshes.new("Hospital gown skirt mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    uv = mesh.uv_layers.new(name="GownUV")
    for poly in mesh.polygons:
        poly.use_smooth = True
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[mesh.loops[li].vertex_index]
    obj = bpy.data.objects.new("Hospital_Gown_One_Piece", mesh)
    bpy.context.collection.objects.link(obj)
    solidify = obj.modifiers.new("Cotton thickness", "SOLIDIFY")
    solidify.thickness = 0.003
    bevel = obj.modifiers.new("Soft cloth hem", "BEVEL")
    bevel.width = 0.004
    bevel.segments = 2
    return obj


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=SOURCE)
    gown = make_gown_material()

    # Remove operating-room accessories and the shoes; expose the source's
    # phototextured skin beneath the scrubs.
    remove_patterns = ("mask", "ear loop", "fitted cloth cap", "id clip", "id card", "cube")
    for obj in list(bpy.context.scene.objects):
        if any(token in obj.name.lower() for token in remove_patterns):
            bpy.data.objects.remove(obj, do_unlink=True)

    male_source = "daniel" in os.path.basename(SOURCE).lower()
    clothes_name = "man_body.male_casualsuit05" if male_source else "male_casualsuit06"
    clothes = bpy.data.objects.get(clothes_name)
    if clothes is None:
        raise RuntimeError("Expected clothing mesh was not found: " + clothes_name)
    clothes.name = "Patient_UpperBody_Mesh"
    # Remove the trouser faces to reveal realistic legs from the skin mesh.
    legs = bpy.data.materials.new("Exposed lower legs | warm skin")
    leg_color = (0.68, 0.46, 0.38, 1) if male_source else (0.74, 0.52, 0.44, 1)
    legs.diffuse_color = leg_color
    legs.use_nodes = True
    leg_bsdf = legs.node_tree.nodes.get("Principled BSDF")
    leg_bsdf.inputs["Base Color"].default_value = leg_color
    leg_bsdf.inputs["Roughness"].default_value = 0.55
    if "Subsurface Weight" in leg_bsdf.inputs:
        leg_bsdf.inputs["Subsurface Weight"].default_value = 0.035
    if male_source:
        # This MakeHuman variant combines jacket, shirt and jeans into one
        # outfit mesh. Reuse its silhouette as gown fabric and tone the lower
        # legs to skin; the new gown shell conceals the jacket and trousers.
        clothes.data.materials.clear()
        clothes.data.materials.append(gown)
        clothes.data.materials.append(legs)
    else:
        if len(clothes.data.materials) > 0:
            clothes.data.materials[0] = gown
        clothes.data.materials.append(legs)
    bm = bmesh.new()
    bm.from_mesh(clothes.data)
    bm.faces.ensure_lookup_table()
    if male_source:
        for face in bm.faces:
            z = sum((clothes.matrix_world @ v.co).z for v in face.verts) / len(face.verts)
            face.material_index = 1 if z < 0.70 else 0
    else:
        # The source has separate top/bottom materials. Recolor lower-trouser
        # faces as skin and hide the thigh transition beneath the gown shell.
        for face in bm.faces:
            if face.material_index == 1:
                face.material_index = 2
    bm.to_mesh(clothes.data)
    bm.free()
    clothes.data.update()
    add_gown_skirt(gown)

    # Remove stray import camera, light and non-character placeholder meshes.
    for obj in list(bpy.context.scene.objects):
        if obj.type in {"CAMERA", "LIGHT"} or obj.name.lower() in {"cube", "alex - 3d person, surgeon in scrubs and cap"}:
            bpy.data.objects.remove(obj, do_unlink=True)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        obj.select_set(True)
    active = bpy.data.objects.get("man_body" if male_source else "Alex | anatomical body")
    bpy.context.view_layer.objects.active = active or clothes
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT,
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_image_format="AUTO",
        export_materials="EXPORT",
        export_skins=True,
    )
    print("Exported adapted patient:", OUTPUT)


if __name__ == "__main__":
    main()
