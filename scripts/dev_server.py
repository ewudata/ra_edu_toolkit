#!/usr/bin/env python3
"""
Development server startup script
Starts both backend FastAPI service and frontend React application
"""

import subprocess
import sys
import time
import threading
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def start_backend():
    """Start backend FastAPI service"""
    print("🚀 Starting backend service...")
    try:
        # Get configuration from environment
        host = os.getenv("BACKEND_HOST", "0.0.0.0")
        port = os.getenv("BACKEND_PORT", "8000")
        reload = os.getenv("RELOAD", "True").lower() == "true"

        cmd = [
            sys.executable,
            "-m",
            "uvicorn",
            "backend.main:app",
            "--host",
            host,
            "--port",
            port,
        ]

        if reload:
            cmd.append("--reload")

        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ Backend service failed to start: {e}")
    except KeyboardInterrupt:
        print("🛑 Backend service stopped")


def start_frontend():
    """Start frontend React dev server"""
    print("🚀 Starting frontend application...")
    try:
        port = os.getenv("FRONTEND_PORT", "5173")

        subprocess.run(
            ["npm", "run", "dev", "--", "--port", port],
            cwd=str(Path(__file__).parent.parent / "frontend"),
            check=True,
        )
    except subprocess.CalledProcessError as e:
        print(f"❌ Frontend application failed to start: {e}")
    except KeyboardInterrupt:
        print("🛑 Frontend application stopped")


def main():
    """Main function"""
    print("🎓 RA Education Toolkit - Development Server")
    print("=" * 50)

    # Check current directory
    if not Path("backend").exists() or not Path("frontend").exists():
        print("❌ Error: Please run this script from the project root directory")
        print("   Ensure backend/ and frontend/ directories exist")
        sys.exit(1)

    # Get configuration from environment
    backend_host = os.getenv("BACKEND_HOST", "0.0.0.0")
    backend_port = os.getenv("BACKEND_PORT", "8000")
    frontend_host = os.getenv("FRONTEND_HOST", "0.0.0.0")
    frontend_port = os.getenv("FRONTEND_PORT", "5173")

    print("📋 Service Information:")
    print(f"   • Backend API: http://{backend_host}:{backend_port}")
    print(f"   • Frontend App: http://{frontend_host}:{frontend_port}")
    print(f"   • API Docs: http://{backend_host}:{backend_port}/docs")
    print("=" * 50)

    # Start backend service (in background thread)
    backend_thread = threading.Thread(target=start_backend, daemon=True)
    backend_thread.start()

    # Wait for backend service to start
    print("⏳ Waiting for backend service to start...")
    time.sleep(3)

    # Start frontend application (main thread)
    try:
        start_frontend()
    except KeyboardInterrupt:
        print("\n🛑 Stopping all services...")
        print("✅ All services stopped")


if __name__ == "__main__":
    main()
