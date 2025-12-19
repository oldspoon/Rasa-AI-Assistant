import sys
from pathlib import Path

# Make `actions` and `database` importable when running pytest from action_server/.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "database"))
