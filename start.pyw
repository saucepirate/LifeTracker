import subprocess
import os
import sys

script_dir = os.path.dirname(os.path.abspath(__file__))
subprocess.Popen(
    [sys.executable, os.path.join(script_dir, "main.py")],
    cwd=script_dir,
    creationflags=0x08000000,
)
