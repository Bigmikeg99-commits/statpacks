"use client";

export default function PodCard({ pod }: { pod: any }) {
  if (!pod) return <div className="no-picks">No POD available yet</div>;

  return (
    <div className="pod-card">
      {/* Paste the full premium card HTML/CSS structure you sent me here if you want exact pixel match */}
      {/* For now using the structure you liked */}
      <div className="pod-photo">
        {/* photo */}
      </div>
      <div className="pod-body">
        <div className="pod-name">{pod.name}</div>
        <div className="pod-meta">{pod.hand}HP · {pod.ha} · vs {pod.opp}</div>
      </div>
    </div>
  );
}