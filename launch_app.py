import subprocess
import time
import os
import sys
import webbrowser

def get_project_root():
    if getattr(sys, 'frozen', False):
        # Running as PyInstaller .exe
        exe_dir = os.path.dirname(os.path.abspath(sys.executable))
        for path in [exe_dir, os.path.dirname(exe_dir), os.path.dirname(os.path.dirname(exe_dir))]:
            if os.path.isdir(os.path.join(path, "clientplus-ai")):
                return path
        return os.path.dirname(exe_dir)
    else:
        return os.path.dirname(os.path.abspath(__file__))

def main():
    print("Starting ClientPlus AI Desktop Engine...")
    
    root_dir = get_project_root()
    print(f"[Launcher] Project root: {root_dir}")
    
    # 1. Start Python FastAPI Backend on Port 8000
    backend_dir = os.path.join(root_dir, "backend")
    backend_exe = os.path.join(backend_dir, "dist", "clientplus-backend", "clientplus-backend.exe")
    
    if os.path.exists(backend_exe):
        print(f"[Launcher] Starting backend binary: {backend_exe}")
        backend_process = subprocess.Popen([backend_exe], cwd=backend_dir)
    else:
        print("[Launcher] Starting backend python script...")
        python_exe = os.path.join(backend_dir, "venv", "Scripts", "python.exe")
        if not os.path.exists(python_exe):
            python_exe = sys.executable
        script_path = os.path.join(backend_dir, "email_outreach.py")
        backend_process = subprocess.Popen([python_exe, script_path], cwd=backend_dir)

    # 2. Start Next.js Production Web Server on Port 3000
    next_dir = os.path.join(root_dir, "clientplus-ai")
    print(f"[Launcher] Starting Next.js web app from {next_dir}...")
    next_process = subprocess.Popen("npm.cmd run start", cwd=next_dir, shell=True)

    # Wait 4 seconds for servers to initialize
    print("[Launcher] Waiting for services to initialize...")
    time.sleep(4)

    # 3. Open App Mode Window (looks like a native Windows Desktop App)
    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    
    edge_exe = next((p for p in edge_paths if os.path.exists(p)), None)
    url = "http://localhost:3000"

    if edge_exe:
        print(f"[Launcher] Opening App Window in Edge ({url})...")
        subprocess.Popen([edge_exe, f"--app={url}"])
    else:
        print(f"[Launcher] Opening default browser ({url})...")
        webbrowser.open(url)

    print("\nClientPlus AI is running!")

if __name__ == "__main__":
    main()
