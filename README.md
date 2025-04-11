# collaboration-demo

This is a demo project for real-time collaborative document editing based on Tiptap and Hocuspocus.

## online demo

if you just want to see the demo, you can visit [here](todo).

---

bellow is for developer.

---

## running the project

1. Clone the repository
```bash
# git clone
git clone https://github.com/CoderMonkie/collaboration-demo.git
```

2. Install dependencies
```bash
# pnpm
pnpm install
```
3. Run the project
```bash
# pnpm
pnpm dev
```

## development

## deployment

### Railway

当部署到Railway时，请按照以下步骤配置以避免构建错误：

1. 在Railway项目设置中，确保正确配置以下设置：
安装
   - **启动命令**：直接指定服务器目录路径
     ```bash
     cd packages/server && npm install && npm start
     ```

2. **重要提示**：由于项目是monorepo结构，Railway的Nixpacks可能无法自动检测部署计划。确保不要使用根目录的命令如`pnpm start:server`，而是使用上面的直接路径命令。

3. 如果仍然遇到Nixpacks部署失败的问题，可以尝试在项目根目录添加一个`nixpacks.toml`文件，指定安装和启动命令：

   ```toml
   [phases.setup]
   cmds = ["cd packages/server && npm install"]
   
   [start]
   cmd = "cd packages/server && npm start"
   ```

4. 确保服务器的`package.json`中包含正确的启动脚本：
   ```json
   "scripts": {
     "start": "ts-node src/index.ts"
   }
   ```

5. 由于服务器使用ts-node直接运行TypeScript文件，不需要额外的构建步骤。