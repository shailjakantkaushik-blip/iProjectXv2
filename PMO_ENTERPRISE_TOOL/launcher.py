"""
Launcher for PMO Enterprise Tool desktop executable.
This script bootstraps Streamlit and opens the app in the default browser.
"""
import os
import sys
import subprocess
import webbrowser
import time

def main():
    # Determine paths
    if getattr(sys, 'frozen', False):
        # Running inside PyInstaller bundle
        base_dir = sys._MEIPASS
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))

    app_path = os.path.join(base_dir, "app.py")
    data_dir = os.path.join(base_dir, "data")
    os.makedirs(data_dir, exist_ok=True)

    # Find streamlit command
    python_exe = sys.executable
    streamlit_cmd = [python_exe, "-m", "streamlit", "run", app_path,
                     "--server.headless=true",
                     "--server.port=8501",
                     "--server.address=localhost"]

    print("Starting PMO Enterprise Tool...")
    print(f"App: {app_path}")
    print("Opening browser at http://localhost:8501")

    proc = subprocess.Popen(streamlit_cmd, cwd=base_dir)

    # Give Streamlit a moment to start, then open browser
    time.sleep(3)
    webbrowser.open("http://localhost:8501")

    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
        proc.wait()
        print("\nShutdown complete.")

if __name__ == "__main__":
    main()
