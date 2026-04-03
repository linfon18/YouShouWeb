// EOTrans - WebRTC P2P File Transfer with multi-file and folder support
const CONFIG = {
    MAX_FILE_SIZE: 500 * 1024 * 1024,
    CHUNK_SIZE: 16384,
    ICE_SERVERS: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// 简单的 ZIP 打包类
class SimpleZip {
    constructor() {
        this.files = [];
    }

    addFile(name, content) {
        this.files.push({ name, content });
    }

    async generate() {
        // 使用 JSZip 库，如果没有则使用简化版
        if (typeof JSZip !== 'undefined') {
            const zip = new JSZip();
            this.files.forEach(f => zip.file(f.name, f.content));
            return await zip.generateAsync({ type: 'blob' });
        }
        // 简化版：直接返回第一个文件（如果没有JSZip）
        return this.files[0]?.content;
    }
}

// 信令管理器
class SignalingManager {
    constructor() {
        this.code = null;
        this.role = null;
        this.onMessage = null;
        this.broadcastChannel = null;
        this.storageKey = null;
    }

    static generateCode() {
        return Math.floor(10000000 + Math.random() * 90000000).toString();
    }

    initBroadcastChannel(code) {
        try {
            this.broadcastChannel = new BroadcastChannel(`eotrans_${code}`);
            this.broadcastChannel.onmessage = (event) => {
                if (this.onMessage) this.onMessage(event.data);
            };
        } catch (e) {}
    }

    async initSender(code) {
        this.code = code;
        this.role = 'sender';
        this.storageKey = `eotrans_signal_${code}`;
        this.initBroadcastChannel(code);
        this.startPolling();
    }

    async initReceiver(code) {
        this.code = code;
        this.role = 'receiver';
        this.storageKey = `eotrans_signal_${code}`;
        this.initBroadcastChannel(code);
        this.startPolling();
    }

    send(message) {
        message.timestamp = Date.now();
        message.code = this.code;
        message.role = this.role;
        
        if (message.candidate && typeof message.candidate === 'object') {
            message.candidate = {
                candidate: message.candidate.candidate,
                sdpMid: message.candidate.sdpMid,
                sdpMLineIndex: message.candidate.sdpMLineIndex
            };
        }
        
        const key = `${this.storageKey}_${message.type}`;
        localStorage.setItem(key, JSON.stringify(message));
        
        if (this.broadcastChannel) {
            this.broadcastChannel.postMessage(message);
        }
        
        window.dispatchEvent(new StorageEvent('storage', {
            key: key,
            newValue: JSON.stringify(message)
        }));
    }

    listen(callback) {
        this.onMessage = callback;
        
        window.addEventListener('storage', (e) => {
            if (e.key && e.key.startsWith(`eotrans_signal_${this.code}`)) {
                try {
                    const data = JSON.parse(e.newValue);
                    if (this.onMessage) this.onMessage(data);
                } catch (err) {}
            }
        });
    }

    startPolling() {
        const checkKeys = ['offer', 'answer', 'candidate'];
        const lastValues = {};
        
        setInterval(() => {
            checkKeys.forEach(type => {
                const key = `${this.storageKey}_${type}`;
                const value = localStorage.getItem(key);
                
                if (value && value !== lastValues[type]) {
                    lastValues[type] = value;
                    try {
                        const data = JSON.parse(value);
                        const isFromOther = (this.role === 'sender' && data.role === 'receiver') ||
                                           (this.role === 'receiver' && data.role === 'sender');
                        if (isFromOther && this.onMessage) {
                            this.onMessage(data);
                        }
                    } catch (err) {}
                }
            });
        }, 300);
    }

    cleanup() {
        if (this.broadcastChannel) this.broadcastChannel.close();
        ['offer', 'answer', 'candidate'].forEach(type => {
            localStorage.removeItem(`${this.storageKey}_${type}`);
        });
    }
}

// WebRTC 连接管理
class P2PConnection {
    constructor() {
        this.pc = null;
        this.dataChannel = null;
        this.signaling = new SignalingManager();
        this.onFileReceived = null;
        this.onProgress = null;
        this.onStatusChange = null;
        this.fileBuffer = [];
        this.expectedSize = 0;
        this.receivedSize = 0;
        this.fileInfo = null;
        this.pendingCandidates = [];
        this.isCancelled = false;
        this.receivedFiles = [];
    }

    updateStatus(status, type = 'info') {
        if (this.onStatusChange) this.onStatusChange(status, type);
    }

    createPeerConnection() {
        this.pc = new RTCPeerConnection({ iceServers: CONFIG.ICE_SERVERS });

        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.signaling.send({
                    type: 'candidate',
                    role: this.signaling.role,
                    candidate: event.candidate
                });
            }
        };

        this.pc.onconnectionstatechange = () => {
            if (this.pc.connectionState === 'connected') {
                this.updateStatus('P2P 连接成功！', 'success');
            }
        };

        return this.pc;
    }

    async initSender() {
        this.createPeerConnection();
        
        const channel = this.pc.createDataChannel('fileTransfer', {
            ordered: true,
            maxRetransmits: 30
        });
        this.setupDataChannel(channel);

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);

        this.signaling.send({
            type: 'offer',
            role: 'sender',
            sdp: offer.sdp
        });

        this.signaling.listen((data) => {
            if (data.type === 'answer' && !this.pc.currentRemoteDescription) {
                this.pc.setRemoteDescription(new RTCSessionDescription({
                    type: 'answer',
                    sdp: data.sdp
                })).then(() => this.processPendingCandidates());
            }
            if (data.type === 'candidate') this.handleCandidate(data.candidate);
        });
        
        // 检查已有 answer
        const answerKey = `${this.signaling.storageKey}_answer`;
        const existingAnswer = localStorage.getItem(answerKey);
        if (existingAnswer) {
            const data = JSON.parse(existingAnswer);
            if (data.type === 'answer' && data.role === 'receiver') {
                this.pc.setRemoteDescription(new RTCSessionDescription({
                    type: 'answer',
                    sdp: data.sdp
                })).then(() => this.processPendingCandidates());
            }
        }
    }

    async initReceiver() {
        this.createPeerConnection();

        this.pc.ondatachannel = (event) => {
            console.log('收到数据通道');
            this.setupDataChannel(event.channel);
        };

        const offerKey = `${this.signaling.storageKey}_offer`;
        const existingOffer = localStorage.getItem(offerKey);
        
        this.signaling.listen((data) => this.handleSignalingData(data));
        
        if (existingOffer) {
            const data = JSON.parse(existingOffer);
            if (data.type === 'offer' && data.role === 'sender') {
                this.handleSignalingData(data);
            }
        }
    }

    handleSignalingData(data) {
        if (data.type === 'offer' && !this.pc.currentRemoteDescription) {
            this.pc.setRemoteDescription(new RTCSessionDescription({
                type: 'offer',
                sdp: data.sdp
            })).then(() => this.pc.createAnswer())
              .then((answer) => this.pc.setLocalDescription(answer))
              .then(() => {
                  this.signaling.send({
                      type: 'answer',
                      role: 'receiver',
                      sdp: this.pc.localDescription.sdp
                  });
                  this.processPendingCandidates();
              });
        }
        if (data.type === 'candidate') this.handleCandidate(data.candidate);
    }

    handleCandidate(candidate) {
        if (this.pc.currentRemoteDescription) {
            this.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        } else {
            this.pendingCandidates.push(candidate);
        }
    }

    processPendingCandidates() {
        this.pendingCandidates.forEach(c => {
            this.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        });
        this.pendingCandidates = [];
    }

    setupDataChannel(channel) {
        this.dataChannel = channel;
        
        channel.onopen = () => {
            console.log('数据通道已打开');
            this.updateStatus('数据通道已建立', 'success');
        };
        
        channel.onclose = () => {
            console.log('数据通道已关闭');
        };
        
        channel.onerror = (err) => {
            console.error('数据通道错误:', err);
        };
        
        channel.onmessage = (event) => this.handleMessage(event.data);
    }

    handleMessage(data) {
        if (typeof data === 'string') {
            const message = JSON.parse(data);
            console.log('收到消息:', message.type);
            
            if (message.type === 'file-list') {
                // 收到文件列表，等待用户确认
                this.pendingFileList = message.files;
                if (this.onFileListReceived) {
                    this.onFileListReceived(message.files);
                }
            } else if (message.type === 'transfer-confirm') {
                // 接收方确认开始传输
                console.log('收到确认消息，触发回调');
                if (this.onTransferConfirmed) {
                    this.onTransferConfirmed();
                }
            } else if (message.type === 'transfer-reject') {
                // 接收方拒绝传输
                if (this.onTransferRejected) {
                    this.onTransferRejected();
                }
            } else if (message.type === 'file-start') {
                this.fileInfo = message.fileInfo;
                this.expectedSize = message.fileInfo.size;
                this.receivedSize = 0;
                this.fileBuffer = [];
                this.lastReceiveTime = Date.now();
                this.lastReceivedSize = 0;
                this.updateStatus(`接收: ${message.fileInfo.name}`, 'info');
            } else if (message.type === 'file-complete') {
                this.assembleFile();
            } else if (message.type === 'transfer-complete') {
                this.downloadAllFiles();
            }
        } else {
            this.fileBuffer.push(data);
            this.receivedSize += data.byteLength;
            const progress = Math.round((this.receivedSize / this.expectedSize) * 100);
            
            // 计算接收速度
            const now = Date.now();
            const timeDiff = now - this.lastReceiveTime;
            if (timeDiff >= 1000) {
                const bytesDiff = this.receivedSize - this.lastReceivedSize;
                const speed = bytesDiff / (timeDiff / 1000);
                if (this.onSpeedUpdate) this.onSpeedUpdate(speed);
                this.lastReceiveTime = now;
                this.lastReceivedSize = this.receivedSize;
            }
            
            if (this.onProgress) this.onProgress(progress);
        }
    }
    
    confirmTransfer() {
        const sendConfirm = () => {
            if (this.dataChannel && this.dataChannel.readyState === 'open') {
                this.dataChannel.send(JSON.stringify({ type: 'transfer-confirm' }));
                console.log('发送确认消息成功');
                return true;
            }
            return false;
        };
        
        if (!sendConfirm()) {
            console.log('数据通道未就绪，等待后重试...');
            // 等待数据通道就绪后重试
            const checkInterval = setInterval(() => {
                if (sendConfirm()) {
                    clearInterval(checkInterval);
                }
            }, 100);
            // 5秒后超时
            setTimeout(() => clearInterval(checkInterval), 5000);
        }
    }
    
    rejectTransfer() {
        const sendReject = () => {
            if (this.dataChannel && this.dataChannel.readyState === 'open') {
                this.dataChannel.send(JSON.stringify({ type: 'transfer-reject' }));
                return true;
            }
            return false;
        };
        
        if (!sendReject()) {
            const checkInterval = setInterval(() => {
                if (sendReject()) {
                    clearInterval(checkInterval);
                }
            }, 100);
            setTimeout(() => clearInterval(checkInterval), 5000);
        }
    }

    assembleFile() {
        const blob = new Blob(this.fileBuffer);
        
        // 校验文件大小
        if (blob.size !== this.expectedSize) {
            console.error(`文件大小不匹配: 期望 ${this.expectedSize}, 实际 ${blob.size}`);
            this.updateStatus(`文件接收错误: ${this.fileInfo.name}`, 'error');
            return;
        }
        
        this.receivedFiles.push({
            name: this.fileInfo.name,
            blob: blob,
            size: this.expectedSize
        });
        
        if (this.onFileReceived) {
            this.onFileReceived(this.fileInfo);
        }
    }

    async downloadAllFiles() {
        if (this.receivedFiles.length === 0) return;
        
        if (this.receivedFiles.length === 1) {
            // 单文件直接下载
            const file = this.receivedFiles[0];
            const url = URL.createObjectURL(file.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            // 多文件打包成 ZIP
            this.updateStatus('正在打包文件...', 'info');
            try {
                const zipBlob = await this.createZip(this.receivedFiles);
                const url = URL.createObjectURL(zipBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `received_files_${Date.now()}.zip`;
                a.click();
                URL.revokeObjectURL(url);
                this.updateStatus('ZIP 打包完成！', 'success');
            } catch (e) {
                // 如果没有 ZIP 支持，逐个下载
                this.receivedFiles.forEach(file => {
                    const url = URL.createObjectURL(file.blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = file.name;
                    a.click();
                    URL.revokeObjectURL(url);
                });
            }
        }
        this.receivedFiles = [];
    }

    async createZip(files) {
        // 使用 JSZip 库创建标准 ZIP 文件
        const zip = new JSZip();
        
        for (const file of files) {
            const arrayBuffer = await file.blob.arrayBuffer();
            zip.file(file.name, arrayBuffer);
        }
        
        return await zip.generateAsync({ type: 'blob' });
    }

    async sendFiles(files, onProgress) {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            throw new Error('数据通道未就绪');
        }

        this.pendingFiles = files;
        
        // 发送文件列表
        const fileList = files.map(f => ({
            name: f.name,
            size: f.size,
            type: f.type
        }));
        
        this.dataChannel.send(JSON.stringify({
            type: 'file-list',
            files: fileList
        }));
        
        // 等待接收方确认
        return new Promise((resolve, reject) => {
            const originalOnTransferConfirmed = this.onTransferConfirmed;
            const originalOnTransferRejected = this.onTransferRejected;
            
            this.onTransferConfirmed = () => {
                // 调用UI设置的回调
                if (originalOnTransferConfirmed) originalOnTransferConfirmed();
                // 开始传输
                this.startFileTransfer(files, onProgress).then(resolve).catch(reject);
            };
            
            this.onTransferRejected = () => {
                if (originalOnTransferRejected) originalOnTransferRejected();
                reject(new Error('接收方拒绝了传输'));
            };
        });
    }
    
    async startFileTransfer(files, onProgress, onSpeedUpdate) {
        const totalSize = files.reduce((sum, f) => sum + f.size, 0);
        let sentSize = 0;
        let currentSpeed = 0;

        for (let i = 0; i < files.length; i++) {
            if (this.isCancelled) break;
            
            const file = files[i];
            await this.sendSingleFile(file, (fileProgress) => {
                const overallProgress = Math.round(((sentSize + file.size * fileProgress / 100) / totalSize) * 100);
                if (onProgress) onProgress(overallProgress, i + 1, files.length, currentSpeed);
            }, (speed) => {
                currentSpeed = speed;
                const overallProgress = Math.round(((sentSize + file.size * 100 / 100) / totalSize) * 100);
                if (onSpeedUpdate) onSpeedUpdate(speed);
            });
            sentSize += file.size;
        }

        if (!this.isCancelled) {
            this.dataChannel.send(JSON.stringify({ type: 'transfer-complete' }));
        }
    }

    async sendSingleFile(file, onFileProgress, onSpeedUpdate) {
        // 发送文件元数据
        this.dataChannel.send(JSON.stringify({
            type: 'file-start',
            fileInfo: { name: file.name, size: file.size, type: file.type }
        }));

        // 等待一小段时间确保元数据被处理
        await new Promise(r => setTimeout(r, 50));

        const fileReader = new FileReader();
        let offset = 0;
        const chunkSize = 8192;
        let lastTime = Date.now();
        let lastOffset = 0;

        return new Promise((resolve) => {
            const sendChunk = () => {
                if (this.isCancelled) {
                    resolve();
                    return;
                }

                const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
                fileReader.readAsArrayBuffer(slice);
            };

            fileReader.onload = (e) => {
                const buffer = e.target.result;
                
                const trySend = async () => {
                    if (this.dataChannel.readyState !== 'open') {
                        resolve();
                        return;
                    }
                    
                    // 等待缓冲区清空
                    while (this.dataChannel.bufferedAmount > chunkSize * 16) {
                        await new Promise(r => setTimeout(r, 10));
                        if (this.isCancelled) {
                            resolve();
                            return;
                        }
                    }
                    
                    this.dataChannel.send(buffer);
                    offset += buffer.byteLength;
                    
                    const progress = Math.round((offset / file.size) * 100);
                    
                    // 计算速度
                    const now = Date.now();
                    const timeDiff = now - lastTime;
                    if (timeDiff >= 1000) { // 每秒更新一次速度
                        const bytesDiff = offset - lastOffset;
                        const speed = bytesDiff / (timeDiff / 1000);
                        if (onSpeedUpdate) onSpeedUpdate(speed);
                        lastTime = now;
                        lastOffset = offset;
                    }
                    
                    if (onFileProgress) onFileProgress(progress);

                    if (offset < file.size) {
                        sendChunk();
                    } else {
                        // 等待缓冲区清空后发送完成标记
                        while (this.dataChannel.bufferedAmount > 0) {
                            await new Promise(r => setTimeout(r, 10));
                        }
                        this.dataChannel.send(JSON.stringify({ type: 'file-complete' }));
                        resolve();
                    }
                };
                
                trySend();
            };

            sendChunk();
        });
    }

    cancel() {
        this.isCancelled = true;
        this.close();
    }

    close() {
        this.signaling.cleanup();
        if (this.dataChannel) this.dataChannel.close();
        if (this.pc) this.pc.close();
    }
}

// UI 控制器
let currentConnection = null;
let selectedFiles = [];
let isCancelled = false;

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
}

