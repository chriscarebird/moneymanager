import { applyUpdate } from '../sw.js';

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

export function UpdateToast({ visible, onDismiss }: Props) {
  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 bg-blue-600 px-4 py-3 text-sm text-white shadow-lg">
      <span>A new version of InvestPilot is available.</span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => {
            applyUpdate();
          }}
          className="rounded bg-white px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
        >
          Reload
        </button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-blue-200 hover:text-white transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
