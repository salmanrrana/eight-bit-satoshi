# Cartel machine assets

Six original models: strider, gnat, bulwark, watcher, siege and hauler.
No third-party models or textures.

From the repository root:

```sh
/snap/bin/blender -b --factory-startup -t 2 -P tools/blender/hash-wars/machines/build.py
```

Pass machine names after `--` to rebuild a subset. `--no-render` skips
Cycles review stills. `--geo` checks forms without baking or exporting.
`--tex N` is for trials; delivery sizes are in each module's CONFIG.

Each module defines its shape, dimensions, joints and bake settings.
Build coordinates are `(left, forward, up)` in metres; `lib.P()` maps them
into Blender. GLBs are +Y up, facing +Z. Ground walkers have ground roots;
gnat and hauler have centre roots. **Siege is authored relative to Station
Three's spire origin**, identity rotation and scale. Its 22m crawler is
vertical on the west face; its wider bounds include the exact sim drain
couplings and remote defending turrets. Never rescale that envelope to 22m.
`manifest.json` records placement, clamp centres and scoped turret names.
The siege module reads the current sim coordinates at build time.

Every moving part has a rigid node and joint pivot; neutral rotations are
identity. Watcher `head` supports yaw/pitch; `gun` is an optional inner pitch
cradle. Its three leg hinge axes follow each leg's radial plane. Hauler has
four `thruster_*` pods, `bay`, `bay_release` and two `bay_door_*` hinges.
Siege has three `clamp_*` nodes, each with a `_coupling`, `_jaw` and drain
cables; two independently extractable `turret_*` trees have unique `_head`
and `_muzzle` names. See manifest `extra` and the review report for placement.

The build checks closed meshes and triangle limits, unwraps one atlas,
bakes AO/curvature, bevel normals, wear, heat and dust on a disposable joined
copy, and exports rigid near and distant hierarchies sharing embedded WebP
base colour, normal and packed occlusion/roughness/metal maps. Small distant
fasteners are omitted. The GLB is re-imported to check names, parents, pivots
and closed surfaces. New exports and manifests are replaced atomically.

UV checkpoints and source PNGs stay in the gitignored review folder.
`--reuse-masks` reuses UV/AO; `--reuse-bakes` also reuses normals. Use these
only for finish changes with identical geometry, UVs, resolution and bake
parameters. The normal build uses no caches or manual operations.

```sh
python3 tools/blender/hash-wars/machines/audit.py
```

This audits GLB contents, embedded WebP dimensions, required nodes,
triangles, LOD ratios, sim clamp centres and the 10 MB package limit.
Game-light captures, Cycles checks, before/after rounds, scale markers and
the delivery report are in `.impeccable/review/level-10/art-machines/`.
