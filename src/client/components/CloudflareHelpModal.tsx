interface CloudflareHelpModalProps {
  open: boolean;
  onClose: () => void;
  type: "account_id" | "api_token";
}

export default function CloudflareHelpModal({ open, onClose, type }: CloudflareHelpModalProps) {
  if (!open) return null;

  const isAccount = type === "account_id";

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
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">
            {isAccount ? "Find your Account ID" : "Create an API Token"}
          </h2>
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
          {isAccount ? (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-3">
                <p className="text-[13px] text-gray-600 dark:text-white/60 leading-relaxed">
                  Log in to your Cloudflare dashboard. You can find your Account ID in two places:
                </p>
                <div className="space-y-4 mt-4">
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#0A84FF]/10 text-[#0A84FF] flex items-center justify-center shrink-0 text-xs font-bold">
                      1
                    </div>
                    <div className="space-y-1">
                      <p className="text-[13px] text-gray-700 dark:text-white/80">
                        Visit your{" "}
                        <a
                          href="https://dash.cloudflare.com/?to=/:account/workers-and-pages"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#0A84FF] hover:underline font-medium"
                        >
                          Workers & Pages Dashboard
                        </a>
                        .
                      </p>
                      <p className="text-xs text-gray-500 dark:text-white/40">
                        Your Account ID will be visible in the{" "}
                        <span className="font-semibold">right sidebar</span>.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#0A84FF]/10 text-[#0A84FF] flex items-center justify-center shrink-0 text-xs font-bold">
                      2
                    </div>
                    <div className="space-y-2">
                      <p className="text-[13px] text-gray-700 dark:text-white/80">
                        Check your browser's <span className="font-semibold">address bar</span>{" "}
                        while on any dashboard page:
                      </p>
                      <pre className="p-3 bg-black/5 dark:bg-black/40 rounded-xl text-[11px] font-mono text-gray-800 dark:text-white/80 border border-black/5 dark:border-white/5">
                        dash.cloudflare.com/
                        <span className="text-[#0A84FF] font-bold">{"{account_id}"}</span>/...
                      </pre>
                    </div>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-black/[0.02] dark:bg-white/[0.02] rounded-2xl border border-black/5 dark:border-white/5">
                  <p className="text-[11px] text-gray-500 dark:text-white/40 leading-relaxed">
                    <span className="font-semibold">Pro Tip:</span> On the main Cloudflare
                    Dashboard, look for the <span className="font-semibold">3-dots (⋯)</span> menu
                    next to your account name and select{" "}
                    <span className="font-semibold text-gray-900 dark:text-white">
                      "Copy account id"
                    </span>
                    .
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5 animate-in fade-in duration-200">
              <p className="text-[13px] text-gray-600 dark:text-white/60 leading-relaxed">
                Follow these steps to create a token with the correct permissions:
              </p>
              <ol className="text-[13px] text-gray-600 dark:text-white/60 list-decimal list-outside ml-4 space-y-3">
                <li>
                  Go to{" "}
                  <a
                    href="https://dash.cloudflare.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0A84FF] hover:underline font-medium"
                  >
                    dash.cloudflare.com
                  </a>{" "}
                  → top-right profile icon →{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">My Profile</span>.
                </li>
                <li>
                  Click the{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">API Tokens</span>{" "}
                  tab, then{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">Create Token</span>.
                </li>
                <li>
                  Use the{" "}
                  <span className="font-semibold text-gray-900 dark:text-white text-[#0A84FF]">
                    Create Custom Token
                  </span>{" "}
                  option at the bottom.
                </li>
                <li>
                  Give your token a descriptive name (e.g.,{" "}
                  <span className="italic font-medium">"WaiChat AI Read-only Token"</span>).
                </li>
                <li>
                  Under{" "}
                  <span className="font-medium text-gray-900 dark:text-white">Permissions</span>,
                  select:
                  <div className="mt-2 ml-1 p-2.5 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5 text-[12px] font-mono">
                    Account → Workers AI → Read
                  </div>
                </li>
                <li>
                  Under{" "}
                  <span className="font-medium text-gray-900 dark:text-white">
                    Account Resources
                  </span>
                  , select your account.
                </li>
                <li>
                  Click{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    Continue to summary
                  </span>{" "}
                  →{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">Create Token</span>.
                </li>
                <li>
                  <span className="text-orange-600 dark:text-orange-400 font-semibold">
                    Important:
                  </span>{" "}
                  Copy the token immediately. It will only be shown once.
                </li>
              </ol>
            </div>
          )}

          <div className="pt-5 border-t border-black/5 dark:border-white/5 flex items-center justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black rounded-full text-xs font-bold hover:opacity-80 transition-opacity"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
