import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export const gitConfig = {
  user: "sandagent",
  repo: "sandagent",
  branch: "main",
};

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "🏖️ SandAgent",
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
            text: "@sandagent/sdk",
            description: "AI SDK provider & React hooks",
            url: "https://www.npmjs.com/package/@sandagent/sdk",
          },
          {
            text: "@sandagent/manager",
            description: "Core orchestration & interfaces",
            url: "https://www.npmjs.com/package/@sandagent/manager",
          },
          {
            text: "@sandagent/runner-claude",
            description: "Claude Agent SDK runner",
            url: "https://www.npmjs.com/package/@sandagent/runner-claude",
          },
          {
            text: "@sandagent/runner-cli",
            description: "Universal CLI agent runner",
            url: "https://www.npmjs.com/package/@sandagent/runner-cli",
          },
          {
            text: "@sandagent/sandbox-sandock",
            description: "Sandock cloud sandbox adapter",
            url: "https://www.npmjs.com/package/@sandagent/sandbox-sandock",
          },
          {
            text: "@sandagent/sandbox-e2b",
            description: "E2B cloud sandbox adapter",
            url: "https://www.npmjs.com/package/@sandagent/sandbox-e2b",
          },
          {
            text: "@sandagent/sandbox-daytona",
            description: "Daytona sandbox adapter",
            url: "https://www.npmjs.com/package/@sandagent/sandbox-daytona",
          },
        ],
      },
    ],
  };
}
