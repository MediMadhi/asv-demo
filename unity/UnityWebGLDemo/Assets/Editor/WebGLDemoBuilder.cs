using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

public static class WebGLDemoBuilder
{
    private const string ScenePath = "Assets/Scenes/UnityWebGLDemo.unity";
    private const string BuildPath = "../../public/unity-webgl-demo";

    public static void Build()
    {
        CreateDemoScene();

        EditorUserBuildSettings.SwitchActiveBuildTarget(
            BuildTargetGroup.WebGL,
            BuildTarget.WebGL
        );

        PlayerSettings.productName = "ASV Unity WebGL Demo";
        PlayerSettings.companyName = "olumo";
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
        PlayerSettings.WebGL.decompressionFallback = true;
        PlayerSettings.WebGL.template = "APPLICATION:Default";
        PlayerSettings.defaultScreenWidth = 900;
        PlayerSettings.defaultScreenHeight = 900;

        BuildPlayerOptions options = new BuildPlayerOptions
        {
            scenes = new[] { ScenePath },
            locationPathName = BuildPath,
            target = BuildTarget.WebGL,
            options = BuildOptions.None
        };

        BuildReport report = BuildPipeline.BuildPlayer(options);
        if (report.summary.result != BuildResult.Succeeded)
        {
            throw new System.Exception($"WebGL build failed: {report.summary.result}");
        }

        PostProcessWebGLTemplate();
    }

    private static void CreateDemoScene()
    {
        Directory.CreateDirectory("Assets/Scenes");

        Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        // 環境光を控えめにして白アルベドでも面が飽和(白飛び)しないようにする
        RenderSettings.ambientLight = new Color(0.28f, 0.28f, 0.28f);
        RenderSettings.fog = false;

        Camera camera = CreateCamera();
        CreateLight();

        GameObject controller = new GameObject("Demo Controller");
        OrbitalAvatarDemo demo = controller.AddComponent<OrbitalAvatarDemo>();

        // React (asv-demo) から会話パターン由来データを受け取るブリッジ。
        // SendMessage の宛先名と一致させるため GameObject 名は "AsvBridge" 固定。
        GameObject bridge = new GameObject("AsvBridge");
        bridge.AddComponent<AsvBridge>();

        GameObject avatarRoot = new GameObject("Low Poly Avatar");
        avatarRoot.transform.position = Vector3.zero;

        Material cubeMaterial = CreateGradientMaterial();

        CreateAvatarShape(avatarRoot.transform, cubeMaterial);

        SerializedObject serializedDemo = new SerializedObject(demo);
        serializedDemo.FindProperty("avatarRoot").objectReferenceValue = avatarRoot.transform;
        serializedDemo.ApplyModifiedPropertiesWithoutUndo();

        camera.transform.LookAt(Vector3.zero);

        EditorSceneManager.SaveScene(scene, ScenePath);
        AssetDatabase.SaveAssets();
    }

    private static Camera CreateCamera()
    {
        GameObject cameraObject = new GameObject("Main Camera");
        Camera camera = cameraObject.AddComponent<Camera>();
        cameraObject.tag = "MainCamera";
        // 斜め上からの視点（少し上・少し横から見下ろす）。LookAt は CreateDemoScene 側で原点へ向ける。
        camera.transform.position = new Vector3(2.8f, 2.6f, -4.2f);
        camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = Color.black;
        camera.fieldOfView = 42f;
        camera.nearClipPlane = 0.1f;
        camera.farClipPlane = 50f;
        return camera;
    }

    private static void CreateLight()
    {
        GameObject lightObject = new GameObject("Key Light");
        Light light = lightObject.AddComponent<Light>();
        light.type = LightType.Directional;
        light.intensity = 0.95f;
        light.transform.rotation = Quaternion.Euler(34f, -28f, 0f);
    }

    private static void CreateAvatarShape(Transform parent, Material material)
    {
        // 単一の直方体。回転が視認しやすいよう各辺の長さを変えた箱にする。
        GameObject box = GameObject.CreatePrimitive(PrimitiveType.Cube);
        box.name = "Avatar Box";
        box.transform.SetParent(parent, false);
        box.transform.localPosition = Vector3.zero;
        box.transform.localRotation = Quaternion.identity;
        box.transform.localScale = new Vector3(1.2f, 1.2f, 1.2f);
        box.GetComponent<Renderer>().sharedMaterial = material;
    }

    private static Material CreateGradientMaterial()
    {
        Shader shader = Shader.Find("ASV/CubeGradient");
        if (shader == null)
        {
            // フォールバック（シェーダー未検出時も最低限描画する）
            return CreateMaterial("ASV Cube", Color.white);
        }

        Material material = new Material(shader) { name = "ASV Cube Gradient" };
        material.SetColor("_BaseColor", Color.white);
        material.SetColor("_CenterColor", Color.black);
        material.SetColor("_VoiceColor", new Color(0.12f, 0.45f, 1.0f, 1.0f));
        material.SetFloat("_AudioLevel", 0f);
        material.SetFloat("_GradientAmount", 0f);
        return material;
    }

    private static Material CreateMaterial(string name, Color color)
    {
        Shader shader = Shader.Find("Universal Render Pipeline/Lit");
        if (shader == null)
        {
            shader = Shader.Find("Standard");
        }

        Material material = new Material(shader)
        {
            name = name,
            color = color
        };

        return material;
    }

    private static void PostProcessWebGLTemplate()
    {
        string indexPath = Path.Combine(BuildPath, "index.html");
        if (File.Exists(indexPath))
        {
            string html = File.ReadAllText(indexPath);
            html = html.Replace(
                "canvas.style.width = \"960px\";\n        canvas.style.height = \"600px\";",
                "canvas.style.width = \"100%\";\n        canvas.style.height = \"100%\";"
            );

            // React 親フレーム -> Unity の postMessage ブリッジを注入する。
            // 親は { type: "asv-frame", payload: <json> } を postMessage で送り、
            // ロード完了時に Unity 側から { type: "asv-unity-ready" } を返す。
            const string anchor = "document.querySelector(\"#unity-loading-bar\").style.display = \"none\";";
            const string bridge = anchor +
                "\n                window.__asvUnityInstance = unityInstance;" +
                "\n                window.addEventListener(\"message\", function (event) {" +
                "\n                  var data = event.data;" +
                "\n                  if (!data || data.type !== \"asv-frame\") return;" +
                "\n                  try { unityInstance.SendMessage(\"AsvBridge\", \"OnMessage\", data.payload); } catch (err) {}" +
                "\n                });" +
                "\n                try { window.parent.postMessage({ type: \"asv-unity-ready\" }, \"*\"); } catch (err) {}";
            html = html.Replace(anchor, bridge);

            File.WriteAllText(indexPath, html);
        }

        string stylePath = Path.Combine(BuildPath, "TemplateData/style.css");
        if (File.Exists(stylePath))
        {
            string css = File.ReadAllText(stylePath);
            css += @"

html,
body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}

#unity-container,
#unity-container.unity-desktop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
  transform: none;
}

#unity-canvas {
  width: 100% !important;
  height: 100% !important;
  display: block;
  background: #000;
}

#unity-footer {
  display: none;
}
";
            File.WriteAllText(stylePath, css);
        }
    }
}
