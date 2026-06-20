using System.Collections.Generic;
using UnityEngine;

public sealed class OrbitalAvatarDemo : MonoBehaviour
{
    [SerializeField] private Transform avatarRoot;

    private Vector3 avatarBaseScale;
    private Camera mainCamera;
    private Transform boxTransform; // 微振動用（親の連続回転と分離するため子に当てる）

    private readonly List<Renderer> avatarRenderers = new List<Renderer>();
    private MaterialPropertyBlock propertyBlock;

    // スムージング済みの値（描画の滑らかさ確保）
    private float smoothedLevel;
    private float smoothedStateScale = 1f;
    private float smoothedGradient;
    private float smoothedZcr; // RMSゲート済み・正規化済みの ZCR

    private static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");
    private static readonly int ColorId = Shader.PropertyToID("_Color");
    private static readonly int CenterColorId = Shader.PropertyToID("_CenterColor");
    private static readonly int AudioLevelId = Shader.PropertyToID("_AudioLevel");
    private static readonly int GradientAmountId = Shader.PropertyToID("_GradientAmount");

    private void Start()
    {
        if (avatarRoot != null)
        {
            avatarBaseScale = avatarRoot.localScale;
            avatarRoot.GetComponentsInChildren(true, avatarRenderers);

            if (avatarRoot.childCount > 0)
            {
                boxTransform = avatarRoot.GetChild(0); // "Avatar Box"
            }
        }

        mainCamera = Camera.main;
        propertyBlock = new MaterialPropertyBlock();
    }

    private void Update()
    {
        float time = Time.time;
        float dt = Time.deltaTime;

        AsvBridge bridge = AsvBridge.Instance;
        string state = bridge != null ? bridge.State : "listening";
        float rawLevel = bridge != null ? bridge.AudioLevel : 0f;
        float rmsHigh = bridge != null ? bridge.RmsHigh : 0f;
        float rawZcr = bridge != null ? bridge.Zcr : 0f;

        // 状態ごとの基準モーション量
        Vector3 spin;           // 各軸の角速度 (deg/sec)
        float reactivity;       // 音声レベルがスケールへ効く強さ
        float baseBreath;       // 呼吸スケールの振幅
        float breathSpeed;      // 呼吸スケールの速さ
        float stateScale;       // 状態ごとの基準サイズ倍率（状態差の強調用）
        float spinLevelGain;    // 音量で回転速度がどれだけ上がるか

        switch (state)
        {
            case "speaking":
                // listening と逆回転（負方向）。AI 音量が大きいほど大きく加速する
                spin = new Vector3(0f, -30f, -10f);
                reactivity = 0.75f;
                baseBreath = 0.03f;
                breathSpeed = 2.0f;
                stateScale = 1.0f;
                spinLevelGain = 6.0f;
                break;
            case "thinking":
                // 速い多軸タンブルで「考えて忙しい」印象
                spin = new Vector3(46f, 78f, 28f);
                reactivity = 0.1f;
                baseBreath = 0.09f;
                breathSpeed = 6.0f;
                stateScale = 1.1f;
                spinLevelGain = 0.6f;
                break;
            case "muted":
                // ほぼ停止・縮小して休止感を強調
                spin = new Vector3(0f, 3f, 0f);
                reactivity = 0f;
                baseBreath = 0.02f;
                breathSpeed = 1.0f;
                stateScale = 0.7f;
                spinLevelGain = 0f;
                break;
            default: // listening / idle
                // 穏やかな単軸回転で待機感（正方向 = speaking と逆）
                spin = new Vector3(0f, 14f, 0f);
                reactivity = 0.18f;
                baseBreath = 0.045f;
                breathSpeed = 2.1f;
                stateScale = 0.95f;
                spinLevelGain = 0.6f;
                break;
        }

        // 音声レベルのスムージング（立ち上がり速く・減衰遅め）
        float target = Mathf.Clamp01(rawLevel);
        float levelSmoothing = target > smoothedLevel ? 18f : 8f;
        smoothedLevel = Mathf.Lerp(smoothedLevel, target, 1f - Mathf.Exp(-levelSmoothing * dt));

        // 状態スケールも滑らかに遷移（状態切替時のカクつき防止）
        smoothedStateScale = Mathf.Lerp(smoothedStateScale, stateScale, 1f - Mathf.Exp(-6f * dt));

        // listening 時のみ辺->中心グラデーションを有効化（状態切替を滑らかに）
        float gradientTarget = state == "listening" ? 1f : 0f;
        smoothedGradient = Mathf.Lerp(smoothedGradient, gradientTarget, 1f - Mathf.Exp(-6f * dt));

        // ZCR（声の鋭さ）。無音時は乱高下するため RMS でゲートし、正規化して使う。
        float audioGate = Mathf.Clamp01((target - 0.004f) / 0.02f); // 声がある時だけ 0->1
        float zcrNorm = Mathf.Clamp01(rawZcr * 5f);                  // 0.2 付近で最大
        float zcrTarget = zcrNorm * audioGate;
        smoothedZcr = Mathf.Lerp(smoothedZcr, zcrTarget, 1f - Mathf.Exp(-12f * dt));

        if (avatarRoot != null)
        {
            float breath = 1f + Mathf.Sin(time * breathSpeed) * baseBreath;
            float pulse = 1f + smoothedLevel * reactivity;
            avatarRoot.localScale = avatarBaseScale * (breath * pulse * smoothedStateScale);

            // 複数軸回転。音量が大きい・高域が多いほど速くなる（speaking は強めに加速）。
            Vector3 angular = spin * (1f + (smoothedLevel + rmsHigh) * spinLevelGain);
            // ZCR（鋭さ）で別軸（X/Z）の回転を上乗せ：鋭い声でキビキビ回る
            angular += new Vector3(smoothedZcr * 120f, 0f, smoothedZcr * 160f);
            avatarRoot.Rotate(angular * dt, Space.World);
        }

        // ZCR による微振動（チリチリ震える）。子に当てて親の連続回転と干渉させない。
        if (boxTransform != null)
        {
            // speaking 時は振動を控えめにする
            float jitterMul = state == "speaking" ? 0.3f : 1f;
            float amp = smoothedZcr * 7f * jitterMul; // 度
            Vector3 jitter = new Vector3(
                Mathf.Sin(time * 53f) * amp,
                Mathf.Sin(time * 61f) * amp,
                Mathf.Sin(time * 47f) * amp);
            boxTransform.localRotation = Quaternion.Euler(jitter);
        }

        ApplyMaterial(bridge);
    }

    private void ApplyMaterial(AsvBridge bridge)
    {
        Color accent = bridge != null ? bridge.Accent : Color.white;
        Color background = bridge != null ? bridge.Background : Color.black;

        if (mainCamera != null)
        {
            mainCamera.backgroundColor = background;
        }

        // グラデーションシェーダーを毎フレーム駆動（音声レベル・色・有効度）
        for (int i = 0; i < avatarRenderers.Count; i++)
        {
            Renderer renderer = avatarRenderers[i];
            if (renderer == null)
            {
                continue;
            }

            renderer.GetPropertyBlock(propertyBlock);
            propertyBlock.SetColor(BaseColorId, accent);      // 辺の色
            propertyBlock.SetColor(ColorId, accent);          // URP Lit フォールバック用
            propertyBlock.SetColor(CenterColorId, background); // 中心の色
            propertyBlock.SetFloat(AudioLevelId, smoothedLevel);
            propertyBlock.SetFloat(GradientAmountId, smoothedGradient);
            renderer.SetPropertyBlock(propertyBlock);
        }
    }
}
