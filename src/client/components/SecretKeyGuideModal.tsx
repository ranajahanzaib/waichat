import { useState } from "react";

interface SecretKeyGuideModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SecretKeyGuideModal({ open, onClose }: SecretKeyGuideModalProps) {
  const [guideTab, setGuideTab] = useState<"Wrangler CLI" | "Cloudflare Dashboard">("Wrangler CLI");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-lg bg-white/95 dark:bg-[#1e1e20]/95 backdrop-blur-xl border-[0.5px] border-black/10 dark:border-white/10 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.7)] overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b-[0.5px] border-black/5 dark:border-white/5">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Configure SECRET_KEY</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-gray-500 dark:text-white/40 transition-colors"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="p-1 bg-black/5 dark:bg-white/5 rounded-xl flex">
            {(["Wrangler CLI", "Cloudflare Dashboard"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setGuideTab(tab)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  guideTab === tab
                    ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="min-h-[220px]">
            {guideTab === "Wrangler CLI" ? (
              <div className="space-y-4 animate-in fade-in duration-200">
                <p className="text-[13px] text-gray-600 dark:text-white/60 leading-relaxed">
                  Run this command in your terminal to securely set the encryption key. Use{" "}
                  <code className="bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded font-mono text-[#0A84FF]">
                    openssl rand -base64 32
                  </code>{" "}
                  to generate a strong random value.
                </p>
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-white/30 ml-1">
                    1. Set Secret
                  </p>
                  <pre className="p-4 bg-black/5 dark:bg-black/40 rounded-2xl text-[12px] font-mono text-gray-800 dark:text-white/80 overflow-x-auto border border-black/5 dark:border-white/5">
                    npx wrangler secret put SECRET_KEY
                  </pre>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-white/30 ml-1">
                    2. Redeploy
                  </p>
                  <pre className="p-4 bg-black/5 dark:bg-black/40 rounded-2xl text-[12px] font-mono text-gray-800 dark:text-white/80 border border-black/5 dark:border-white/5">
                    pnpm run deploy
                  </pre>
                </div>
              </div>
            ) : (
              <div className="space-y-5 animate-in fade-in duration-200">
                <ol className="text-[13px] text-gray-600 dark:text-white/60 list-decimal list-outside ml-4 space-y-3.5">
                  <li>
                    Go to{" "}
                    <span className="font-semibold text-gray-900 dark:text-white underline decoration-gray-400/30">
                      Workers & Pages
                    </span>{" "}
                    in your dashboard.
                  </li>
                  <li>
                    Select your worker and navigate to{" "}
                    <span className="font-semibold text-gray-900 dark:text-white">
                      Settings → Variables and Secrets
                    </span>
                    .
                  </li>
                  <li>
                    Click <span className="font-semibold text-gray-900 dark:text-white">Add</span>{" "}
                    and choose{" "}
                    <span className="font-semibold text-gray-900 dark:text-white">Secret</span>.
                  </li>
                  <li>
                    Name it{" "}
                    <code className="bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded font-mono text-[#0A84FF]">
                      SECRET_KEY
                    </code>{" "}
                    and paste your random value.
                  </li>
                  <li>
                    Click{" "}
                    <span className="font-semibold text-gray-900 dark:text-white">Deploy</span> to
                    save changes.
                  </li>
                </ol>
              </div>
            )}
          </div>

          <div className="pt-5 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
            <p className="text-[12px] text-gray-500 dark:text-white/30 italic">
              Once set, refresh the app to continue.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black rounded-full text-xs font-bold hover:opacity-80 transition-opacity"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
