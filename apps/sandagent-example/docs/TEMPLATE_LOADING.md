# Template Loading

SandAgent 使用 Claude Agent SDK 的 `settingSources: ["project"]` 机制自动加载模板配置。

## 流程

1. **前端选择模板** - 用户在 UI 选择模板（如 `seo-agent`）
2. **API 接收模板名** - `route.ts` 从请求 body 获取 `template` 参数
3. **上传模板文件** - `E2BSandbox` 将模板目录上传到 sandbox 的 `/sandagent/`
4. **设置工作目录** - `workspace.path` 设为 `/sandagent`
5. **SDK 自动加载** - Claude Agent SDK 从 `cwd` 加载配置文件

## 模板目录结构

```
templates/seo-agent/
├── CLAUDE.md                    # System prompt
└── .claude/
    ├── settings.json            # SDK 配置
    └── skills/                  # Skills 目录
        ├── keyword-research/
        │   └── keyword-research.skill.md
        └── ...
```

## 关键代码

### route.ts
```typescript
const sandbox = new E2BSandbox({
  templatesPath: path.join(TEMPLATES_PATH, template),  // 模板路径
});

return agent.stream({
  workspace: { path: "/sandagent" },  // 工作目录 = 模板上传位置
});
```

### e2b-sandbox.ts
```typescript
// 上传模板文件到 /sandagent（包括 .claude 目录）
const templateFiles = this.collectFiles(this.templatesPath, "");
await handle.upload(filesToUpload, "/sandagent");
```

### claude-runner.ts
```typescript
const sdkOptions = {
  settingSources: [SettingSource.project],  // SDK 从 cwd 加载配置
};
```

## 注意事项

- `.claude` 目录会被上传（之前被跳过了）
- `.git` 和 `node_modules` 目录会被跳过
- 同一个 session 切换模板需要刷新页面（sandbox 实例被缓存）
