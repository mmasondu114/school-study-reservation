# 学校 Ubuntu 部署与更新

访问地址：**https://mason.nekko.cn:1234/study/**。`1234` 为学校对外 HTTPS 端口，不能省略。原有首页投票网站与 `/planpop/` 使用原来的服务。

## 目录与服务

- `/home/mason/study-room/repository`：GitHub 私有仓库检出，只读部署密钥仅能读取本仓库。
- `/home/mason/study-room/releases`：通过检查并构建的网站版本。
- `/home/mason/study-room/current`：当前运行版本的链接。
- `/home/mason/study-room/shared/runtime.json`：运行设置，公网来源、路径、内部端口、数据目录。
- `/home/mason/study-room/shared/data`：账号、预约、照片和反馈。独立于代码版本，更新时保留。
- `/home/mason/study-room/backups`：更新切换前、服务停止后生成的数据快照。
- PM2 服务：`study-reservation`，单进程运行，内部仅监听 `127.0.0.1:3041`。
- Nginx：`/home/mason/nginx/mason.conf` 中 `/study/` 转发到上述内部端口并移除路径前缀，保留完整 Host（含外部端口）。

初始化账号配置通过 SSH 单独配置，不保存在 GitHub。学校真实账号数据库仍未接入；本机旧的预约与反馈没有作为测试数据复制到服务器。

## 更新代码

先在开发电脑提交并推送到 GitHub 的 `main` 分支，然后在服务器运行：

```bash
bash ~/study-room/repository/deploy/update.sh
```

更新程序自动拉取最新代码，在新目录构建并执行测试，通过后切换并重启该网站。数据目录保留，其他 PM2 应用不重启。运行检查失败时恢复先前代码版本。依赖按锁文件和 Node 主版本缓存。无需上传压缩包。

这是按需更新，不会后台轮询或自动发布。后台切换时会有短暂重启，不能保证完全零中断。当前版本可查看 `cat ~/study-room/current/REVISION`。

## 查看状态

```bash
pm2 status study-reservation
pm2 logs study-reservation --lines 50
```

Nginx 修改前先备份文件，验证后重载：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

该账号已有上述两项 Nginx 管理权限。域名或其他系统级配置调整按学校服务器管理流程处理。

## 初始化另一个环境

使用 Node.js 22.13 以上、Git、PM2 以及 Bash/flock。部署目录默认 `~/study-room`，可用 `STUDY_DEPLOY_ROOT` 指定。

克隆仓库到部署目录下的 `repository`，复制 `local/initial-accounts.example.json` 到 `shared/data/initial-accounts.json` 后填写初始账号。`shared/runtime.json` 示例：

```json
{
  "STUDY_PORT": "3041",
  "STUDY_ORIGIN": "https://your-school-domain.example",
  "STUDY_BASE_PATH": "/study/",
  "STUDY_DATA_DIR": "/home/your-user/study-room/shared/data"
}
```

原站点来源必须精确匹配域名、协议和端口。HTTPS 下会话 Cookie 使用 Secure，并限定在网站子路径内。不要直接将数据目录、初始化文件或私钥放到网页静态目录中。
