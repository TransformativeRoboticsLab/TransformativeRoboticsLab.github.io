# TransformativeRoboticsLab.github.io

Project splash page of the Transformative Robotics Lab (Northeastern University),
served at https://transformativeroboticslab.github.io/.

Each project card links to an interactive model:

| Project | Model | Built from |
| --- | --- | --- |
| RADs | `Auxetic-Backlash-Model` simulator and paper report (separate Pages site) | simulation |
| TRUNC | `models/trunc/` 3D workspace explorer | `TRUNC` motion-capture data |
| FDE metamaterials | `models/fde/` compression-test explorer | `FDE-Metamaterials` Instron data |
| VTP foam durability | `models/vtp/` durability-test explorer | `vtp-foam-durability` data |
| FPM control | `models/fpm/` probe-scan viewer | `FPM_control` probe data |
| Capstan Design, Reprogrammable Matter | card only, until the repositories have content | — |

## Update the data

The models read compact JSON from `data/`, generated from the public project
repositories together with the thumbnails in `thumbs/`:

```bash
node tools/build-data.mjs            # everything
node tools/build-data.mjs trunc fde  # selected projects
```

## Add a project

Add an entry to `PROJECTS` in `index.html` (title, description, tags,
thumbnail, model link, repository). Put a new model under `models/<name>/`, and
extend `tools/build-data.mjs` if it needs data from its repository.

## Preview locally

```bash
python3 -m http.server 8790
```

Then open http://127.0.0.1:8790/. The models fetch `data/*.json`, so they need
a server; opening the files directly with `file://` will not load the data.