function showSend() {
    showSection('sendSection');
    resetSendUI();
}

function showReceive() {
    showSection('receiveSection');
    resetReceiveUI();
}

function goBack() {
    if (currentConnection) {
        currentConnection.close();
        currentConnection = null;
    }
    showSection('mainSection');
}

function resetSendUI() {
    document.getElementById('fileSelectArea').classList.remove('hidden');
    document.getElementById('waitingArea').classList.add('hidden');
    document.getElementById('sendingArea').classList.add('hidden');
    document.getElementById('fileInput').value = '';
    selectedFiles = [];
    isCancelled = false;
}

function resetReceiveUI() {
    document.getElementById('codeInputArea').classList.remove('hidden');
    document.getElementById('confirmArea').classList.add('hidden');
    document.getElementById('receivingArea').classList.add('hidden');
    document.getElementById('receiveCode').value = '';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatSpeed(bytesPerSecond) {
    if (bytesPerSecond < 1024) return bytesPerSecond.toFixed(0) + ' B/s';
    if (bytesPerSecond < 1024 * 1024) return (bytesPerSecond / 1024).toFixed(1) + ' KB/s';
    return (bytesPerSecond / (1024 * 1024)).toFixed(2) + ' MB/s';
}

function selectFiles() {
    const input = document.getElementById('fileInput');
    input.removeAttribute('webkitdirectory');
    input.removeAttribute('directory');
    input.click();
}

function selectFolder() {
    const input = document.getElementById('fileInput');
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.click();
}

function cancelSend() {
    isCancelled = true;
    if (currentConnection) {
        currentConnection.cancel();
    }
    resetSendUI();
}

// 文件选择处理
document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > CONFIG.MAX_FILE_SIZE) {
        alert('总文件大小超过500MB限制');
        return;
    }

    selectedFiles = files;

    const code = SignalingManager.generateCode();
    
    document.getElementById('fileSelectArea').classList.add('hidden');
    document.getElementById('waitingArea').classList.remove('hidden');
    
    const fileListHtml = files.slice(0, 5).map(f => `<p>• ${f.name} (${formatFileSize(f.size)})</p>`).join('');
    const moreFiles = files.length > 5 ? `<p>... 还有 ${files.length - 5} 个文件</p>` : '';
    
    document.getElementById('fileInfo').innerHTML = `
        <p><strong>共 ${files.length} 个文件</strong></p>
        <p><strong>总大小:</strong> ${formatFileSize(totalSize)}</p>
        <div style="margin-top: 10px; text-align: left; font-size: 0.9em;">
            ${fileListHtml}${moreFiles}
        </div>
    `;
    
    document.getElementById('sendCode').textContent = code;

    try {
        currentConnection = new P2PConnection();
        await currentConnection.signaling.initSender(code);
        await currentConnection.initSender();

        const checkAndSend = setInterval(() => {
            if (isCancelled) {
                clearInterval(checkAndSend);
                return;
            }
            
            if (currentConnection.dataChannel && 
                currentConnection.dataChannel.readyState === 'open') {
                clearInterval(checkAndSend);
                
                // 更新状态为等待接收方确认
                document.getElementById('waitingArea').querySelector('.status').innerHTML = `
                    <span class="spinner"></span>
                    等待接收方确认...
                `;
                
                // 先设置回调，再调用 sendFiles
                currentConnection.onTransferConfirmed = () => {
                    document.getElementById('waitingArea').classList.add('hidden');
                    document.getElementById('sendingArea').classList.remove('hidden');
                    
                    document.getElementById('sendingFileInfo').innerHTML = `
                        <p><strong>正在发送 ${files.length} 个文件</strong></p>
                        <p><strong>总大小:</strong> ${formatFileSize(totalSize)}</p>
                    `;
                };
                
                currentConnection.onTransferRejected = () => {
                    alert('接收方拒绝了传输');
                    resetSendUI();
                };
                
                currentConnection.onProgress = (progress, current, total, speed) => {
                    document.getElementById('sendProgress').style.width = progress + '%';
                    document.getElementById('sendStatus').textContent = 
                        total > 1 ? `传输中... ${progress}% (${current}/${total})` : `传输中... ${progress}%`;
                    if (speed) document.getElementById('sendSpeed').textContent = formatSpeed(speed);
                };

                currentConnection.onStatusChange = (status, type) => {
                    const statusEl = document.getElementById('sendStatus');
                    statusEl.textContent = status;
                    statusEl.className = 'status ' + type;
                };

                currentConnection.sendFiles(files, (progress, current, total, speed) => {
                    document.getElementById('sendProgress').style.width = progress + '%';
                    document.getElementById('sendStatus').textContent = 
                        total > 1 ? `传输中... ${progress}% (${current}/${total})` : `传输中... ${progress}%`;
                    if (speed) document.getElementById('sendSpeed').textContent = formatSpeed(speed);
                }, (speed) => {
                    document.getElementById('sendSpeed').textContent = formatSpeed(speed);
                }).then(() => {
                    document.getElementById('sendStatus').textContent = '传输完成！';
                    document.getElementById('sendStatus').className = 'status success';
                }).catch(err => {
                    if (!isCancelled) {
                        console.error('发送文件失败:', err);
                        alert('发送失败: ' + err.message);
                        resetSendUI();
                    }
                });
            }
        }, 500);
    } catch (err) {
        console.error('连接失败:', err);
        alert('连接失败: ' + err.message);
        resetSendUI();
    }
});

