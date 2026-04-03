# EOTrans - 在线文件传输工具

基于 WebRTC 技术的点对点文件传输工具，无需服务器，端到端加密传输。

## 功能特点

- 📤 **发送文件**：选择本地文件，生成8位随机数字码
- 📥 **接收文件**：输入发送者的8位数字码即可建立连接
- 🔒 **端到端加密**：P2P直连，数据不经过第三方服务器
- 📁 **多文件支持**：支持同时传输多个文件
- 📂 **文件夹传输**：支持直接发送整个文件夹
- 📦 **自动打包**：多文件自动打包成ZIP下载
- ✅ **接收确认**：接收方可预览文件列表后确认接收
- 📊 **实时速度**：传输过程中显示实时速度
- 🚫 **取消传输**：发送方可随时取消传输
- 📱 **拖拽上传**：支持拖拽文件到上传区域
- ⚡ **文件限制**：单个文件最大 25MB
- 🌐 **纯前端**：基于 EdgeOnePage，无需后端服务

## 使用方法

### 发送文件

1. 点击"发送文件"按钮
2. 选择要传输的文件（支持点击、拖拽或选择文件夹）
3. 系统生成8位数字码，显示在页面上
4. 将这8位数字告诉接收者
5. 等待接收者确认，文件自动传输

### 接收文件

1. 点击"接收文件"按钮
2. 输入发送者提供的8位数字码
3. 查看文件列表，点击"确认接收"
4. 等待传输完成，文件自动下载

## 技术栈

- **WebRTC**：RTCPeerConnection + RTCDataChannel
- **信令机制**：基于 LocalStorage + BroadcastChannel
- **STUN 服务器**：使用 Google 公共 STUN 服务器
- **ZIP 打包**：使用 JSZip 库
- **前端**：纯 HTML/CSS/JavaScript，无框架依赖

## 项目结构

```
EOTrans/
├── index.html      # 主页面
├── app.js          # WebRTC 逻辑和文件传输
├── package.json    # EdgeOnePage 配置
├── install.sh      # 安装/构建脚本
├── build_static.py # 构建脚本
├── requirements.txt # Python 依赖
└── README.md       # 项目说明
```

## 部署到 EdgeOnePage

1. 克隆仓库
```bash
git clone https://github.com/linfon18/EOTrans.git
cd EOTrans
```

2. 运行安装脚本
```bash
bash install.sh install
```

3. 构建静态文件
```bash
bash install.sh build
```

4. 部署到 EdgeOnePage

## 交流群

💬 **EOTrans交流群**：1061614618

点击链接加入：https://qm.qq.com/q/BekqLZayn6

## 许可证

MIT License

---

Made with ❤️ by MCZLF Studio _ Loft Games
