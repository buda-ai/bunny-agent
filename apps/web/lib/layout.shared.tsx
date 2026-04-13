import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export const gitConfig = {
  user: "bunny-agent",
  repo: "bunny-agent",
  branch: "main",
};

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "🏖️ BunnyAgent",
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    links: [
      {
        text: "Docs",
        url: "/docs",
      },
      {
        text: "Example",
        url: "/example",
      },
      {
        type: "menu",
        text: "NPM Packages",
        items: [
          {
            text: "@bunny-agent/sdk",
            description: "AI SDK provider & React hooks",
            url: "https://www.npmjs.com/package/@bunny-agent/sdk",
          },
          {
            text: "@bunny-agent/manager",
            description: "Core orchestration & interfaces",
            url: "https://www.npmjs.com/package/@bunny-agent/manager",
          },
          {
            text: "@bunny-agent/runner-claude",
            description: "Claude Agent SDK runner",
            url: "https://www.npmjs.com/package/@bunny-agent/runner-claude",
          },
          {
            text: "@bunny-agent/runner-cli",
            description: "Universal CLI agent runner",
            url: "https://www.npmjs.com/package/@bunny-agent/runner-cli",
          },
          {
            text: "@bunny-agent/sandbox-sandock",
            description: "Sandock cloud sandbox adapter",
            url: "https://www.npmjs.com/package/@bunny-agent/sandbox-sandock",
          },
          {
            text: "@bunny-agent/sandbox-e2b",
            description: "E2B cloud sandbox adapter",
            url: "https://www.npmjs.com/package/@bunny-agent/sandbox-e2b",
          },
          {
            text: "@bunny-agent/sandbox-daytona",
            description: "Daytona sandbox adapter",
            url: "https://www.npmjs.com/package/@bunny-agent/sandbox-daytona",
          },
        ],
      },
    ],
  };
}