// 拖拽上传
const fileLabel = document.getElementById('fileLabel');

fileLabel.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileLabel.classList.add('dragover');
});

fileLabel.addEventListener('dragleave', () => {
    fileLabel.classList.remove('dragover');
});

fileLabel.addEventListener('drop', (e) => {
    e.preventDefault();
    fileLabel.classList.remove('dragover');
    
    const items = e.dataTransfer.items;
    const files = [];
    
    function traverseFileTree(item, path = '') {
        return new Promise((resolve) => {
            if (item.isFile) {
                item.file((file) => {
                    file.relativePath = path + file.name;
                    files.push(file);
                    resolve();
                });
            } else if (item.isDirectory) {
                const dirReader = item.createReader();
                dirReader.readEntries((entries) => {
                    Promise.all(entries.map(entry => traverseFileTree(entry, path + item.name + '/')))
                        .then(() => resolve());
                });
            } else {
                resolve();
            }
        });
    }
    
    if (items && items.length > 0) {
        Promise.all(Array.from(items).map(item => traverseFileTree(item.webkitGetAsEntry())))
            .then(() => {
                if (files.length > 0) {
                    const dataTransfer = new DataTransfer();
                    files.forEach(f => dataTransfer.items.add(f));
                    document.getElementById('fileInput').files = dataTransfer.files;
                    document.getElementById('fileInput').dispatchEvent(new Event('change'));
                }
            });
    }
});

