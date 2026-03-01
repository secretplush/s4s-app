# HEARTBEAT.md

## 🔴 Bianca Daemon Health
- Check daemon: `curl -s http://localhost:8901/health`
- Check stats: `curl -s http://localhost:8901/stats`
- If daemon down: `cd ~/.openclaw/workspace && nohup python3 research/bianca-daemon.py > /dev/null 2>&1 &`
- Check mass bump state: `cat research/bianca-mass-bump-state.json`

## 🔴 S4S Rotation
- Railway: `curl -s https://s4s-worker-production.up.railway.app/stats`
- Verify `isRunning: true`
- Dashboard: https://s4s-app.vercel.app/rotation
