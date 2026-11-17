# Hash Wars arms

All geometry is authored locally by Python. Run from the repository root:

```sh
/snap/bin/blender -b --factory-startup -t 2 -P tools/blender/hash-wars/arms/build.py
```

The default builds all four completed weapons: `carbine`, `arc`, `scatter`
and `rail`. Use `--only carbine` to rebuild one. Each successful export
updates its manifest entry immediately, preserving other entries.

Fast form/pose check (no asset writes):

```sh
/snap/bin/blender -b --factory-startup -t 2 -P tools/blender/hash-wars/arms/build.py -- --only carbine --preview --quick --tag study --shots fp,three,close
```

Drop `--quick` for a Cycles render (`--samples 12` for an economical study).
Set `HW_ARMS_WORK` to an owned review folder when working alongside others.
Final builds bake a shared 2048 atlas,
export embedded WebP textures and re-import the GLB to verify the node
contract. `--no-render` omits final stills, not bake/export/verification.
`--inspect-existing` re-imports a previous GLB and refreshes its manifest and
stills without rebaking; it is for reviewing camera or verification changes.
It does not apply geometry edits. The shared exporter repairs invalid tangent
corners before quantization, so no artist-specific build adapter is needed. `--reexport-cached` repacks the saved baked
blend after exporter-only changes; neither shortcut replaces a full rebuild
after model or finish changes.

Debug blends, textures and render logs belong to the gitignored art-arms
review folder. Outputs are only written to `assets/hash-wars/arms/`.

## Coordinates and poses

Weapon modules use millimetres: X right, Y forward, Z up. Export converts to
metres, X right, Y up, forward −Z. Origin is the centre of the pistol grip.
`spec.parts` lists rigid nodes; `spec.pivots` gives their joints in module
coordinates. `muzzle` is the projectile exit, `sight` the **eye location**
when aimed. Manifest `view` and `review_views` are cameras in glTF space.

The gauntlets share one procedural hand. Palm axes are +Y toward fingers,
+Z out of the hand's back; the left hand is mirrored. Finger lengths, plates
and curl solver are in `lib/hands.py`. Each grip supplies a palm position,
finger direction and back-of-hand direction. `elbow` controls the forearm
independently so a sideways support grasp can still return toward the
player. Arms are single posed meshes; their pivot is the palm centre. The support
elbow drops out and down from the handguard, leaving the wrist in view while
the forearm exits the lower edge. Two ceramic lames and a shorter graphite
elbow lame sit over a ribbed dark sleeve with broad flex gaps. Both hand
and arm detail share the weapon atlas; no runtime materials are added.

Engine code should instantiate `<name>` for first person, `<name>_world`
for pickups. The scene contains both at the same origin; never render both.
The world mesh has no arms and uses about one third of weapon-only geometry.

## Appearance checks

The owned `.impeccable/review/level-10/art-arms/capture.cjs` drives the lead's
viewer with the cameras in the manifest. It intercepts the viewer module in
that browser only, retaining the game's sky and post chain. FP/aim use
the existing game view-model pass and its exact hemisphere/key light recipe;
world-object views retain the stock viewer light and shadows. It does not change the shared viewer. Serve the repository on 5281,
then run `node <capture.cjs path> carbine final fp --depth-backed` for the
reference first-person image. The existing engine HDR history targets need
a depth attachment for a detailed view model; the explicit flag tests that
fix in a fetched browser response only. It does not edit shared engine
files. Omit the flag to reproduce the current engine integration issue.
The browser closes even on failure. Stop the server afterwards.

The capture wrapper uses 640×360 with two static settle frames totalling the
same half-second of exposure adaptation as the stock viewer. The default
960×540 software captures timed out on this shared machine. `--world-pass`
shows the stock world-AO path for a diagnostic comparison; do not use world
AO on first-person geometry. See the art report for before/after evidence.

## Round 2 reproduction

```sh
HW_ARMS_WORK="$PWD/.impeccable/review/level-10/arms/round-2" /snap/bin/blender -b --factory-startup -t 2 -P tools/blender/hash-wars/arms/build.py -- --no-render
python3 tools/blender/hash-wars/arms/validate.py
```

The binary validator checks the embedded image dimensions, required rigid
nodes, bytes, triangles, axes and nonzero finite tangents. The round-2 report
records full-scene high-tier 1280×720 captures using the review-2 cameras.
