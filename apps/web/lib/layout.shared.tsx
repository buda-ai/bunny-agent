import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const gitConfig = {
  user: 'vikadata',
  repo: 'sandagent',
  branch: 'main',
};

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: '🏖️ SandAgent',
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    links: [
      {
        text: 'Docs',
        url: '/docs',
      },
      {
        text: 'Example',
        url: '/example',
      },
      {
        text: 'npm',
        url: 'https://www.npmjs.com/package/@sandagent/sdk',
        external: true,
      },
    ],
  };
}