// 接收文件
async function startReceive() {
    const code = document.getElementById('receiveCode').value;
    
    if (code.length !== 8) {
        alert('请输入8位数字');
        return;
    }

    document.getElementById('codeInputArea').classList.add('hidden');
    document.getElementById('receiveStatus').textContent = '正在连接...';

    currentConnection = new P2PConnection();
    
    let receivedCount = 0;
    
    currentConnection.onProgress = (progress) => {
        document.getElementById('receiveProgress').style.width = progress + '%';
        document.getElementById('receiveStatus').textContent = 
            receivedCount > 0 ? `接收中... ${progress}% (${receivedCount} 个文件)` : `接收中... ${progress}%`;
    };
    
    currentConnection.onSpeedUpdate = (speed) => {
        document.getElementById('receiveSpeed').textContent = formatSpeed(speed);
    };

    currentConnection.onStatusChange = (status, type) => {
        const statusEl = document.getElementById('receiveStatus');
        statusEl.textContent = status;
        statusEl.className = 'status ' + type;
    };

    currentConnection.onFileListReceived = (files) => {
        // 显示文件列表等待确认
        document.getElementById('confirmArea').classList.remove('hidden');
        
        const totalSize = files.reduce((sum, f) => sum + f.size, 0);
        const fileListHtml = files.map(f => 
            `<p>• ${f.name} <span style="color: #666;">(${formatFileSize(f.size)})</span></p>`
        ).join('');
        
        document.getElementById('confirmFileList').innerHTML = `
            <p><strong>共 ${files.length} 个文件，总大小 ${formatFileSize(totalSize)}</strong></p>
            <div style="margin-top: 10px; padding-left: 10px;">
                ${fileListHtml}
            </div>
        `;
    };

    currentConnection.onFileReceived = (fileInfo) => {
        receivedCount++;
        document.getElementById('receiveFileInfo').innerHTML = `
            <p><strong>已接收 ${receivedCount} 个文件</strong></p>
            <p><strong>最新:</strong> ${fileInfo.name}</p>
            <p><strong>大小:</strong> ${formatFileSize(fileInfo.size)}</p>
        `;
    };

    try {
        await currentConnection.signaling.initReceiver(code);
        await currentConnection.initReceiver();
    } catch (err) {
        console.error('接收失败:', err);
        alert('连接失败: ' + err.message);
        resetReceiveUI();
    }
}

// 确认接收
function confirmReceive() {
    if (currentConnection) {
        currentConnection.confirmTransfer();
        document.getElementById('confirmArea').classList.add('hidden');
        document.getElementById('receivingArea').classList.remove('hidden');
    }
}

// 拒绝接收
function rejectReceive() {
    if (currentConnection) {
        currentConnection.rejectTransfer();
        currentConnection.close();
        currentConnection = null;
    }
    resetReceiveUI();
    alert('已拒绝接收文件');
}

// 页面关闭时清理
window.addEventListener('beforeunload', () => {
    if (currentConnection) {
        currentConnection.close();
    }
});