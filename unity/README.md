# Unity WebGL Demo

This directory contains the Unity project used by the `Unity WebGL` visualizer slot in asv-demo.

## Requirements

- Unity Hub
- Unity Editor `6000.3.18f1`
- WebGL Build Support

## Build

From the `asv-demo` repository root:

```bash
'/Applications/Unity/Hub/Editor/6000.3.18f1/Unity.app/Contents/MacOS/Unity' \
  -batchmode \
  -quit \
  -projectPath "$PWD/unity/UnityWebGLDemo" \
  -executeMethod WebGLDemoBuilder.Build \
  -logFile "$PWD/unity-webgl-build.log"
```

The build output is written to:

```text
public/unity-webgl-demo/
```

The React app embeds that output through `src/visualizer/UnityWebGLFrame.tsx`.
