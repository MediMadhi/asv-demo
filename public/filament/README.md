# Filament Web renderer assets

The browser runtime is Google Filament v1.74.1 (`filament.js` and `filament.wasm`),
downloaded from the official Filament GitHub release.

`filamentAvatar.filamat` is generated from
`src/visualizer/materials/filamentAvatar.mat` with the matching v1.74.1 `matc`:

```bash
matc -a opengl -p mobile \
  -o public/filament/filamentAvatar.filamat \
  src/visualizer/materials/filamentAvatar.mat
```

Filament is licensed under Apache License 2.0. See `LICENSE.txt`.
