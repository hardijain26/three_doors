import { applicationProgressState, type Role } from "@/lib/client/pipeline.ts";

const STEPS = [
  { state: "not_started", label: "Not started" },
  { state: "started", label: "Started" },
  { state: "submitted", label: "Submitted" },
] as const;

type ApplicationProgressProps = {
  applicationStartedAt: Role["application_started_at"];
  appliedOn: Role["applied_on"];
};

export function ApplicationProgress({ applicationStartedAt, appliedOn }: ApplicationProgressProps) {
  const currentState = applicationProgressState({ application_started_at: applicationStartedAt, applied_on: appliedOn });
  const currentIndex = STEPS.findIndex((step) => step.state === currentState);

  return (
    <div className="application-progress" role="group" aria-label="Application progress">
      <h3 className="application-progress-title">Application</h3>
      <ol className="application-progress-steps">
        {STEPS.map((step, index) => {
          const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";
          return (
            <li key={step.state} className="application-progress-step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <span className="application-progress-marker" aria-hidden="true" />
              <span className="application-progress-label">{step.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
