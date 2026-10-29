"""Generate the reusable synthetic patient GLB and a studio preview with Blender.

Run from the frontend directory with Blender 4.x:
  blender --background --python scripts/generate_synthetic_patient.py

The mesh is original procedural geometry. No third-party model is bundled.
"""
import math
import os
import random
import sys

# Ubuntu's Blender package uses its bundled Python but the distro NumPy module
# lives in the system dist-packages directory used by the glTF exporter.
if "/usr/lib/python3/dist-packages" not in sys.path:
    sys.path.append("/usr/lib/python3/dist-packages")

import bpy
from mathutils import Vector


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ASSET_DIR = os.path.join(ROOT, "public", "assets", "patients")
OUT_GLB = os.path.join(ASSET_DIR, "patient.glb")
OUT_PREVIEW = os.path.join(ASSET_DIR, "patient-preview.png")
random.seed(27)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(datablocks):
            if item.users == 0:
                datablocks.remove(item)


def material(name, color, roughness=0.65, subsurface=0.0, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = subsurface
    if "Subsurface Radius" in bsdf.inputs:
        bsdf.inputs["Subsurface Radius"].default_value = (0.8, 0.42, 0.25)
    return mat


def make_gown_texture():
    size, spacing = 256, 20
    image = bpy.data.images.new("Synthetic gown microprint", width=size, height=size, alpha=True)
    pixels = []
    for y in range(size):
        for x in range(size):
            # Woven cool-white cloth with a restrained, repeating blue-gray dot.
            lx, ly = x % spacing, y % spacing
            dx, dy = min(lx, spacing - lx), min(ly, spacing - ly)
            d = math.sqrt(dx * dx + dy * dy)
            grain = random.uniform(-0.012, 0.012)
            if d < 2.1:
                c = (0.34, 0.49, 0.56)
            elif d < 3.2:
                c = (0.61, 0.70, 0.73)
            else:
                c = (0.86 + grain, 0.89 + grain, 0.90 + grain)
            pixels.extend((c[0], c[1], c[2], 1.0))
    image.pixels.foreach_set(pixels)
    image.filepath_raw = os.path.join(ASSET_DIR, "_gown_texture.png")
    image.file_format = "PNG"
    image.save()
    image.pack()
    try:
        os.remove(image.filepath_raw)
    except OSError:
        pass
    return image


def gown_material(image):
    mat = material("Patient gown | woven cotton", (0.86, 0.89, 0.90), 0.9)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Closest"
    uv = nodes.new("ShaderNodeTexCoord")
    links.new(uv.outputs["UV"], tex.inputs["Vector"])
    links.new(tex.outputs["Color"], nodes.get("Principled BSDF").inputs["Base Color"])
    return mat


def add_hair_cap(mat, bone_name):
    verts, faces = [], []
    rows, cols = 24, 64
    for row in range(rows + 1):
        phi = (row / rows) * 2.10
        for col in range(cols + 1):
            theta = col / cols * math.tau
            verts.append((0.110 * math.sin(phi) * math.cos(theta),
                          0.008 + 0.094 * math.sin(phi) * math.sin(theta),
                          1.704 + 0.066 * math.cos(phi)))
            if row < rows and col < cols:
                n = row * (cols + 1) + col
                faces.append((n, n + 1, n + cols + 2, n + cols + 1))
    mesh = bpy.data.meshes.new("HairCapMesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new("Short_Hair_Cap", mesh)
    bpy.context.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj["weight_bone"] = bone_name
    return obj


def create_armature():
    data = bpy.data.armatures.new("SyntheticPatientRig")
    arm = bpy.data.objects.new("SyntheticPatientRig", data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bones = {}

    def bone(name, head, tail, parent=None, connect=False):
        b = data.edit_bones.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        if parent:
            b.parent = bones[parent]
            b.use_connect = connect
        bones[name] = b

    bone("Hips", (0, 0, 0.91), (0, 0, 1.02))
    bone("Spine", (0, 0, 1.02), (0, 0, 1.13), "Hips", True)
    bone("Spine1", (0, 0, 1.13), (0, 0, 1.29), "Spine", True)
    bone("Spine2", (0, 0, 1.29), (0, 0, 1.43), "Spine1", True)
    bone("Neck", (0, 0, 1.43), (0, 0, 1.53), "Spine2", True)
    bone("Head", (0, 0, 1.53), (0, 0, 1.70), "Neck", True)
    for side, label in [(-1, "Right"), (1, "Left")]:
        sh = (side * 0.18, 0, 1.39)
        elbow = (side * 0.32, 0, 1.17)
        wrist = (side * 0.43, -0.005, 0.98)
        palm = (side * 0.465, -0.015, 0.89)
        bone(label + "Shoulder", sh, (side * 0.205, 0, 1.36), "Spine2")
        bone(label + "Arm", (side * 0.205, 0, 1.36), elbow, label + "Shoulder")
        bone(label + "ForeArm", elbow, wrist, label + "Arm")
        bone(label + "Hand", wrist, palm, label + "ForeArm")
    for side, label in [(-1, "Right"), (1, "Left")]:
        hip = (side * 0.09, 0, 0.91)
        knee = (side * 0.095, 0, 0.51)
        ankle = (side * 0.095, 0, 0.10)
        toe = (side * 0.095, -0.18, 0.055)
        bone(label + "UpLeg", hip, knee, "Hips")
        bone(label + "Leg", knee, ankle, label + "UpLeg")
        bone(label + "Foot", ankle, toe, label + "Leg")
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.show_in_front = True
    arm.data.display_type = "OCTAHEDRAL"
    return arm


def add_sphere(name, location, scale, mat, bone_name, segments=40, rings=28):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj["weight_bone"] = bone_name
    return obj


def add_limb(name, start, end, r0, r1, depth_scale, mat, bone_name, sides=24):
    start, end = Vector(start), Vector(end)
    axis = (end - start).normalized()
    helper = Vector((0, 1, 0)) if abs(axis.dot(Vector((0, 1, 0)))) < 0.95 else Vector((1, 0, 0))
    u = axis.cross(helper).normalized()
    v = axis.cross(u).normalized()
    length = (end - start).length
    profile = [(0.0, r0 * 0.38), (0.08, r0 * 0.78), (0.22, r0), (0.72, r1 * 1.06), (0.93, r1 * 0.82), (1.0, r1 * 0.38)]
    verts, faces, uvs = [], [], []
    for t, radius in profile:
        center = start.lerp(end, t)
        for j in range(sides):
            a = 2 * math.pi * j / sides
            p = center + u * (math.cos(a) * radius) + v * (math.sin(a) * radius * depth_scale)
            verts.append(tuple(p))
            uvs.append((j / sides, t * 2.5))
    for ring in range(len(profile) - 1):
        for j in range(sides):
            a = ring * sides + j
            b = ring * sides + (j + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.extend([tuple(range(sides - 1, -1, -1)), tuple((len(profile) - 1) * sides + j for j in range(sides))])
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    uv = mesh.uv_layers.new(name="SleeveUV")
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[mesh.loops[li].vertex_index]
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for p in mesh.polygons:
        p.use_smooth = True
    obj["weight_bone"] = bone_name
    return obj


def add_weight(obj, bone_name, weight=1.0):
    group = obj.vertex_groups.get(bone_name) or obj.vertex_groups.new(name=bone_name)
    if obj.data.vertices:
        group.add(list(range(len(obj.data.vertices))), weight, "REPLACE")


def make_skinned_mesh(objects, armature, name):
    for obj in objects:
        bone_name = obj.get("weight_bone")
        if bone_name:
            add_weight(obj, bone_name)
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        obj.select_set(False)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    mesh = bpy.context.object
    mesh.name = name
    modifier = mesh.modifiers.new("Patient skeleton", "ARMATURE")
    modifier.object = armature
    mesh.parent = armature
    mesh.matrix_parent_inverse = armature.matrix_world.inverted()
    return mesh


def make_gown_body(mat, armature):
    # Closed, gently flared patient gown: shoulders to just above the knees.
    profile = [
        (0.70, 0.185, 0.112), (0.72, 0.215, 0.130), (0.78, 0.220, 0.135),
        (0.96, 0.205, 0.128), (1.12, 0.192, 0.126), (1.27, 0.198, 0.130),
        (1.37, 0.225, 0.135), (1.45, 0.190, 0.116), (1.50, 0.115, 0.085),
    ]
    rows, cols = 40, 64
    verts, faces, uvs = [], [], []
    for row in range(rows + 1):
        t = row / rows * (len(profile) - 1)
        i = min(len(profile) - 2, int(t))
        f = t - i
        z = profile[i][0] * (1 - f) + profile[i + 1][0] * f
        rx = profile[i][1] * (1 - f) + profile[i + 1][1] * f
        ry = profile[i][2] * (1 - f) + profile[i + 1][2] * f
        for col in range(cols + 1):
            a = col / cols * math.tau
            # Front points toward -Y, in the same orientation as the reference image.
            verts.append((math.cos(a) * rx, math.sin(a) * ry, z))
            uvs.append((col / cols * 5.5, row / rows * 4.0))
            if row < rows and col < cols:
                n = row * (cols + 1) + col
                faces.append((n, n + 1, n + cols + 2, n + cols + 1))
    mesh = bpy.data.meshes.new("GownBodyMesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    uv = mesh.uv_layers.new(name="GownUV")
    for poly in mesh.polygons:
        poly.use_smooth = True
        for li in poly.loop_indices:
            vi = mesh.loops[li].vertex_index
            uv.data[li].uv = uvs[vi]
    obj = bpy.data.objects.new("Hospital_Gown_Body", mesh)
    bpy.context.collection.objects.link(obj)
    # Blend torso weights from pelvis to ribcage to avoid a rigid waist seam.
    groups = {n: obj.vertex_groups.new(name=n) for n in ("Hips", "Spine", "Spine1", "Spine2")}
    for v in mesh.vertices:
        z = v.co.z
        if z < 0.98:
            w = (z - 0.70) / 0.28
            groups["Hips"].add([v.index], 1 - max(0, min(1, w)), "REPLACE")
            groups["Spine"].add([v.index], max(0, min(1, w)), "REPLACE")
        elif z < 1.23:
            groups["Spine"].add([v.index], 0.35, "REPLACE")
            groups["Spine1"].add([v.index], 0.65, "REPLACE")
        else:
            groups["Spine1"].add([v.index], 0.42, "REPLACE")
            groups["Spine2"].add([v.index], 0.58, "REPLACE")
    mod = obj.modifiers.new("Patient skeleton", "ARMATURE")
    mod.object = armature
    obj.parent = armature
    obj.matrix_parent_inverse = armature.matrix_world.inverted()
    return obj


def add_bone_parent(obj, armature, bone_name):
    world = obj.matrix_world.copy()
    obj.parent = armature
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    obj.matrix_world = world


def build_patient():
    clear_scene()
    os.makedirs(ASSET_DIR, exist_ok=True)
    skin = material("Skin | warm natural", (0.52, 0.31, 0.24), 0.48, 0.08)
    skin_shadow = material("Skin | crease", (0.31, 0.15, 0.12), 0.62, 0.02)
    lips = material("Lips", (0.43, 0.20, 0.19), 0.55, 0.02)
    hair = material("Hair | dark brown", (0.035, 0.022, 0.018), 0.34)
    white = material("Eye whites", (0.82, 0.78, 0.72), 0.3)
    iris = material("Iris | brown", (0.11, 0.052, 0.025), 0.28)
    pupil = material("Pupil", (0.008, 0.006, 0.005), 0.22)
    nails = material("Nails", (0.70, 0.52, 0.45), 0.4)
    gown_print = gown_material(make_gown_texture())
    gown_trim = material("Gown hem and collar", (0.44, 0.57, 0.62), 0.88)

    armature = create_armature()
    skin_parts = []

    # Neck and head: broad cranium, tapered jaw, cheek planes and facial landmarks.
    skin_parts.append(add_limb("NeckSkin", (0, 0, 1.42), (0, 0, 1.56), 0.067, 0.061, 0.83, skin, "Neck"))
    skull = add_sphere("FaceAndSkull", (0, -0.004, 1.625), (0.108, 0.092, 0.137), skin, "Head", 64, 48)
    # Taper the lower face and give the jaw a subtle human profile.
    for v in skull.data.vertices:
        z = v.co.z
        if z < -0.035:
            v.co.x *= 0.73 + (z + 0.137) * 2.0
        v.co.y += max(0, -z) * 0.12
    skull.data.update()
    skin_parts.append(skull)
    # Jaw/chin and cheek transitions soften the head silhouette.
    skin_parts.append(add_sphere("Jaw", (0, -0.020, 1.548), (0.074, 0.075, 0.052), skin, "Head", 40, 28))
    for side in (-1, 1):
        skin_parts.append(add_sphere("Ear", (side * 0.107, -0.002, 1.617), (0.022, 0.029, 0.041), skin, "Head", 32, 22))
        skin_parts.append(add_sphere("EarConcha", (side * 0.119, -0.025, 1.617), (0.009, 0.008, 0.018), skin_shadow, "Head", 24, 16))
        skin_parts.append(add_sphere("Cheek", (side * 0.045, -0.066, 1.589), (0.035, 0.023, 0.026), skin, "Head", 32, 20))
        # Eyebrow ridge and brow, set just above inset eyes.
        skin_parts.append(add_sphere("Brow", (side * 0.040, -0.083, 1.655), (0.032, 0.014, 0.009), skin, "Head", 32, 18))
        skin_parts.append(add_sphere("EyebrowHair", (side * 0.040, -0.096, 1.662), (0.027, 0.005, 0.004), hair, "Head", 32, 16))
        # Eye layering follows the forward (-Y) face direction.
        skin_parts.append(add_sphere("Sclera", (side * 0.039, -0.091, 1.637), (0.015, 0.010, 0.0105), white, "Head", 32, 20))
        skin_parts.append(add_sphere("Iris", (side * 0.039, -0.100, 1.637), (0.0065, 0.0035, 0.007), iris, "Head", 24, 16))
        skin_parts.append(add_sphere("Pupil", (side * 0.039, -0.103, 1.637), (0.0032, 0.0022, 0.004), pupil, "Head", 20, 12))
        skin_parts.append(add_sphere("EyeCatchlight", (side * 0.036, -0.109, 1.641), (0.002, 0.0014, 0.002), white, "Head", 12, 8))
        # Upper and lower lids make the eyes less like exposed spheres.
        skin_parts.append(add_limb("UpperEyelid", (side * 0.016, -0.094, 1.646), (side * 0.062, -0.094, 1.646), 0.003, 0.003, 1.0, skin, "Head", 16))
        skin_parts.append(add_limb("LowerEyelid", (side * 0.016, -0.094, 1.628), (side * 0.062, -0.094, 1.628), 0.0025, 0.0025, 1.0, skin, "Head", 16))
    # Nose bridge, tip, alae and nostril shadows.
    skin_parts.append(add_limb("NoseBridge", (0, -0.075, 1.647), (0, -0.112, 1.598), 0.014, 0.019, 0.72, skin, "Head", 24))
    skin_parts.append(add_sphere("NoseTip", (0, -0.112, 1.595), (0.020, 0.018, 0.014), skin, "Head", 32, 20))
    for side in (-1, 1):
        skin_parts.append(add_sphere("NasalAla", (side * 0.014, -0.101, 1.589), (0.011, 0.014, 0.008), skin, "Head", 24, 16))
        skin_parts.append(add_sphere("Nostril", (side * 0.010, -0.112, 1.584), (0.004, 0.002, 0.0025), skin_shadow, "Head", 16, 10))
    # Natural philtrum, lips, mouth slit and chin crease.
    skin_parts.append(add_limb("Philtrum", (0, -0.092, 1.586), (0, -0.096, 1.575), 0.002, 0.002, 1.0, skin_shadow, "Head", 12))
    skin_parts.append(add_sphere("UpperLip", (0, -0.091, 1.568), (0.030, 0.009, 0.006), lips, "Head", 32, 18))
    skin_parts.append(add_sphere("LowerLip", (0, -0.091, 1.558), (0.027, 0.010, 0.007), lips, "Head", 32, 18))
    skin_parts.append(add_sphere("MouthLine", (0, -0.099, 1.563), (0.023, 0.002, 0.002), skin_shadow, "Head", 24, 12))
    skin_parts.append(add_hair_cap(hair, "Head"))

    # Bare hands, forearms, calves and feet use tapered anatomy with joint forms.
    for side, label in [(-1, "Right"), (1, "Left")]:
        shoulder = (side * 0.205, 0, 1.36)
        elbow = (side * 0.32, -0.002, 1.17)
        wrist = (side * 0.43, -0.010, 0.98)
        palm = (side * 0.465, -0.020, 0.89)
        skin_parts.append(add_limb(label + "ForearmSkin", elbow, wrist, 0.061, 0.038, 0.84, skin, label + "ForeArm"))
        skin_parts.append(add_sphere(label + "Wrist", wrist, (0.034, 0.028, 0.031), skin, label + "Hand"))
        skin_parts.append(add_sphere(label + "Palm", palm, (0.047, 0.025, 0.060), skin, label + "Hand"))
        # Five individually modeled fingers, gently spread, with knuckles and nails.
        for finger in range(4):
            xoff = (finger - 1.5) * 0.026
            length = [0.070, 0.083, 0.078, 0.064][finger]
            x = side * 0.465 + xoff
            start = (x, -0.025, 0.842)
            mid = (x + xoff * 0.10, -0.028, 0.842 - length * 0.53)
            tip = (x + xoff * 0.20, -0.026, 0.842 - length)
            rad = [0.008, 0.0085, 0.008, 0.0075][finger]
            skin_parts.append(add_limb(label + "Finger" + str(finger + 1), start, tip, rad, rad * 0.62, 0.86, skin, label + "Hand", 16))
            skin_parts.append(add_sphere(label + "Knuckle" + str(finger + 1), mid, (rad * 0.83, rad * 0.85, rad * 0.83), skin, label + "Hand", 20, 12))
            skin_parts.append(add_sphere(label + "Nail" + str(finger + 1), (tip[0], -0.036, tip[2] + 0.008), (rad * 0.55, 0.003, 0.009), nails, label + "Hand", 16, 10))
        thumb_start = (side * 0.418, -0.021, 0.882)
        thumb_tip = (side * 0.390, -0.030, 0.832)
        skin_parts.append(add_limb(label + "Thumb", thumb_start, thumb_tip, 0.014, 0.009, 0.9, skin, label + "Hand", 16))
        skin_parts.append(add_sphere(label + "ThumbNail", (thumb_tip[0], -0.039, thumb_tip[2]), (0.007, 0.003, 0.009), nails, label + "Hand", 16, 10))

    # Lower legs visible below the gown hem.
    for side, label in [(-1, "Right"), (1, "Left")]:
        hip = (side * 0.09, 0, 0.91)
        knee = (side * 0.095, 0, 0.51)
        ankle = (side * 0.095, 0, 0.10)
        # The upper thighs continue beneath the gown to meet the visible knees.
        skin_parts.append(add_limb(label + "Thigh", hip, knee, 0.080, 0.067, 0.91, skin, label + "UpLeg"))
        skin_parts.append(add_limb(label + "Calf", knee, ankle, 0.069, 0.039, 0.88, skin, label + "Leg"))
        skin_parts.append(add_sphere(label + "Knee", knee, (0.055, 0.054, 0.056), skin, label + "Leg"))
        skin_parts.append(add_sphere(label + "Ankle", ankle, (0.041, 0.040, 0.043), skin, label + "Foot"))
        skin_parts.append(add_sphere(label + "FootShape", (side * 0.095, -0.090, 0.060), (0.058, 0.143, 0.045), skin, label + "Foot"))
        for toe in range(5):
            xoff = (toe - 2) * 0.019
            length = [0.065, 0.083, 0.075, 0.065, 0.052][toe]
            toe_x = side * 0.095 + xoff
            skin_parts.append(add_sphere(label + "Toe" + str(toe + 1), (toe_x, -0.186 + abs(xoff) * 0.3, 0.048), (0.011, length * 0.56, 0.014), skin, label + "Foot", 24, 16))
            skin_parts.append(add_sphere(label + "ToeNail" + str(toe + 1), (toe_x, -0.225 + abs(xoff) * 0.3, 0.058), (0.006, 0.012, 0.002), nails, label + "Foot", 16, 10))

    skin_mesh = make_skinned_mesh(skin_parts, armature, "SyntheticPatient_Skin")
    gown_body = make_gown_body(gown_print, armature)

    # Loose short sleeves follow the arm bones; cuffs define the open sleeve edge.
    sleeve_objects = []
    for side, label in [(-1, "Right"), (1, "Left")]:
        shoulder = (side * 0.205, 0, 1.36)
        elbow = (side * 0.32, -0.002, 1.17)
        sleeve = add_limb(label + "_Gown_Sleeve", shoulder, elbow, 0.120, 0.088, 0.83, gown_print, label + "Arm")
        sleeve_objects.append(sleeve)
        # A narrow cloth band at sleeve opening, also weighted to the upper arm.
        center = Vector(elbow)
        bpy.ops.mesh.primitive_torus_add(major_radius=0.087, minor_radius=0.004, major_segments=32, minor_segments=8, location=center)
        cuff = bpy.context.object
        cuff.name = label + "_Sleeve_Cuff"
        cuff.data.materials.append(gown_trim)
        cuff["weight_bone"] = label + "Arm"
        sleeve_objects.append(cuff)
    make_skinned_mesh(sleeve_objects, armature, "Hospital_Gown_Sleeves")

    # Sewn collar and hem piping are separate light trim meshes.
    bpy.ops.mesh.primitive_torus_add(major_radius=0.105, minor_radius=0.006, major_segments=48, minor_segments=10, location=(0, 0, 1.49))
    collar = bpy.context.object
    collar.name = "Gown_Collar"
    collar.scale.y = 0.78
    collar.data.materials.append(gown_trim)
    add_bone_parent(collar, armature, "Spine2")
    bpy.ops.mesh.primitive_torus_add(major_radius=0.197, minor_radius=0.004, major_segments=64, minor_segments=8, location=(0, 0, 0.715))
    hem = bpy.context.object
    hem.name = "Gown_Hem"
    hem.scale.y = 0.66
    hem.data.materials.append(gown_trim)
    add_bone_parent(hem, armature, "Hips")

    # Mouth shapes make oral examination pose visible without provider-specific facial rigs.
    mouth = add_sphere("FaceExpressions", (0, -0.100, 1.563), (0.024, 0.002, 0.0025), skin_shadow, "Head", 24, 16)
    basis = mouth.shape_key_add(name="Basis")
    open_key = mouth.shape_key_add(name="jawOpen")
    for v in open_key.data:
        v.co.z *= 5.0
        v.co.y -= 0.001
    tongue = add_sphere("TongueExpression", (0, -0.101, 1.552), (0.012, 0.002, 0.003), lips, "Head", 24, 16)
    tongue.shape_key_add(name="Basis")
    out_key = tongue.shape_key_add(name="tongueOut")
    for v in out_key.data:
        v.co.y -= 0.014
        v.co.z -= 0.003
    expression_meshes = [mouth, tongue]
    for expression_mesh in expression_meshes:
        make_skinned_mesh([expression_mesh], armature, expression_mesh.name)

    # Add subtle gown ties at the back of the waist.
    for side in (-1, 1):
        tie = add_sphere("Gown_Tie", (side * 0.095, 0.122, 0.94), (0.012, 0.035, 0.005), gown_trim, "Hips", 20, 12)
        add_bone_parent(tie, armature, "Hips")

    # Present a neutral A-pose in the asset; simulation poses are applied by the app rig.
    armature.select_set(False)
    for obj in bpy.context.selected_objects:
        obj.select_set(False)

    # Render a review image with a studio background and soft key/fill/rim lights.
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.006))
    floor = bpy.context.object
    floor.name = "PreviewFloor"
    floor_mat = material("Preview backdrop", (0.92, 0.93, 0.94), 0.9)
    floor.data.materials.append(floor_mat)

    def area_light(name, loc, power, size, color):
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.shape, data.size, data.color = power, "DISK", size, color
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = loc
        obj.rotation_euler = (Vector((0, 0, 0.95)) - obj.location).to_track_quat("-Z", "Y").to_euler()

    area_light("Key softbox", (-3.0, -4.0, 4.4), 480, 3.2, (1.0, 0.84, 0.74))
    area_light("Cool fill", (3.2, -3.0, 2.1), 330, 3.4, (0.72, 0.84, 1.0))
    area_light("Hair rim", (1.0, 2.0, 3.2), 520, 2.2, (1.0, 0.93, 0.83))
    camera_data = bpy.data.cameras.new("PreviewCamera")
    camera = bpy.data.objects.new("PreviewCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (2.35, -5.4, 1.32)
    target = Vector((0, 0, 0.91))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.20
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False  # Headless container builds may omit OIDN.
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1400
    scene.render.resolution_percentage = 70
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.83, 0.86, 0.9)
    scene.render.filepath = OUT_PREVIEW
    scene.view_settings.view_transform = "AgX"
    bpy.ops.render.render(write_still=True)

    # Export just the patient, armature and materials. Preview fixtures are excluded.
    bpy.ops.object.select_all(action="DESELECT")
    for obj in list(bpy.context.scene.objects):
        if obj.name in {"PreviewFloor", "PreviewCamera", "Key softbox", "Cool fill", "Hair rim"}:
            obj.hide_render = True
            obj.hide_viewport = True
        else:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = skin_mesh
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=False,
        export_morph=True,
        export_image_format="AUTO",
        export_materials="EXPORT",
        export_skins=True,
    )
    print("Exported synthetic patient:", OUT_GLB)
    print("Preview:", OUT_PREVIEW)


if __name__ == "__main__":
    build_patient()
