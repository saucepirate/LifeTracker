import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DB_PATH = os.path.join(BASE_DIR, "data", "life_tracker.db")
HOST = "127.0.0.1"
PORT = 8000
DEBUG = True
