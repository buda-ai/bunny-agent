import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center flex-1 px-4 py-16 text-center">
      <div className="text-6xl mb-6">🏖️</div>
      <h1 className="text-4xl font-bold mb-4 tracking-tight">BunnyAgent</h1>
      <p className="text-xl text-fd-muted-foreground max-w-2xl mb-2">
        Turn powerful Coding Agents into your product's superpower.
      </p>
      <p className="text-fd-muted-foreground max-w-xl mb-8">
        Plug Claude Code, Anthropic Agent SDK, Codex CLI, Gemini CLI, and more
        into your app as a standard AI SDK model. Local or cloud sandbox. No
        prompt engineering.
      </p>

      <div className="flex gap-4 mb-12">
        <Link
          href="/docs"
          className="px-6 py-3 rounded-lg bg-fd-primary text-fd-primary-foreground font-medium hover:opacity-90 transition-opacity"
        >
          Get Started
        </Link>
        <Link
          href="https://github.com/vikadata/sandagent"
          className="px-6 py-3 rounded-lg border border-fd-border font-medium hover:bg-fd-accent transition-colors"
        >
          GitHub
        </Link>
      </div>

      <div className="rounded-lg border border-fd-border bg-fd-card p-4 font-mono text-sm text-left max-w-lg w-full">
        <span className="text-fd-muted-foreground">$</span> npm install
        @bunny-agent/sdk ai
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 max-w-4xl w-full text-left">
        <div className="rounded-lg border border-fd-border p-6">
          <div className="text-2xl mb-2">🔌</div>
          <h3 className="font-semibold mb-1">AI SDK Compatible</h3>
          <p className="text-sm text-fd-muted-foreground">
            Drop-in model for <code>streamText</code> /{" "}
            <code>generateText</code>. Works with Vercel AI SDK v6.
          </p>
        </div>
        <div className="rounded-lg border border-fd-border p-6">
          <div className="text-2xl mb-2">🏖️</div>
          <h3 className="font-semibold mb-1">Sandboxed Execution</h3>
          <p className="text-sm text-fd-muted-foreground">
            Local mode for desktop apps. Cloud sandboxes (Sandock, E2B, Daytona)
            for production.
          </p>
        </div>
        <div className="rounded-lg border border-fd-border p-6">
          <div className="text-2xl mb-2">🎨</div>
          <h3 className="font-semibold mb-1">Agent Templates</h3>
          <p className="text-sm text-fd-muted-foreground">
            Markdown-based templates turn a generic agent into a domain expert.
            No code required.
          </p>
        </div>
      </div>
    </main>
  );
}
