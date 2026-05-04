# GatesInbound — Deployment Guide

Target: `gatesinbound.hostwithfilemaker.com` → port 3005  
Repo:   `https://github.com/billyjackhouze/GatesInbound.git`  
CI/CD:  GitHub Actions → SSH → git pull → npm ci → pm2 restart

---

## Part 1 — First-time setup on your dev machine

Run these commands once from the `GatesInbound/` folder on your Mac:

```bash
cd "/Users/billyjack/Documents/Claude/Projects/Gate Engineered Lubricants/GatesInbound"

# Initialize git
git init -b main
git remote add origin https://github.com/billyjackhouze/GatesInbound.git

# Stage everything
git add .
git commit -m "Initial commit — GEL Inbound Shipments board"

# Push to GitHub
git push -u origin main
```

After this, every `git push` to `main` will trigger an automatic deployment.

---

## Part 2 — GitHub Secrets (do this BEFORE the first automated deploy)

In GitHub → **Settings → Secrets and variables → Actions → New repository secret**, add:

| Secret name       | Value                                              |
|-------------------|----------------------------------------------------|
| `SERVER_HOST`     | Your server IP or hostname                         |
| `SERVER_USER`     | SSH username (e.g. `ubuntu`, `root`)               |
| `SERVER_SSH_KEY`  | Contents of your private SSH key (`~/.ssh/id_rsa`) |
| `SERVER_SSH_PORT` | SSH port (leave blank or set `22`)                 |
| `SERVER_APP_PATH` | Full path to the app on the server (see Part 3)    |

> **How to get your SSH private key:**  
> `cat ~/.ssh/id_rsa` — copy the entire output including the `-----BEGIN...` and `-----END...` lines.  
> If you don't have a key yet: `ssh-keygen -t ed25519 -C "github-deploy"` then add the `.pub` to your server's `~/.ssh/authorized_keys`.

---

## Part 3 — First-time server setup (SSH into the server and run once)

```bash
# 1. Clone the repo into the app directory
cd /var/www          # or wherever your other Gates apps live
git clone https://github.com/billyjackhouze/GatesInbound.git
cd GatesInbound

# 2. Create the .env file (copy from example, then fill in real values)
cp .env.example .env
nano .env            # fill in FM_HOST, FM_USERNAME, FM_PASSWORD, FM_SIDEKICK_DB

# 3. Create logs directory
mkdir -p logs

# 4. Install dependencies
npm ci --omit=dev

# 5. Start the app with PM2
pm2 start ecosystem.config.js --env production

# 6. Save PM2 process list and enable startup on reboot
pm2 save
pm2 startup          # run the command it prints

# 7. Verify the app is running
pm2 status
curl http://localhost:3005/api/fm/status
```

Set `SERVER_APP_PATH` secret to the full path of the cloned folder — e.g. `/var/www/GatesInbound`.

---

## Part 4 — Nginx reverse proxy

This follows the same pattern as Delivery Tickets (port 8080 → 3004).  
The new block listens on **port 8081** and proxies to **localhost:3005**.

Append the new server block to your existing nginx config on the server:

```bash
# Open your nginx config (adjust path to match where Delivery Tickets block lives)
sudo nano /etc/nginx/nginx.conf

# Paste the contents of nginx.conf.snippet AFTER the existing Delivery Tickets block

sudo nginx -t                    # must say "syntax is ok"
sudo systemctl reload nginx
```

Then open port 8081 in your firewall/security group so the outside world can reach it:

```bash
# Example for UFW (Ubuntu firewall):
sudo ufw allow 8081/tcp
sudo ufw status

# Example for AWS/cloud security group:
# Add inbound rule: TCP port 8081, source 0.0.0.0/0
```

Verify it's working:

```bash
curl http://gatesinbound.hostwithfilemaker.com:8081/api/fm/status
```

---

## Part 5 — DNS

Add an **A record** in your DNS provider:

```
Type: A
Name: gatesinbound
Value: <your server IP>
TTL: 300
```

---

## Day-to-day workflow after setup

```bash
# Make changes on your Mac, then:
cd "/Users/billyjack/Documents/Claude/Projects/Gate Engineered Lubricants/GatesInbound"
git add .
git commit -m "describe your change"
git push                # GitHub Actions automatically deploys to the server
```

Watch the deploy live: GitHub repo → **Actions** tab.

---

## Useful server commands

```bash
pm2 status                    # see all running apps
pm2 logs gates-inbound        # tail live logs
pm2 logs gates-inbound --lines 100   # last 100 lines
pm2 restart gates-inbound     # manual restart
sudo nginx -t && sudo systemctl reload nginx   # reload nginx config
```

---

## Port map — all Gates apps on this server

| App                   | PM2 name          | Internal port | External port | URL                                        |
|-----------------------|-------------------|---------------|---------------|--------------------------------------------|
| PO Inbox              | gates-po-inbox    | 3001          | _(existing)_  | _(your existing subdomain)_                |
| Sales CRM             | gates-crm         | 3003          | _(existing)_  | _(your existing subdomain)_                |
| Delivery Tickets      | gates-warehouse   | 3004          | **8080**      | gelwarehouse.hostwithfilemaker.com:8080    |
| **Inbound Shipments** | **gates-inbound** | **3005**      | **8081**      | gatesinbound.hostwithfilemaker.com:**8081** |

> ⚠️ Open port **8081** in your firewall / cloud security group before going live.  
> Port 8080 should already be open for Delivery Tickets.
