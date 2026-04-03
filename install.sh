#!/bin/bash

# EOTrans 部署脚本

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

PYTHON_CMD="python3"
PIP_CMD="$PYTHON_CMD -m pip"

# 安装 pip 到当前 Python 版本
ensure_pip() {
    echo -e "${YELLOW}检查并安装 pip...${NC}"

    # 尝试安装 pip
    curl -s https://bootstrap.pypa.io/get-pip.py | $PYTHON_CMD

    if [ $? -ne 0 ]; then
        echo -e "${RED}get-pip.py 失败，尝试备用方案...${NC}"
        # 使用 ensurepip 模块
        $PYTHON_CMD -m ensurepip --upgrade --default-pip
    fi
}

# 安装依赖
install_deps() {
    echo -e "${GREEN}正在安装项目依赖...${NC}"

    echo -e "${BLUE}Python 版本: $($PYTHON_CMD --version)${NC}"

    # 先确保 pip 可用
    if ! $PIP_CMD --version &> /dev/null; then
        ensure_pip
    fi

    echo -e "${BLUE}Pip 版本: $($PIP_CMD --version)${NC}"

    # 升级 pip
    $PIP_CMD install --upgrade pip setuptools wheel -q

    # 安装依赖（如果有）
    if [ -f requirements.txt ]; then
        $PIP_CMD install -r requirements.txt -q
    fi

    echo -e "${GREEN}✅ 依赖安装成功！${NC}"
}

# 构建静态文件
build_static() {
    echo -e "${GREEN}🏗️ 正在构建静态文件...${NC}"

    install_deps
    $PYTHON_CMD build_static.py

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ 构建完成！${NC}"
    else
        echo -e "${RED}❌ 构建失败${NC}"
        exit 1
    fi
}

# 主函数
main() {
    case "$1" in
        install)
            install_deps
            ;;
        build)
            build_static
            ;;
        *)
            echo "用法: bash install.sh [install|build]"
            exit 1
            ;;
    esac
}

main "$@"
