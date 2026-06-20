using System;
using UnityEngine;

/// <summary>
/// React (asv-demo) から会話パターン由来の駆動データを受け取るブリッジ。
/// index.html 側の postMessage リスナーが
/// unityInstance.SendMessage("AsvBridge", "OnMessage", json) を呼ぶ。
/// </summary>
public sealed class AsvBridge : MonoBehaviour
{
    public static AsvBridge Instance { get; private set; }

    public float AudioLevel { get; private set; }
    public float Zcr { get; private set; }
    public float RmsHigh { get; private set; }
    public string State { get; private set; } = "listening";
    public Color Accent { get; private set; } = Color.white;
    public Color Background { get; private set; } = Color.black;

    /// <summary>新しいフレームを受信したフラグ（色の再適用判定などに利用）</summary>
    public bool HasNewColor { get; private set; }

    [Serializable]
    private struct Frame
    {
        public float audioLevel;
        public float zcr;
        public float rmsHigh;
        public string state;
        public string color;       // "#RRGGBB"
        public string background;  // "#RRGGBB"
    }

    private void Awake()
    {
        Instance = this;
    }

    // JS から呼ばれるエントリポイント
    public void OnMessage(string json)
    {
        if (string.IsNullOrEmpty(json))
        {
            return;
        }

        Frame frame;
        try
        {
            frame = JsonUtility.FromJson<Frame>(json);
        }
        catch
        {
            return;
        }

        AudioLevel = Mathf.Clamp01(frame.audioLevel);
        Zcr = frame.zcr;
        RmsHigh = frame.rmsHigh;

        if (!string.IsNullOrEmpty(frame.state))
        {
            State = frame.state;
        }

        if (TryParseColor(frame.color, out Color accent) && accent != Accent)
        {
            Accent = accent;
            HasNewColor = true;
        }

        if (TryParseColor(frame.background, out Color background))
        {
            Background = background;
        }
    }

    public void ConsumeColorFlag()
    {
        HasNewColor = false;
    }

    private static bool TryParseColor(string hex, out Color color)
    {
        color = Color.white;
        if (string.IsNullOrEmpty(hex))
        {
            return false;
        }

        return ColorUtility.TryParseHtmlString(hex, out color);
    }
}
