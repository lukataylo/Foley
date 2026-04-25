// Doc detail / view. Edit surfaces are a follow-up — for now, render each
// kind in its native form so the user can read the doc and click into the
// existing editor surfaces (the master video for videos).

import Link from "next/link";
import { notFound } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { loadDocs } from "@/lib/docs";

export const dynamic = "force-dynamic";

export default async function DocDetailPage({
  params,
}: {
  params: { id: string; doc_id: string };
}) {
  const docs = await loadDocs(params.id);
  const doc = docs.find((d) => d.id === params.doc_id);
  if (!doc) notFound();

  return (
    <main className="detail">
      <div className="wt">
        <header className="wt-header">
          <div className="wt-header-left">
            <Link href={`/walkthroughs/${params.id}`} className="detail-back">← Back to project</Link>
          </div>
          <div className="actions"><ThemeToggle /></div>
        </header>

        <div className="wt-titleblock">
          <p className="detail-eyebrow">
            <span className={`kind-pill kind-${doc.kind}`} style={{ marginRight: 8 }}>
              {doc.kind}
            </span>
            {doc.group ? `${doc.group} · ` : ""}{params.id}
          </p>
          <h1 className="detail-title">{doc.title}</h1>
          <p style={{ color: "var(--muted)", fontSize: 15, marginTop: 10, maxWidth: 720 }}>
            {doc.summary}
          </p>
        </div>

        <article className="doc-view">
          {doc.kind === "video" ? (
            <div className="doc-view-video">
              <video
                controls
                preload="metadata"
                src={`/walkthroughs/${params.id}/takes/${doc.video_take_id}/master.mp4`}
                poster={`/walkthroughs/${params.id}/steps/intro.png`}
              />
              <div className="doc-view-actions">
                <Link href={`/takes/${doc.video_take_id}`} className="btn-primary">
                  Open in editor →
                </Link>
                <Link href={`/docs/${params.id}`} className="btn-secondary">
                  Public docs page
                </Link>
              </div>
            </div>
          ) : null}

          {doc.kind === "steps" ? (
            <ol className="doc-view-steps">
              {doc.steps.map((s, i) => (
                <li key={i}>
                  <div className="doc-view-step-num">{String(i + 1).padStart(2, "0")}</div>
                  <div className="doc-view-step-body">
                    <p className="doc-view-step-caption">{s.caption}</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.image_url} alt="" />
                  </div>
                </li>
              ))}
            </ol>
          ) : null}

          {doc.kind === "text" ? (
            <div className="doc-view-text">
              {(doc.body ?? doc.summary).split(/\n\n+/).map((para, i) => {
                if (para.startsWith("# "))    return <h1 key={i}>{para.slice(2)}</h1>;
                if (para.startsWith("## "))   return <h2 key={i}>{para.slice(3)}</h2>;
                if (para.startsWith("- "))    return (
                  <ul key={i}>
                    {para.split("\n").map((l, j) => l.startsWith("- ")
                      ? <li key={j}>{l.slice(2)}</li>
                      : null)}
                  </ul>
                );
                return <p key={i}>{para}</p>;
              })}
            </div>
          ) : null}
        </article>
      </div>
    </main>
  );
}
