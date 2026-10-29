"""Prepare the CC0 seated Ellis model for the simulation room (stdlib only)."""
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/assets/ellis-upright-source.glb"
OUTPUT = ROOT / "public/assets/patients/patient-sitting.glb"
RENAMES = {
    "male_elegantsuit01": "patient-gown",
    "shoes04": "patient-footwear",
    "low-poly": "patient-eyes",
}


def main() -> None:
    raw = SOURCE.read_bytes()
    magic, version, total = struct.unpack_from("<4sII", raw)
    if magic != b"glTF" or version != 2 or total != len(raw):
        raise ValueError(f"Invalid GLB source: {SOURCE}")
    json_size, json_kind = struct.unpack_from("<II", raw, 12)
    if json_kind != 0x4E4F534A:
        raise ValueError("GLB JSON chunk is missing")
    doc = json.loads(raw[20:20 + json_size])
    for node in doc.get("nodes", []):
        old_name = node.get("name", "")
        new_name = RENAMES.get(old_name)
        if not new_name:
            continue
        node["name"] = new_name
        mesh_index = node.get("mesh")
        if mesh_index is not None:
            doc["meshes"][mesh_index]["name"] = new_name
    json_chunk = json.dumps(doc, separators=(",", ":")).encode()
    json_chunk += b" " * ((-len(json_chunk)) % 4)
    binary_start = 20 + json_size
    binary_size, binary_kind = struct.unpack_from("<II", raw, binary_start)
    if binary_kind != 0x004E4942:
        raise ValueError("GLB binary chunk is missing")
    binary = raw[binary_start + 8:binary_start + 8 + binary_size]
    out = (struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(json_chunk) + 8 + len(binary))
           + struct.pack("<II", len(json_chunk), 0x4E4F534A) + json_chunk
           + struct.pack("<II", len(binary), 0x004E4942) + binary)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(out)
    print(f"Wrote seated patient: {OUTPUT} ({len(out):,} bytes)")


if __name__ == "__main__":
    main()
