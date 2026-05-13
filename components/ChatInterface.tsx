"use client";

/**
 * MVP freeze: full conversational AI chat is disabled.
 * Original implementation preserved in git history (pre-mvp-freeze).
 * Re-enable: restore from git + flip FEATURE_AI_CHAT_FULL=1.
 */
export default function ChatInterface(_props: any) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100 px-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-2xl font-semibold">Chat AI temporar dezactivat</h1>
        <p className="text-neutral-400 text-sm">
          Chat AI este temporar dezactivat. Va reveni curând.
        </p>
      </div>
    </div>
  );
}
