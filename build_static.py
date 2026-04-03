#!/usr/bin/env python3
"""
EOTrans 静态文件构建脚本

本项目是纯前端 WebRTC P2P 文件传输工具，
构建过程主要是验证文件完整性并生成构建信息。
"""

import os
import json
import hashlib
from datetime import datetime


def calculate_md5(filepath):
    """计算文件 MD5"""
    hash_md5 = hashlib.md5()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()


def build_static():
    """构建静态文件"""
    print("🏗️  EOTrans 静态文件构建")
    print("=" * 40)
    
    # 检查必要文件
    required_files = [
        'index.html',
        'app.js',
        'README.md'
    ]
    
    build_info = {
        'build_time': datetime.now().isoformat(),
        'files': {}
    }
    
    for filename in required_files:
        if os.path.exists(filename):
            file_hash = calculate_md5(filename)
            file_size = os.path.getsize(filename)
            build_info['files'][filename] = {
                'hash': file_hash,
                'size': file_size
            }
            print(f"✅ {filename} ({file_size} bytes)")
        else:
            print(f"❌ {filename} 缺失")
            return False
    
    # 写入构建信息
    with open('build_info.json', 'w', encoding='utf-8') as f:
        json.dump(build_info, f, indent=2)
    
    print("=" * 40)
    print("✅ 构建完成！")
    print(f"📦 构建时间: {build_info['build_time']}")
    print("📁 输出文件: build_info.json")
    
    return True


if __name__ == '__main__':
    success = build_static()
    exit(0 if success else 1)
