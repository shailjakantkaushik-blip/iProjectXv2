# PMO Enterprise Tool — Multi-user Hosting Guide

This app is a Streamlit web app. To let several users share one live view of
the data you host the app **once** on a central server and share the URL —
typically pinned as a link on a SharePoint page. The master Excel workbook
lives on **SharePoint / OneDrive**, synced to that server so every save goes
back to the shared file.

```
                 ┌────────────────────────────────────────────────┐
   Users  ──►    │  https://pmo.contoso.local  (Streamlit app)    │
   (browser)     │  running on 1 internal server / Azure App Svc  │
                 └───────────────┬────────────────────────────────┘
                                 │  reads & writes
                                 ▼
                    C:\Users\svc-pmo\OneDrive - Contoso\
                       PMO\PMO_Master.xlsx     ◄── same file
                                 ▲
                                 │  bi-directional sync
                                 ▼
                    SharePoint site — Documents / PMO / PMO_Master.xlsx
```

## 1 · Prepare the shared workbook on SharePoint

1. Upload `PMO_Master.xlsx` to a SharePoint document library the PMO team owns
   (e.g. `Contoso > PMO > Shared Documents > PMO`).
2. On the hosting server, sign in to OneDrive with a **service account** that
   has *Edit* rights to that library and click **Sync** on the folder. This
   creates a local path such as
   `C:\Users\svc-pmo\OneDrive - Contoso\PMO\PMO_Master.xlsx`.
3. Right-click the file → **Always keep on this device** so OneDrive keeps a
   full local copy (not a cloud placeholder).

## 2 · Install the app on the hosting server

Any Windows or Linux VM with Python 3.10+ works. Cheapest options: an
internal server, an Azure App Service (B1 or above), or a small EC2 instance.

```powershell
git clone <your repo> C:\apps\pmo
cd C:\apps\pmo\PMO_ENTERPRISE_TOOL
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## 3 · Point the app at the shared workbook

Set the environment variable **before** launching Streamlit. The app checks
`PMO_MASTER_PATH` first and uses it in place of the bundled sample:

```powershell
setx PMO_MASTER_PATH "C:\Users\svc-pmo\OneDrive - Contoso\PMO\PMO_Master.xlsx"
```

(On Linux/macOS: `export PMO_MASTER_PATH="/mnt/onedrive/PMO/PMO_Master.xlsx"`
in the systemd unit / launch script.)

## 4 · Run the server

Bind to `0.0.0.0` so other machines on the network can reach it, and pick a
stable port:

```powershell
streamlit run app.py ^
  --server.address 0.0.0.0 ^
  --server.port 8501 ^
  --server.headless true ^
  --browser.gatherUsageStats false
```

Put this in a Windows Service (via **NSSM**) or a systemd unit so it restarts
on reboot. For HTTPS, front it with IIS / nginx / Azure App Service.

## 5 · Add the link to SharePoint

On the SharePoint page, add a **Quick Links** or **Link** web part pointing
at the app URL (e.g. `https://pmo.contoso.local:8501`). That link is what
users click — the launcher.

> SharePoint cannot embed a running Streamlit app inside an iframe on modern
> tenants (X-Frame-Options blocks it). Use a link, not an embed.

## Multi-user safety features already built in

* **File locking** — every save acquires a `PMO_Master.xlsx.lock` sidecar via
  the `filelock` package. Concurrent saves queue instead of corrupting the
  workbook.
* **Timestamped backups** — each save first copies the workbook to
  `data/backups/PMO_Master_YYYYMMDD_HHMMSS.xlsx`.
* **Cache-by-mtime** — the loader auto-refreshes when another user (or
  Excel itself) rewrites the file.
* **Per-user session state** — each browser tab is its own Streamlit session,
  so filters and edits don't leak between users.

## Recommended workflow rules for the team

1. Treat **Excel edits made directly in the SharePoint file** as an admin
   activity — close Excel before big edits in the app, and vice versa.
2. Use the in-app **Data Editor** and dedicated pages instead of editing the
   Excel file by hand where possible; those paths run the file-lock + backup
   logic. Direct Excel edits skip both.
3. Nightly, keep an off-server copy of the latest backup (OneDrive Version
   History already keeps 500 versions; add an Azure Backup or a scheduled
   robocopy job for peace of mind).

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Another user is currently saving the workbook." | Wait a few seconds and retry. The lock releases as soon as the other save finishes. |
| Sidebar shows `Active: PMO_Master.xlsx` (bundled) instead of the shared file | `PMO_MASTER_PATH` isn't set for the Streamlit process. `setx` only affects new shells — restart the service. |
| Users see stale data | Click **🔄 Refresh** in the sidebar, or wait for OneDrive to finish syncing (icon in tray). |
| Save fails with `BadZipFile` | OneDrive is mid-sync. The app auto-falls back to a full rebuild from cache; if that also fails, restore the newest `data/backups/*.xlsx`. |
