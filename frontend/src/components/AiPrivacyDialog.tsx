import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Sparkles } from 'lucide-react';
import { setAiDisclosureHandler, type AiPrivacy } from '../lib/api';

export default function AiPrivacyDialog() {
  const [privacy, setPrivacy] = useState<AiPrivacy | null>(null);
  const resolveRef = useRef<((accepted: boolean) => void) | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    setAiDisclosureHandler((details) => new Promise<boolean>((resolve) => {
      // Settle an earlier request if multiple help actions arrive together.
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      setPrivacy(details);
    }));
    return () => {
      setAiDisclosureHandler(null);
      resolveRef.current?.(false);
      resolveRef.current = null;
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (privacy && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!privacy && dialog.open) {
      dialog.close();
    }
  }, [privacy]);

  function choose(accepted: boolean) {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setPrivacy(null);
    resolve?.(accepted);
  }

  function containTabFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('summary, button, a[href]')]
      .filter((element) => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const policyUrl = privacy?.policy_url;
  const safePolicyUrl = policyUrl && /^https?:\/\//i.test(policyUrl) ? policyUrl : null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); choose(false); }}
      onClose={() => { if (resolveRef.current) choose(false); }}
      onKeyDown={containTabFocus}
      className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-3xl border border-[#dfe2f0] bg-white p-6 text-[#3f4761] shadow-xl backdrop:bg-slate-900/25"
    >
      {privacy && <div key={privacy.version} className="space-y-5">
        <div className="space-y-3">
          <Sparkles aria-hidden="true" className="h-6 w-6 text-[#3d6f67]" />
          <h2 id={titleId} className="font-display text-2xl font-semibold">Use AI help?</h2>
          <p id={descriptionId} className="text-sm leading-6 text-[#475467]">
            AI help sends exercise details to <strong>{privacy.service}</strong>, along with your answer when needed.
          </p>
          <p className="text-sm leading-6 text-[#667085]">AI help is optional. If you continue, we’ll remember your approval for this account on this browser.</p>
        </div>
        <details className="rounded-2xl border border-[#e4e7f2] bg-[#f8fafc] px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-[#3d6f67]">Privacy details</summary>
          <div className="mt-3 space-y-3 leading-6 text-[#475467]">
            <p>{privacy.shared_data}</p>
            <p>{privacy.data_policy}</p>
            {safePolicyUrl && <a href={safePolicyUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Read the service privacy policy</a>}
          </div>
        </details>
        <div className="flex flex-wrap justify-end gap-3">
          <button ref={cancelRef} type="button" className="app-secondary-btn" onClick={() => choose(false)}>Not now</button>
          <button type="button" className="app-primary-btn" onClick={() => choose(true)}>Continue to AI</button>
        </div>
      </div>}
    </dialog>
  );
}
