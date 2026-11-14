# Antigravity Mobile Companion 🚀📱

A mobile-first web app (PWA) to control, prompt, review, and monitor your laptop's **Antigravity** agents from your phone while on the move.

---

## ✨ Features Built For Mobile

1. **💬 Agent Chat & Live Streaming:**
   - Prompt Antigravity agents directly from your phone.
   - Stream agent thought processes and tool actions in real time over WebSockets.
   - **One-Tap Permission Cards:** When an agent requests to run a bash command, tap **`[ ✅ Approve ]`** or **`[ ❌ Reject ]`** without typing.
   - **Voice Input:** Built-in microphone dictation (Web Speech API) so you can prompt your agent while walking.
   - Quick chips for `/plan`, `/compact`, git checks, and testing.

2. **📁 Directory Navigation & Workspace Switcher:**
   - Breadcrumb navigation to explore any folder on your laptop.
   - Tap **"Set as Workspace"** to switch the agent's working directory (`cwd`) on the fly.
   - Mobile file viewer with syntax highlighting and one-tap copy button.

3. **🗂️ Conversation History & Switcher:**
   - Slide-out drawer displaying your recent Antigravity sessions directly from `~/.gemini/antigravity/conversation_summaries.db`.
   - Search past sessions, view step counts, inspect previous turns, or start a new task.

4. **📜 Artifact Reviewer:**
   - Dedicated tab rendering markdown plans, architecture docs, and reports produced by agents.
   - One-tap download and clipboard copy.

5. **💻 Touch-Optimized Terminal:**
   - **Quick Command Mode:** One-tap preset chips (`git status`, `git diff`, `git log`, `docker ps`, `npm test`) + one-line runner with exit codes and collapsible output cards.
   - **Interactive PTY Mode:** Full real-time Linux pseudo-terminal connected to `/bin/bash` over WebSockets (`xterm.js`).
   - **Mobile Helper Toolbar:** Extra touch keys mobile keyboards lack: `[ESC]`, `[TAB]`, `[CTRL+C]`, `[↑]`, `[↓]`, `[Clear]`, `[|]`, `[~]`, `[/]`.

---

## 🚀 Quick Start

From your laptop terminal:

```bash
cd /home/san/Desktop/Codespace/mobileterminal
./start.sh
```

### 📱 Connecting from your Phone

Your laptop already has **Tailscale** active!

1. Make sure your phone is also connected to your Tailscale network.
2. Open your phone's browser (Safari on iOS or Chrome on Android) and navigate to:
   ```
   http://100.102.183.0:8000
   ```
3. **Install as a PWA (Recommended):**
   - **iOS:** Tap the **Share** button (`⎙` / `⬆`) ➔ tap **"Add to Home Screen"**.
   - **Android:** Tap the three dots menu (`⋮`) ➔ tap **"Install App"** or **"Add to Home screen"**.
   - It will open as a full-screen standalone app with no browser address bar!

---

## 🎒 Keeping Laptop Running When Lid is Closed

To prevent your laptop from suspending when closed in a bag or on your desk while connected to power:

On Linux (systemd):
```bash
sudo mkdir -p /etc/systemd/logind.conf.d
sudo tee /etc/systemd/logind.conf.d/clamshell.conf << 'EOF'
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
EOF
sudo systemctl restart systemd-logind
```

---

## 🛠️ Tech Architecture

```
Phone (PWA Browser)
  │
  ├─ Tailscale WireGuard Mesh (100.102.183.0:8000)
  │
  ▼
FastAPI Server (backend/main.py)
  ├── Static SPA Assets (frontend/dist)
  ├── Antigravity DB & Logs (conv_manager.py) ➔ ~/.gemini/antigravity/
  ├── Filesystem API (fs_manager.py) ➔ Local Disk
  ├── Interactive Terminal PTY (pty_terminal.py) ➔ /bin/bash over WebSocket
  └── Agent CLI Runner (agent_runner.py) ➔ `agy -p ... --output-format stream-json`
```
