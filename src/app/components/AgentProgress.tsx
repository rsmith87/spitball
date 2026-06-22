import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { ChatProgressEvent } from "../../spitball/types";

export function AgentProgress({ events }: { events: ChatProgressEvent[] }) {
  if (!events.length) return null;
  return (
    <div className="agent-progress" aria-label="Agent progress">
      {events.map((event) => (
        <span className="agent-progress-pill" data-status={event.status} key={event.id}>
          {event.status === "running" ? <Loader2 className="spin" size={13} /> : event.status === "failed" ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
          <span>{event.detail ? `${event.label} ${event.detail}` : event.label}</span>
          {event.target ? <small>{event.target}</small> : null}
        </span>
      ))}
    </div>
  );
}
