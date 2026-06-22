import { CheckCircle2, XCircle } from "lucide-react";

export function CheckRow({ label, passed }: { label: string; passed?: boolean | null }) {
  const pending = passed === undefined || passed === null;
  return (
    <div className={`check-row ${pending ? "pending" : passed ? "pass" : "fail"}`}>
      {pending ? <span className="dot" /> : passed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
      <span>{label}</span>
    </div>
  );
}
