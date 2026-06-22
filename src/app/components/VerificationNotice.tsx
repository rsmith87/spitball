import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { MessageVerification } from "../../spitball/types";
import { verificationIssueReason, verificationStatusLabel } from "../utils/chatView";

export function VerificationNotice({ verification }: { verification?: MessageVerification }) {
  if (!verification) return null;

  const label = verificationStatusLabel(verification);
  const statusIcon =
    verification.status === "verified" || verification.status === "no_code_claims" ? (
      <CheckCircle2 size={14} />
    ) : verification.status === "failed" ? (
      <XCircle size={14} />
    ) : (
      <AlertTriangle size={14} />
    );

  if (!verification.issues.length) {
    return (
      <div className="verification-status" data-status={verification.status}>
        {statusIcon}
        <span>{label}</span>
      </div>
    );
  }

  return (
    <details className="verification-notice" data-status={verification.status} open>
      <summary className="verification-status" data-status={verification.status}>
        {statusIcon}
        <span>{label}</span>
      </summary>
      <div className="verification-issues">
        {verification.issues.map((issue) => (
          <div className="verification-issue" key={`${issue.kind}-${issue.start}-${issue.end}-${issue.value}`}>
            <strong>Unverified claim</strong>
            <span>{verificationIssueReason(issue)}</span>
            <code>{issue.value}</code>
          </div>
        ))}
      </div>
    </details>
  );
}
