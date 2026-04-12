(function () {
    'use strict';

    // ===== DOM 元素 =====
    var navbar = document.getElementById('navbar');
    var navLinks = document.getElementById('navLinks');
    var hamburger = document.getElementById('hamburger');
    var darkToggle = document.getElementById('darkToggle');
    var backToTop = document.getElementById('backToTop');
    var msgName = document.getElementById('msgName');
    var msgContent = document.getElementById('msgContent');
    var msgSubmit = document.getElementById('msgSubmit');
    var msgList = document.getElementById('msgList');

    // ===================================================================
    //  后处理：报告区域 (#reportContent)
    // ===================================================================
    function processReportContent() {
        var container = document.getElementById('reportContent');
        if (!container) return;

        // 收集所有顶层子节点
        var children = Array.prototype.slice.call(container.childNodes);

        // 识别章节标题的正则：
        // "一、xxx" "二、xxx" ... "十、xxx"
        // "第X章：xxx" "第X章 xxx"
        var chapterRe = /^(?:第[一二三四五六七八九十百]+章[：:\s]|(?:一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四|十五|十六|十七|十八|十九|二十)、)/;

        // 将节点分组为章节
        var chapters = []; // 每个元素: { titleNode: Element, bodyNodes: [Node] }
        var currentChapter = null;
        var preface = []; // 标题之前的节点（报告头部信息）

        for (var i = 0; i < children.length; i++) {
            var node = children[i];

            // 跳过空白文本节点
            if (node.nodeType === 3 && !node.textContent.trim()) continue;

            // 检查是否是章节标题 <p><strong>...</strong></p>
            if (node.nodeType === 1 && node.tagName === 'P') {
                var strongEl = node.querySelector('strong');
                if (strongEl && chapterRe.test(strongEl.textContent.trim())) {
                    // 这是一个新的章节标题
                    if (currentChapter) {
                        chapters.push(currentChapter);
                    }
                    currentChapter = { titleNode: node, bodyNodes: [] };
                    continue;
                }
            }

            if (currentChapter) {
                currentChapter.bodyNodes.push(node);
            } else {
                preface.push(node);
            }
        }
        // 别忘了最后一个章节
        if (currentChapter) {
            chapters.push(currentChapter);
        }

        // 清空容器
        container.innerHTML = '';

        // 先放入前言部分
        if (preface.length > 0) {
            var prefaceDiv = document.createElement('div');
            prefaceDiv.className = 'report-preface';
            for (var j = 0; j < preface.length; j++) {
                prefaceDiv.appendChild(preface[j]);
            }
            container.appendChild(prefaceDiv);
        }

        // 为每个章节创建折叠结构
        for (var c = 0; c < chapters.length; c++) {
            var ch = chapters[c];
            var chapterDiv = document.createElement('div');
            chapterDiv.className = 'report-chapter';

            // 章节标题栏
            var headerDiv = document.createElement('div');
            headerDiv.className = 'chapter-header';

            var numSpan = document.createElement('span');
            numSpan.className = 'chapter-number';
            // 提取章节编号
            var titleText = ch.titleNode.querySelector('strong').textContent.trim();
            var numMatch = titleText.match(/^(第[一二三四五六七八九十百]+章|一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四|十五|十六|十七|十八|十九|二十)/);
            numSpan.textContent = numMatch ? numMatch[1].replace('第', '').replace('章', '') : (c + 1);

            var titleSpan = document.createElement('span');
            titleSpan.className = 'chapter-title';
            titleSpan.textContent = titleText;

            var toggleSpan = document.createElement('span');
            toggleSpan.className = 'chapter-toggle';
            toggleSpan.textContent = '\u25BC'; // ▼

            headerDiv.appendChild(numSpan);
            headerDiv.appendChild(titleSpan);
            headerDiv.appendChild(toggleSpan);

            // 章节内容
            var bodyDiv = document.createElement('div');
            bodyDiv.className = 'chapter-body';
            for (var b = 0; b < ch.bodyNodes.length; b++) {
                bodyDiv.appendChild(ch.bodyNodes[b]);
            }

            chapterDiv.appendChild(headerDiv);
            chapterDiv.appendChild(bodyDiv);
            container.appendChild(chapterDiv);

            // 折叠逻辑
            (function (header, body, toggle, isFirst) {
                if (!isFirst) {
                    // 默认折叠（除了第一章）
                    body.classList.add('collapsed');
                    toggle.classList.add('collapsed');
                } else {
                    // 第一章展开，设置 max-height
                    body.style.maxHeight = body.scrollHeight + 'px';
                }
                header.addEventListener('click', function () {
                    if (body.classList.contains('collapsed')) {
                        body.classList.remove('collapsed');
                        body.style.maxHeight = body.scrollHeight + 'px';
                        toggle.classList.remove('collapsed');
                    } else {
                        body.style.maxHeight = body.scrollHeight + 'px';
                        // 强制 reflow
                        body.offsetHeight;
                        body.classList.add('collapsed');
                        toggle.classList.add('collapsed');
                    }
                });
            })(headerDiv, bodyDiv, toggleSpan, c === 0);
        }

        // 为章节标题添加锚点ID
        var allReportChapters = container.querySelectorAll('.report-chapter');
        for (var k = 0; k < allReportChapters.length; k++) {
            var chTitle = allReportChapters[k].querySelector('.chapter-title');
            var chText = chTitle.textContent.trim();
            var anchorId = 'report-' + k + '-' + chText.substring(0, 10).replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '');
            allReportChapters[k].id = anchorId;
        }
    }

    // ===================================================================
    //  后处理：CP区域 (#cpContent)
    // ===================================================================
    function processCPContent() {
        var container = document.getElementById('cpContent');
        if (!container) return;

        var children = Array.prototype.slice.call(container.childNodes);

        // CP章节标题正则："第X章：xxx" 或 "第X章 xxx"
        var cpChapterRe = /^第[一二三四五六七八九十百]+章[：:\s]/;

        var chapters = [];
        var currentChapter = null;
        var preface = [];

        for (var i = 0; i < children.length; i++) {
            var node = children[i];
            if (node.nodeType === 3 && !node.textContent.trim()) continue;

            if (node.nodeType === 1 && node.tagName === 'P') {
                var strongEl = node.querySelector('strong');
                if (strongEl && cpChapterRe.test(strongEl.textContent.trim())) {
                    if (currentChapter) {
                        chapters.push(currentChapter);
                    }
                    currentChapter = { titleNode: node, bodyNodes: [] };
                    continue;
                }
            }

            if (currentChapter) {
                currentChapter.bodyNodes.push(node);
            } else {
                preface.push(node);
            }
        }
        if (currentChapter) {
            chapters.push(currentChapter);
        }

        container.innerHTML = '';

        // 前言
        if (preface.length > 0) {
            var prefaceDiv = document.createElement('div');
            prefaceDiv.className = 'cp-preface';
            for (var j = 0; j < preface.length; j++) {
                prefaceDiv.appendChild(preface[j]);
            }
            container.appendChild(prefaceDiv);
        }

        // 为每个CP章节创建折叠结构
        for (var c = 0; c < chapters.length; c++) {
            var ch = chapters[c];
            var chapterDiv = document.createElement('div');
            chapterDiv.className = 'cp-chapter';

            var headerDiv = document.createElement('div');
            headerDiv.className = 'chapter-header';

            var numSpan = document.createElement('span');
            numSpan.className = 'chapter-number';
            var titleText = ch.titleNode.querySelector('strong').textContent.trim();
            var numMatch = titleText.match(/^(第[一二三四五六七八九十百]+章)/);
            numSpan.textContent = numMatch ? numMatch[1].replace('第', '').replace('章', '') : (c + 1);

            var titleSpan = document.createElement('span');
            titleSpan.className = 'chapter-title';
            titleSpan.textContent = titleText;

            var toggleSpan = document.createElement('span');
            toggleSpan.className = 'chapter-toggle';
            toggleSpan.textContent = '\u25BC';

            headerDiv.appendChild(numSpan);
            headerDiv.appendChild(titleSpan);
            headerDiv.appendChild(toggleSpan);

            var bodyDiv = document.createElement('div');
            bodyDiv.className = 'chapter-body';
            for (var b = 0; b < ch.bodyNodes.length; b++) {
                bodyDiv.appendChild(ch.bodyNodes[b]);
            }

            chapterDiv.appendChild(headerDiv);
            chapterDiv.appendChild(bodyDiv);
            container.appendChild(chapterDiv);

            // 折叠逻辑
            (function (header, body, toggle, isFirst) {
                if (!isFirst) {
                    body.classList.add('collapsed');
                    toggle.classList.add('collapsed');
                } else {
                    body.style.maxHeight = body.scrollHeight + 'px';
                }
                header.addEventListener('click', function () {
                    if (body.classList.contains('collapsed')) {
                        body.classList.remove('collapsed');
                        body.style.maxHeight = body.scrollHeight + 'px';
                        toggle.classList.remove('collapsed');
                    } else {
                        body.style.maxHeight = body.scrollHeight + 'px';
                        body.offsetHeight;
                        body.classList.add('collapsed');
                        toggle.classList.add('collapsed');
                    }
                });
            })(headerDiv, bodyDiv, toggleSpan, c === 0);
        }

        // 为CP章节标题添加锚点ID
        var allCPChapters = container.querySelectorAll('.cp-chapter');
        for (var k = 0; k < allCPChapters.length; k++) {
            var chTitle = allCPChapters[k].querySelector('.chapter-title');
            var chText = chTitle.textContent.trim();
            var anchorId = 'cp-' + k + '-' + chText.substring(0, 10).replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '');
            allCPChapters[k].id = anchorId;
        }
    }

    // ===================================================================
    //  通用后处理
    // ===================================================================

    // 1. 表格响应式包装
    function wrapTables() {
        var targets = [document.getElementById('reportContent'), document.getElementById('cpContent')];
        targets.forEach(function (container) {
            if (!container) return;
            var tables = container.querySelectorAll('table');
            for (var i = 0; i < tables.length; i++) {
                var table = tables[i];
                if (table.parentElement && table.parentElement.classList.contains('table-wrap')) continue;
                var wrap = document.createElement('div');
                wrap.className = 'table-wrap';
                table.parentNode.insertBefore(wrap, table);
                wrap.appendChild(table);
            }
        });
    }

    // 2. 篇章标签着色
    function colorTags() {
        var tagNames = ['上古篇', '中古篇', '现代篇', '心锁事件', '日常'];
        var cpContent = document.getElementById('cpContent');
        if (!cpContent) return;

        // 找到所有 <strong> 包含篇章标签名的元素
        tagNames.forEach(function (tagName) {
            var strongs = cpContent.querySelectorAll('strong');
            for (var i = 0; i < strongs.length; i++) {
                var s = strongs[i];
                if (s.textContent.trim() === tagName && s.children.length === 0 && s.parentElement.tagName !== 'TH') {
                    s.classList.add('tag-' + tagName);
                }
            }
        });
    }

    // 3. 星级着色
    function colorStars() {
        var cpContent = document.getElementById('cpContent');
        if (!cpContent) return;

        var strongs = cpContent.querySelectorAll('strong');
        for (var i = 0; i < strongs.length; i++) {
            var s = strongs[i];
            var text = s.textContent.trim();
            var starMatch = text.match(/^(★+)\s*$/);
            if (starMatch) {
                var count = starMatch[1].length;
                if (count >= 1 && count <= 5) {
                    s.classList.add('stars-' + count);
                }
            }
        }
    }

    // 4. 引用块样式增强（确保所有 blockquote 有左边框）
    function enhanceBlockquotes() {
        var targets = [document.getElementById('reportContent'), document.getElementById('cpContent')];
        targets.forEach(function (container) {
            if (!container) return;
            var bqs = container.querySelectorAll('blockquote');
            for (var i = 0; i < bqs.length; i++) {
                bqs[i].classList.add('styled-blockquote');
            }
        });
    }

    // ===================================================================
    //  页面加载时执行后处理
    // ===================================================================
    document.addEventListener('DOMContentLoaded', function () {
        processReportContent();
        processCPContent();
        wrapTables();
        colorTags();
        colorStars();
        enhanceBlockquotes();

        // 初始化导航高亮
        updateActiveNav();
        updateBackToTop();
    });

    // ===================================================================
    //  导航栏滚动高亮
    // ===================================================================
    var sections = document.querySelectorAll('.section');
    var navItems = document.querySelectorAll('.nav-links a');

    function updateActiveNav() {
        var scrollPos = window.scrollY + 100;
        sections.forEach(function (section) {
            var top = section.offsetTop;
            var height = section.offsetHeight;
            var id = section.getAttribute('id');
            if (scrollPos >= top && scrollPos < top + height) {
                navItems.forEach(function (item) {
                    item.classList.remove('active');
                    if (item.getAttribute('href') === '#' + id) {
                        item.classList.add('active');
                    }
                });
            }
        });
    }

    // ===== 回到顶部按钮显示/隐藏 =====
    function updateBackToTop() {
        if (window.scrollY > 400) {
            backToTop.classList.add('show');
        } else {
            backToTop.classList.remove('show');
        }
    }

    // ===== 滚动事件监听 =====
    window.addEventListener('scroll', function () {
        updateActiveNav();
        updateBackToTop();
    });

    // ===== 平滑滚动（导航链接） =====
    navItems.forEach(function (item) {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            var targetId = this.getAttribute('href').substring(1);
            var target = document.getElementById(targetId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
            navLinks.classList.remove('open');
            hamburger.classList.remove('open');
        });
    });

    // ===== 回到顶部 =====
    backToTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ===== 移动端汉堡菜单 =====
    hamburger.addEventListener('click', function () {
        this.classList.toggle('open');
        navLinks.classList.toggle('open');
    });

    document.addEventListener('click', function (e) {
        if (!hamburger.contains(e.target) && !navLinks.contains(e.target)) {
            hamburger.classList.remove('open');
            navLinks.classList.remove('open');
        }
    });

    // ===== 暗色模式切换 =====
    var STORAGE_KEY_DARK = 'youshou_dark_mode';

    function isDarkMode() {
        return document.documentElement.classList.contains('dark-mode');
    }

    function setDarkMode(enable) {
        if (enable) {
            document.documentElement.classList.add('dark-mode');
        } else {
            document.documentElement.classList.remove('dark-mode');
        }
        try {
            localStorage.setItem(STORAGE_KEY_DARK, enable ? '1' : '0');
        } catch (e) { /* ignore */ }
    }

    try {
        var saved = localStorage.getItem(STORAGE_KEY_DARK);
        if (saved === '1') {
            setDarkMode(true);
        }
    } catch (e) { /* ignore */ }

    darkToggle.addEventListener('click', function () {
        setDarkMode(!isDarkMode());
    });

    // ===== 留言板（localStorage CRUD） =====
    var STORAGE_KEY_MSG = 'youshou_messages';

    function getMessages() {
        try {
            var data = localStorage.getItem(STORAGE_KEY_MSG);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }

    function saveMessages(messages) {
        try {
            localStorage.setItem(STORAGE_KEY_MSG, JSON.stringify(messages));
        } catch (e) { /* ignore */ }
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatTime(timestamp) {
        var d = new Date(timestamp);
        var year = d.getFullYear();
        var month = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        var hour = String(d.getHours()).padStart(2, '0');
        var min = String(d.getMinutes()).padStart(2, '0');
        return year + '-' + month + '-' + day + ' ' + hour + ':' + min;
    }

    function renderMessages() {
        var messages = getMessages();
        msgList.innerHTML = '';
        if (messages.length === 0) {
            msgList.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">暂无留言，来写下第一条吧！</p>';
            return;
        }
        messages.slice().reverse().forEach(function (msg) {
            var item = document.createElement('div');
            item.className = 'message-item';
            item.innerHTML =
                '<div class="msg-header">' +
                    '<span class="msg-name">' + escapeHtml(msg.name) + '</span>' +
                    '<span class="msg-time">' + formatTime(msg.time) + '</span>' +
                '</div>' +
                '<div class="msg-text">' + escapeHtml(msg.text) + '</div>' +
                '<button class="btn btn-danger msg-delete" data-id="' + msg.id + '">删除</button>';
            msgList.appendChild(item);
        });

        msgList.querySelectorAll('.msg-delete').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = this.getAttribute('data-id');
                deleteMessage(id);
            });
        });
    }

    function addMessage(name, text) {
        var messages = getMessages();
        messages.push({
            id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
            name: name,
            text: text,
            time: Date.now()
        });
        saveMessages(messages);
        renderMessages();
    }

    function deleteMessage(id) {
        var messages = getMessages();
        messages = messages.filter(function (m) {
            return m.id !== id;
        });
        saveMessages(messages);
        renderMessages();
    }

    msgSubmit.addEventListener('click', function () {
        var name = msgName.value.trim();
        var text = msgContent.value.trim();
        if (!name) {
            msgName.focus();
            msgName.style.borderColor = '#e74c3c';
            setTimeout(function () { msgName.style.borderColor = ''; }, 1500);
            return;
        }
        if (!text) {
            msgContent.focus();
            msgContent.style.borderColor = '#e74c3c';
            setTimeout(function () { msgContent.style.borderColor = ''; }, 1500);
            return;
        }
        addMessage(name, text);
        msgName.value = '';
        msgContent.value = '';
    });

    renderMessages();
})();
