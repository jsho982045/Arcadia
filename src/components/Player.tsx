"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Props = {
  gameId: string;
  versionId: string;
  playOrigin: string;
  title: string;
  orientation: string;
  thumb?: string | null;
  /** "live" counts play time, scores and saves. "preview" is for PRs and the editor: nothing is recorded. */
  mode?: "live" | "preview";
  signedIn?: boolean;
  isPro?: boolean;
  initialSave?: unknown;
  remainingSeconds?: number | null; // null = unlimited
  autoStart?: boolean;
  reloadKey?: number;
  heightClass?: string;
};

type Msg = { __arcadia: 1; type: string; payload: unknown };

export function Player(props: Props) {
  const { gameId, versionId, playOrigin, mode = "live", signedIn, isPro } = props;
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(!!props.autoStart);
  const [capped, setCapped] = useState(props.remainingSeconds === 0 && mode === "live" && !isPro);
  const [remaining, setRemaining] = useState<number | null>(props.remainingSeconds ?? null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastActivity = useRef(0);
  const src = `${playOrigin}/v/${versionId}/index.html`;

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? null : t)), 2800);
  }, []);

  // Messages from the sandboxed game (via the SDK). Only trust messages from our own iframe.
  useEffect(() => {
    if (!started) return;
    const onMsg = async (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const d = e.data as Msg;
      if (!d || d.__arcadia !== 1 || typeof d.type !== "string") return;
      if (d.type === "activity") lastActivity.current = Date.now();
      if (d.type === "error") setError(String((d.payload as { message?: string })?.message ?? "error").slice(0, 200));
      if (mode !== "live") {
        if (d.type === "score") flash(`Score ${(d.payload as { score: number }).score} (preview: not saved)`);
        return;
      }
      if (d.type === "score") {
        const score = Number((d.payload as { score?: number })?.score);
        if (!Number.isFinite(score)) return;
        if (!signedIn) return flash("Sign in to save your scores");
        const r = await fetch(`/api/games/${gameId}/score`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ score }) });
        const j = await r.json().catch(() => ({}));
        if (j.best) flash(`New personal best: ${score.toLocaleString()}!`);
      }
      if (d.type === "save" && signedIn) {
        fetch(`/api/games/${gameId}/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: d.payload }) });
      }
    };
    addEventListener("message", onMsg);
    return () => removeEventListener("message", onMsg);
  }, [started, mode, signedIn, gameId, flash]);

  // Heartbeat: credit play time only while the tab is visible and the player is actually playing.
  useEffect(() => {
    if (!started || mode !== "live" || capped) return;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivity.current > 30_000) return;
      const r = await fetch("/api/play/heartbeat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameId }) }).catch(() => null);
      if (!r?.ok) return;
      const j = await r.json();
      if (typeof j.remaining === "number") setRemaining(j.remaining);
      if (j.capped) {
        setCapped(true);
        setStarted(false);
      }
    }, 15_000);
    return () => clearInterval(t);
  }, [started, mode, capped, gameId]);

  useEffect(() => {
    const onVis = () => {
      frame.current?.contentWindow?.postMessage({ __arcadia: 1, type: document.visibilityState === "visible" ? "resume" : "pause" }, "*");
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (props.autoStart) setStarted(true);
  }, [props.autoStart]);

  async function start() {
    if (capped) return;
    setStarted(true);
    lastActivity.current = Date.now();
    if (mode === "live") fetch(`/api/games/${gameId}/play`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
    setTimeout(() => frame.current?.focus(), 300);
  }

  function fullscreen() {
    const el = box.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => {});
    setTimeout(() => frame.current?.focus(), 200);
  }

  const portrait = props.orientation === "portrait";
  const boot = JSON.stringify({ arcadia: { save: props.initialSave ?? null, signedIn: !!signedIn } });

  return (
    <div data-game-id={gameId} className="cabinet">
      <div className="cabinet-bar">
        <span className="led" style={{ "--c": "#fff" } as React.CSSProperties} />
        <span className="min-w-0 truncate text-sm font-black uppercase tracking-wide text-white [text-shadow:0_1px_0_rgba(120,45,0,.7)]" style={{ fontFamily: "var(--font-display)" }}>
          {mode === "preview" ? "Preview" : "Now playing"} <span className="opacity-70">/</span> {props.title}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <span className="led" style={{ "--c": started && !capped ? "#3cff8a" : "#ff5a3c" } as React.CSSProperties} />
          <span className="hidden text-[10px] font-black tracking-widest text-white/90 sm:inline">{started && !capped ? "ON" : "READY"}</span>
        </span>
      </div>
      <div
        ref={box}
        className={`cabinet-screen relative w-full overflow-hidden ${props.heightClass ?? (portrait ? "h-[78vh] max-h-[820px]" : "aspect-video max-h-[78vh]")}`}
      >
        {started && !capped ? (
          <iframe
            key={`${versionId}-${props.reloadKey ?? 0}`}
            ref={frame}
            name={boot}
            src={src}
            title={props.title}
            // No allow-same-origin: the game gets an opaque origin and can't touch any site's cookies or storage.
            sandbox="allow-scripts allow-pointer-lock"
            allow="fullscreen; gamepad; autoplay"
            className="h-full w-full border-0"
            data-testid="game-frame"
          />
        ) : capped ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#ffe2b8] to-[#bfdcfa] p-8 text-center">
            <p className="retro-title-dark text-3xl">You&apos;ve used today&apos;s free play time</p>
            <p className="max-w-md text-muted">Free accounts get 30 minutes of play a day across all games. Go Pro for unlimited play; half of it goes to the people who make these games.</p>
            <div className="mt-2 flex gap-2">
              <Link href="/pro" className="btn-primary px-6 py-3">Go Pro: unlimited play</Link>
              {!signedIn && <Link href="/signup" className="btn-ghost px-6 py-3">Join free</Link>}
            </div>
            <p className="text-xs text-dim">Your free time resets at midnight UTC.</p>
          </div>
        ) : (
          <button onClick={start} className="group relative flex h-full w-full items-center justify-center" data-testid="play-button">
            {props.thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.thumb} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-xl" />
            )}
            <span className="relative flex flex-col items-center gap-4">
              <span className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-[#b95400] bg-gradient-to-b from-[#ffbd5c] via-[#ff9a1f] to-[#f07800] text-4xl text-white shadow-[inset_0_2px_0_rgba(255,255,255,.6),0_0_50px_-5px_#ff9a1f] transition group-hover:scale-110">▶</span>
              <span className="retro-title text-2xl">{mode === "preview" ? "Play preview" : `Play ${props.title}`}</span>
            </span>
          </button>
        )}
        {toast && <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-white/95 px-4 py-1.5 text-sm font-bold text-ink shadow-lg">{toast}</div>}
      </div>
      <div className="cabinet-foot">
        <span>
          {mode === "preview" ? (
            "Preview: play time, scores and saves are not recorded."
          ) : isPro ? (
            <span className="font-bold text-[#ffb95a]">PRO · unlimited play</span>
          ) : remaining !== null ? (
            <>Free play left today: <b className="text-white">{Math.ceil(remaining / 60)} min</b> · <Link href="/pro" className="font-bold text-[#ffb95a] hover:underline">Go unlimited</Link></>
          ) : null}
          {error && <span className="ml-2 text-[#ff8a8a]">Game error: {error}</span>}
        </span>
        <span className="flex gap-2">
          {started && (
            <button onClick={() => { setStarted(false); setTimeout(() => setStarted(true), 50); }} className="btn-mini">↻ Restart</button>
          )}
          <button onClick={fullscreen} className="btn-mini">⛶ Fullscreen</button>
        </span>
      </div>
    </div>
  );
}
