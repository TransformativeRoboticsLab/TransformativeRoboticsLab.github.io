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
| 25 paper demos | `models/<demo>/` (see `data/demos.json`) | the lab's publications |

## Publications and paper demos

The publications section lists every paper on the lab website
(https://transformativerobotlab.com/publications/). Each paper has a short
summary and a link to an interactive demo under `models/<demo>/`, an
illustrative model built from that paper's equations, geometry or algorithm.
Each demo's side panel cites the sections it implements and states what is
simplified. Demos never plot invented measurements.

- `data/extra/<group>.json` holds the hand-written details per paper (summary,
  project, demo link, whether the summary came from the full text or only the
  abstract) and the group's demo cards under `_demos`.
- `tools/build-pubs.py` scrapes the lab publication list and merges those
  details into `data/publications.json` and `data/demos.json`:

```bash
python3 tools/build-pubs.py
```

The script lists any publication that has no details yet. When the lab site
adds a paper, add an entry for it in one of the `data/extra/*.json` files, and
a demo if it has one.

## Update the measured data

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
