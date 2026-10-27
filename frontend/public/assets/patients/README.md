# Patient models

Put TWO files here (exact names):

    patient-male.glb
    patient-female.glb

Then rebuild:  docker compose build --no-cache frontend && docker compose up

Any humanoid GLB with a skeleton works. For the best result use a model that has
SEPARATE clothing meshes (the app swaps them for a hospital-gown print) and ARKit
blendshapes (blinking + pain/anxiety expressions) - Ready Player Me avatars have both.

Where to get one (check each licence before you use it in a report/demo):
  - Ready Player Me (readyplayer.me): create a male and a female avatar, download as GLB.
  - Sketchfab: search "hospital patient", filter Downloadable + a CC0 / CC-BY licence, download glTF/GLB.
  - Hum3D (the models in your reference screenshots) are PAID; if you buy one, export as GLB/FBX
    (convert FBX to GLB in Blender if needed).

Until the files exist, the app shows a plain fallback body instead of crashing.
