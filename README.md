# GQL Playground

一个运行在浏览器里的 GraphQL 练习工作台。React + Vite + TypeScript + CodeMirror 6 + graphql-js，无需 Docker、没有业务服务器、也没有远程 GraphQL 接口。查询和变更都在当前页面内执行。

## 启动

推荐使用 Node.js 22.12 或更高版本。

```bash
cd gql-playground
npm ci
npm run dev
```

打开 **http://127.0.0.1:4000/**。端口固定为 4000，发生冲突会报错，不会静默切换到另一个地址。

当前依赖已安装；再次启动只需 `npm run dev`。

```bash
npm run check   # TypeScript 检查
npm test        # 真实 schema / store 集成测试
npm run build   # 检查并构建到 dist/
npm run preview # 生产构建预览 http://127.0.0.1:4173/
```

生产预览与开发地址端口不同，因此使用独立的浏览器存储。可以通过快照导出/恢复迁移。

可选：把 `dist/` 放到任意静态站点（包括 GitHub Pages）。不要直接双击 `index.html`。

## 使用

1. 编辑 GraphQL，点击唯一的 **运行** 按钮。有选区时仅执行选区，没有选区时运行整个文档；`Cmd/Ctrl + Enter` 行为相同。
2. 首次可打开「练习手册」，载入订单数据。包含客户、商品、订单与明细，24 位客户与 120 笔订单，以及 9 个练习。
3. 左侧浏览练习库对象：客户、商品、订单、订单明细。展开后是字段名和读写这张表的操作。
4. 点一张表，下方「表数据」分页显示当前行。列名与文档字段一致；没有的字段保持缺失，不会换成别的名字。写入练习库后，这一页会刷新。
5. 点操作可查看参数，并用「插入示例」放进编辑器。这些操作来自表，左侧不再用 Query / Mutation 当目录。不直接对应单张表的 `hello`、`stats`、`search` 收在表后面。类型、枚举和输入默认折叠在底部。
6. 结果是格式化 JSON。点击值可展开全文并复制。文档里有多个 operation 时，可在下方调用其中一个，或选中其中一个再运行。
7. 上方写 GraphQL 操作定义；编辑器卡片底部的调用条传入参数，例如 `GetCustomer(id: "1")`。没有参数时可留空。草稿和调用会一起保存；历史保存最近 200 次执行，点击可恢复，不自动运行。支持 `.graphql` 导入导出操作定义。
8. 右上角切换**浅色 / 深色 / 跟随系统**。蓝灰配色覆盖编辑器、选区、结果和弹窗；选择会记住。

## 错误

执行走 graphql-js 的标准校验与运行时。语法错误、未知字段等校验问题会带上 `locations`，可在消息面板点「定位错误」。resolver 抛出的业务错误（例如重复取消订单、邮箱冲突）会出现在 `errors`，并尽量保留 `path` 与 `extensions.code`。

同一文档里的多个 operation 遵循 GraphQL 规则：请在下方调用其中一个命名操作，或选中其中一个再运行。错误之前看到的 `data` 是引擎确实返回的部分结果，**不能视为 mutation 已经全部成功**。

## 保存、备份与恢复

- 练习数据保存到 IndexedDB；草稿、调用语句、历史、布局与主题使用独立应用存储。旧版保存在本地的 JSON 变量会被忽略，不会打断已保存的查询草稿。
- 同一浏览器、同一地址下刷新会恢复数据。`127.0.0.1`、`localhost` 和不同端口是不同 origin，不能混用。
- 「数据管理 → 导出练习数据快照」生成 `.gqlplay` 文件，包含版本头与 JSON 数据。
- 恢复先创建新实例并验证，再切换；原库保留在「数据管理」中，可重新打开。
- 「重置整个练习库」同样创建空库后切换，保留原库、草稿和历史。
- 「重置示例」只重建练习数据，其中自己 mutation 出来的内容也会被覆盖，操作前会确认。
- 清除浏览器站点数据会删除本地内容。建议定期备份；使用说明中可申请浏览器持久存储。

快照仅供本练习库同版本恢复。更新依赖之前先备份，版本以 `package-lock.json` 为准。

## 已知边界

- 单活动页面。第二个标签页会提示练习库被占用。
- 执行在浏览器进程内完成，没有 `/graphql` 网络端点，也没有远程数据库。
- Schema 由练习应用提供，不能在编辑器里任意新增根类型；可以用 mutation 增改练习数据。
- 不提供订阅、实时推送、文件上传或鉴权流程。
- 这是 GraphQL 编辑器，不是 GraphiQL 皮肤克隆，也不连接外部 API。
- 备份恢复、重置会保留旧练习库，占用额外本地存储；可以在数据管理中重新打开它们。
- 浏览器需支持 Worker 以外的常规能力：IndexedDB 与 Web Locks。字体和资源随构建打包，没有外部字体 CDN。

## 源码结构

```text
src/App.tsx                     工作台、运行、持久化与库切换
src/components/GqlEditor.tsx    CodeMirror GraphQL、选区与主题
src/components/CallEditor.tsx   编辑器底部的调用条
src/components/SchemaTree.tsx   左侧对象：表、字段，以及来自这些表的操作
src/components/DataPreview.tsx  下方表数据：当前行的分页预览
src/components/SchemaDetail.tsx 字段参数、可空性与示例插入
src/components/ResultView.tsx   JSON 结果树、展开与复制
src/graphql/schema.ts           SDL 与 resolver
src/graphql/store.ts            内存练习库，mutation 直接写入
src/graphql/execute.ts          graphql-js 执行与多操作校验
src/graphql/call.ts             调用语句解析与参数绑定
src/graphql/catalog.ts          Schema 浏览与示例插入
src/graphql/databaseView.ts     把内存练习库整理成表、行和对应操作
src/graphql/seed.ts             订单练习数据
src/storage/store.ts            应用 IndexedDB
src/storage/snapshot.ts         .gqlplay 快照格式
src/examples/lessons.ts         欢迎查询与 9 个练习
tests/graphql.test.ts           真实 schema / store 集成测试
tests/call.test.ts              调用语句与参数校验
tests/databaseView.test.ts      表字段、分页行，以及操作是否挂在对应的表上
```

字体和 graphql-js 随构建打包，没有外部字体 CDN 请求。使用本地开发服务器或静态 HTTP 服务器运行，不要直接双击 dist/index.html。
