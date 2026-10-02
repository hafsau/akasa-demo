import os

# Tests drive the agents with scripted models; no request ever leaves the machine.
os.environ.setdefault("ANTHROPIC_API_KEY", "test-not-a-real-key")
