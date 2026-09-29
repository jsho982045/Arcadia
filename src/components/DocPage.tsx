export function DocPage({ title, draft, children }: { title: string; draft?: boolean; children: React.ReactNode }) {
  return (
    <article className="card mx-auto max-w-3xl p-6 sm:p-9">
      <h1 className="retro-title-dark text-4xl">{title}</h1>
      {draft && (
        <p className="mt-4 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          Draft template. Have a lawyer review and complete this before launching publicly.
        </p>
      )}
      <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-ink/90 [&_h2]:h-display [&_h2]:pt-4 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted [&_li]:text-muted">
        {children}
      </div>
    </article>
  );
}
