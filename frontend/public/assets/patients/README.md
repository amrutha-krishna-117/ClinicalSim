# Reusable clinical patient

The clinical simulation uses `patient.glb` for supine, semi-recumbent, and standing positions, and `patient-sitting.glb` for the sitting position. The standing model is adapted from Innerscene's [Daniel, standing casual model](https://www.innerscene.com/tools/library/3d-parts/daniel-3d-person-standing-casual-f788af5a), built from MakeHuman assets and released under CC0. The seated model is Innerscene's [Ellis, seated upright](https://www.innerscene.com/tools/library/3d-parts/seated-upright-3d-person-seated-c6901f24), released under CC0. It sits upright with knees bent and feet down. The app applies its patterned gown and blue footwear materials to matching meshes.

The supplied source is stored at `frontend/scripts/assets/daniel-source.glb`.
With Blender 4.x, regenerate the runtime asset from the frontend directory:

```sh
blender --background --python scripts/build_cc0_patient.py
```

Regenerate the seated asset from `scripts/assets/ellis-upright-source.glb` with:

```sh
python3 scripts/build_sitting_patient.py
```

These are detailed static human meshes, not scanned or skinned characters. The
seated asset sits at the foot edge of the bed only when Sitting is selected.
The app adds chest breathing and eye blinks
at runtime, with additional subtle motion for state and speech. Clicking the
anatomically aligned zones selects the corresponding exam in the panel. The
GLBs still lack independent arm and facial expression animation; that requires
a skinned patient rig. If a GLB is missing or fails to load, the procedural
patient remains available as a fallback.
