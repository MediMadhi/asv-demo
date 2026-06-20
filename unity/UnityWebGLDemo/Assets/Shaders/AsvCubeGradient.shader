Shader "ASV/CubeGradient"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
        _BaseColor ("Edge Color", Color) = (1,1,1,1)
        _CenterColor ("Center Color", Color) = (0,0,0,1)
        _AudioLevel ("Audio Level", Range(0,1)) = 0
        _GradientAmount ("Gradient Amount", Range(0,1)) = 0
        _LevelGain ("Level Gain", Range(1,100)) = 40
        _VoiceColor ("Voice Color", Color) = (0.12, 0.45, 1.0, 1.0)
        _Glossiness ("Smoothness", Range(0,1)) = 0.5
        _Metallic ("Metallic", Range(0,1)) = 0.0
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" }
        LOD 200

        CGPROGRAM
        // Standard ライティングモデルで陰影・スペキュラ・反射を得る
        #pragma surface surf Standard fullforwardshadows
        #pragma target 3.0

        sampler2D _MainTex;

        struct Input
        {
            float2 uv_MainTex;
        };

        fixed4 _BaseColor;
        fixed4 _CenterColor;
        half _AudioLevel;
        half _GradientAmount;
        half _LevelGain;
        fixed4 _VoiceColor;
        half _Glossiness;
        half _Metallic;

        void surf(Input IN, inout SurfaceOutputStandard o)
        {
            // ユーザー音声レベルは小さい(0〜0.02程度)のでゲインで正規化。
            float lvl = saturate(_AudioLevel * _LevelGain);

            // 声があるほどブルーの不透明度を上げる(色が強く出る)。
            // 無音 or listening以外(_GradientAmount=0) -> 0 で素の立方体。
            float strength = saturate(lvl) * _GradientAmount;

            // アルベドをブルーへブレンド + 加算発光でテーマ非依存に強く発色させる
            fixed3 col = lerp(_BaseColor.rgb, _VoiceColor.rgb, strength);

            o.Albedo = col;
            o.Emission = _VoiceColor.rgb * strength * 0.3;
            o.Metallic = _Metallic;
            o.Smoothness = _Glossiness;
        }
        ENDCG
    }

    Fallback "Diffuse"
}
