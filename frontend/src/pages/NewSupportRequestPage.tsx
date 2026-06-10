// 3-step submit wizard: pick issue type → follow checklist → submit.
// Gated by feature flag.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FeatureGate } from '../components/support/FeatureGate';
import {
  fetchTroubleshoot,
  submitSupportRequest,
  SUPPORT_ISSUE_OPTIONS,
} from '../components/support/api';
import { getIssueIcon } from '../components/support/icons';
import { useAuth } from '../hooks/useAuth';
import type { SupportGuidance, SupportIssueType } from '../components/support/types';
import Spinner from '../components/ui/Spinner';
import { friendlyError } from '../utils/api';

const STEPS = ['Issue type', 'Troubleshoot', 'Submit'] as const;

function NewRequestInner(): React.ReactElement {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [issueType, setIssueType] = useState<SupportIssueType | null>(null);
  const [guidance, setGuidance] = useState<SupportGuidance | null>(null);
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const [attemptedSteps, setAttemptedSteps] = useState<string[]>([]);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch checklist when user picks a type
  useEffect(() => {
    if (!issueType) return;
    let cancelled = false;
    setGuidanceLoading(true);
    fetchTroubleshoot(issueType)
      .then((g) => { if (!cancelled) setGuidance(g); })
      .catch(() => { if (!cancelled) setGuidance({ issueType, label: '', steps: [] }); })
      .finally(() => { if (!cancelled) setGuidanceLoading(false); });
    return () => { cancelled = true; };
  }, [issueType]);

  function toggleStep(step: string): void {
    setAttemptedSteps((prev) =>
      prev.includes(step) ? prev.filter((s) => s !== step) : [...prev, step],
    );
  }

  async function handleSubmit(): Promise<void> {
    if (!issueType) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const req = await submitSupportRequest({
        issueType,
        details: details.trim(),
        attemptedSteps,
        guidanceShownAt: new Date().toISOString(),
      });
      navigate(`/support/${req._id}`, { replace: true });
    } catch (err) {
      setSubmitError(friendlyError(err, 'Could not submit your request.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <header className="mb-6">
          <h1 className="font-serif text-2xl text-ink">Report an issue</h1>
          <p className="text-sm text-ink-soft mt-1">
            Signed in as <span className="font-medium">{user?.name}</span>. A support team member will review and reply.
          </p>
        </header>

        {/* Stepper */}
        <ol className="flex items-center gap-2 mb-6" aria-label="Progress">
          {STEPS.map((label, i) => {
            const isActive = i === step;
            const isDone = i < step;
            return (
              <li key={label} className="flex items-center gap-2 flex-1">
                <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isDone ? 'bg-success text-white' :
                  isActive ? 'bg-accent text-accent-text' :
                            'bg-cream text-ink-soft'
                }`}>
                  {isDone ? '✓' : i + 1}
                </span>
                <span className={`text-[11px] font-semibold ${isActive ? 'text-ink' : 'text-ink-soft'}`}>{label}</span>
                {i < STEPS.length - 1 && <span className="flex-1 h-px bg-border" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>

        {/* Step 1: issue type */}
        {step === 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">What stopped you from attending?</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {SUPPORT_ISSUE_OPTIONS.map((opt) => {
                const selected = issueType === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setIssueType(opt.key)}
                    className={`text-left p-4 rounded-2xl border transition-all ${
                      selected
                        ? 'bg-accent/5 border-accent shadow-card'
                        : 'bg-card border-border hover:border-accent/40'
                    }`}
                  >
                    <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl mb-2 ${
                      selected ? 'bg-accent text-accent-text' : 'bg-cream text-accent'
                    }`}>
                      {getIssueIcon(opt.icon)}
                    </span>
                    <p className={`text-sm font-semibold ${selected ? 'text-accent' : 'text-ink'}`}>{opt.label}</p>
                  </button>
                );
              })}
            </div>
            <div className="pt-4 flex items-center justify-between">
              <button type="button" onClick={() => navigate(-1)} className="text-sm text-ink-soft hover:text-ink">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => issueType && setStep(1)}
                disabled={!issueType}
                className="px-5 py-2 rounded-full bg-accent text-accent-text text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent-hover transition-colors"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: troubleshoot */}
        {step === 1 && issueType && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-ink">
              Try these steps first — check off what you tried.
            </h2>
            {guidanceLoading ? (
              <div className="flex items-center gap-2 text-sm text-ink-soft">
                <Spinner size="sm" /> Loading checklist…
              </div>
            ) : (
              <ul className="space-y-2">
                {(guidance?.steps ?? []).map((stepText, i) => {
                  const checked = attemptedSteps.includes(stepText);
                  return (
                    <li key={i}>
                      <label className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card hover:border-accent/30 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleStep(stepText)}
                          className="mt-0.5 w-4 h-4 rounded border-border text-accent focus:ring-accent shrink-0"
                        />
                        <span className={`text-sm ${checked ? 'text-ink-soft line-through' : 'text-ink'}`}>
                          {stepText}
                        </span>
                      </label>
                    </li>
                  );
                })}
                {(!guidance || guidance.steps.length === 0) && (
                  <li className="text-sm text-ink-soft italic">No checklist for this issue type — describe it on the next step.</li>
                )}
              </ul>
            )}
            <p className="text-[11px] text-ink-faint">
              These quick checks solve most issues. If they didn't help, hit Continue and tell us what happened.
            </p>
            <div className="pt-2 flex items-center justify-between">
              <button type="button" onClick={() => setStep(0)} className="text-sm text-ink-soft hover:text-ink">
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-5 py-2 rounded-full bg-accent text-accent-text text-sm font-semibold hover:bg-accent-hover transition-colors"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: describe + submit */}
        {step === 2 && issueType && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-ink">Describe what happened</h2>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={6}
              placeholder="What stopped you from joining? When did the issue start? Any error messages? The more detail, the faster we can help."
              className="w-full px-4 py-3 rounded-2xl border border-border bg-card text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-accent/50 resize-y"
              maxLength={4000}
            />
            <p className="text-[11px] text-ink-faint text-right tabular-nums">
              {details.length} / 4000
            </p>

            {submitError && (
              <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-xl px-3 py-2">
                {submitError}
              </p>
            )}

            <div className="pt-2 flex items-center justify-between">
              <button type="button" onClick={() => setStep(1)} className="text-sm text-ink-soft hover:text-ink">
                ← Back
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || details.trim().length < 10}
                className="px-5 py-2 rounded-full bg-accent text-accent-text text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent-hover transition-colors"
                title={details.trim().length < 10 ? 'Please describe the issue (at least 10 characters).' : ''}
              >
                {submitting ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function NewSupportRequestPage(): React.ReactElement {
  return (
    <FeatureGate featureKey="sessionSupport" featureLabel="Session Support">
      <NewRequestInner />
    </FeatureGate>
  );
}

// Re-export so other files can import the inner component if needed.
export { NewRequestInner };
