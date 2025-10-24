#!/usr/bin/env python3
"""
开发服务器启动脚本
同时启动后端 FastAPI 服务和前端 Streamlit 应用
"""

import subprocess
import sys
import time
import threading
from pathlib import Path


def start_backend():
    """启动后端 FastAPI 服务"""
    print("🚀 启动后端服务...")
    try:
        subprocess.run(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "backend.main:app",
                "--reload",
                "--host",
                "0.0.0.0",
                "--port",
                "8000",
            ],
            check=True,
        )
    except subprocess.CalledProcessError as e:
        print(f"❌ 后端服务启动失败: {e}")
    except KeyboardInterrupt:
        print("🛑 后端服务已停止")


def start_frontend():
    """启动前端 Streamlit 应用"""
    print("🚀 启动前端应用...")
    try:
        subprocess.run(
            [
                sys.executable,
                "-m",
                "streamlit",
                "run",
                "frontend/app.py",
                "--server.port",
                "8501",
                "--server.address",
                "0.0.0.0",
            ],
            check=True,
        )
    except subprocess.CalledProcessError as e:
        print(f"❌ 前端应用启动失败: {e}")
    except KeyboardInterrupt:
        print("🛑 前端应用已停止")


def main():
    """主函数"""
    print("🎓 RA 教育工具包 - 开发服务器")
    print("=" * 50)

    # 检查当前目录
    if not Path("backend").exists() or not Path("frontend").exists():
        print("❌ 错误: 请在项目根目录运行此脚本")
        print("   确保 backend/ 和 frontend/ 目录存在")
        sys.exit(1)

    print("📋 服务信息:")
    print("   • 后端 API: http://localhost:8000")
    print("   • 前端应用: http://localhost:8501")
    print("   • API 文档: http://localhost:8000/docs")
    print("=" * 50)

    # 启动后端服务（在后台线程中）
    backend_thread = threading.Thread(target=start_backend, daemon=True)
    backend_thread.start()

    # 等待后端服务启动
    print("⏳ 等待后端服务启动...")
    time.sleep(3)

    # 启动前端应用（主线程）
    try:
        start_frontend()
    except KeyboardInterrupt:
        print("\n🛑 正在停止所有服务...")
        print("✅ 所有服务已停止")


if __name__ == "__main__":
    main()
