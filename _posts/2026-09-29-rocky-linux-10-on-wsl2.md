---
title: Rocky Linux 10 on WSL2
date: 2026-09-29 08:00:00 +0000
categories: [linux, wsl]
---

Instructions for installing **Rocky Linux 10** on **Windows 11** via **WSL2**.

There are two approaches:

- **Option A (preferred):** Install the official Rocky **WSL image** (`.wsl` file)
  straight from the Rocky CDN. No Docker, no Linux host, no SCP — just download
  and install on Windows.
- **Option B:** Import a Rocky **container rootfs** (`.tar`) with `wsl --import`.
  Use this if you want a customised rootfs (pre-installed packages, custom
  config) before first boot.

> **Note:** Rocky Linux 10 "Red Quartz" is the current major release
> (equivalent to RHEL 10). Point release 10.2 is the latest as of this writing.

## Upstream References

- Microsoft: [How to install Linux on Windows with WSL](https://learn.microsoft.com/en-us/windows/wsl/install)
- Microsoft: [Import any Linux distribution to use with WSL](https://learn.microsoft.com/en-us/windows/wsl/use-custom-distro)
- Microsoft: [Comparing WSL versions / WSL in the Microsoft Store](https://learn.microsoft.com/en-us/windows/wsl/compare-versions)
- Microsoft: [Configure settings with .wslconfig and wsl.conf](https://learn.microsoft.com/en-us/windows/wsl/wsl-config)
- Rocky: [Import Rocky Linux to WSL or WSL2](https://docs.rockylinux.org/10/guides/interoperability/import_rocky_to_wsl/)
- Rocky: [Downloads (WSL and container images)](https://rockylinux.org/download)

## Prerequisites

### On Windows 11

1. **Enable virtualization** — Ensure virtualization is enabled in BIOS/UEFI.
   > Running WSL inside a Windows VM (e.g., Proxmox, Hyper-V) may require nested
   > virtualization and is not officially supported. Use a physical machine for
   > reliable results.

2. **Windows Terminal** — Ships with Windows 11. If missing:
   - Microsoft Store → "Windows Terminal", or
   - https://aka.ms/terminal

3. **(Optional) Cascadia Code PL font** — Needed for Powerline glyphs.
   Download the latest release and install the `.ttf` files for all users:
   - https://github.com/microsoft/CascadiaCode/releases

### On a Linux host (Option B only)

If you want to build a custom rootfs, you need a machine (VM or bare metal)
with **Docker** or **Podman** installed. A minimal Rocky Linux VM works fine.
You can also download Rocky's container rootfs directly from the CDN — no
Docker host needed (see Option B below).

---

## Step 1: Install and update WSL

Open **PowerShell as Administrator** and run:

```powershell
wsl --install
```

Restart when prompted.

> `wsl --install` enables the WSL feature, installs the **current WSL engine
> from the Microsoft Store**, and installs the default distro (Ubuntu). Modern
> WSL is serviced as a Store app rather than through Windows updates, so you
> get new WSL features as soon as they ship.

If you already have WSL installed, make sure the engine is up to date — some
features (including `wsl --install --from-file`) require a recent version:

```powershell
wsl --update
```

> If the Microsoft Store is inaccessible on your network, use
> `wsl --update --web-download` instead (manual updates only).

Verify your WSL version and that WSL 2 is the default:

```powershell
wsl --version
wsl -l -v
```

---

## Step 2: Get the Rocky Linux 10 image

### Option A: Official WSL image (preferred)

Download the official `.wsl` image from the Rocky CDN (x86_64 or aarch64):

- **x86_64:** <https://dl.rockylinux.org/pub/rocky/10/images/x86_64/Rocky-10-WSL-Base.latest.x86_64.wsl>
- **aarch64:** <https://dl.rockylinux.org/pub/rocky/10/images/aarch64/Rocky-10-WSL-Base.latest.aarch64.wsl>

Download to e.g. `C:\temp\` (PowerShell):

```powershell
curl.exe -L -o C:\temp\Rocky-10-WSL-Base.latest.x86_64.wsl `
  https://dl.rockylinux.org/pub/rocky/10/images/x86_64/Rocky-10-WSL-Base.latest.x86_64.wsl
```

Verify the checksum:

```powershell
# Fetch the published checksum
curl.exe -L -o C:\temp\Rocky-10-WSL-Base.latest.x86_64.wsl.CHECKSUM `
  https://dl.rockylinux.org/pub/rocky/10/images/x86_64/Rocky-10-WSL-Base.latest.x86_64.wsl.CHECKSUM
Get-Content C:\temp\Rocky-10-WSL-Base.latest.x86_64.wsl.CHECKSUM

# Compute it locally and compare
Get-FileHash C:\temp\Rocky-10-WSL-Base.latest.x86_64.wsl -Algorithm SHA256
```

### Option B: Container rootfs

**B1. Direct download from the CDN** (no Docker needed). These are `.tar.xz`
images meant for `docker load`, but they work fine for `wsl --import` once
unpacked to a plain `.tar`:

- **Minimal x86_64:** <https://dl.rockylinux.org/pub/rocky/10/images/x86_64/Rocky-10-Container-Minimal.latest.x86_64.tar.xz>
- **Base x86_64:** <https://dl.rockylinux.org/pub/rocky/10/images/x86_64/Rocky-10-Container-Base.latest.x86_64.tar.xz>
- (UBI and aarch64 variants are also available under the same path)

```powershell
curl.exe -L -o C:\temp\Rocky-10-Container-Minimal.latest.x86_64.tar.xz `
  https://dl.rockylinux.org/pub/rocky/10/images/x86_64/Rocky-10-Container-Minimal.latest.x86_64.tar.xz
```

**B2. Export from a Docker/Podman container** (custom rootfs). On a Linux host
(or with Docker Desktop on Windows):

```bash
# Pull the Rocky Linux 10 image
docker pull rockylinux/rockylinux:10

# (Optional) customise the rootfs here: run a container, install packages,
# configure things, then commit or export it.

# Run a container (keep it alive so we can export it)
docker run -d --name rocky-export rockylinux/rockylinux:10 sleep infinity

# Export the rootfs as a plain tar
docker export rocky-export > /tmp/rocky-10-image.tar

# Stop and remove the container
docker stop rocky-export && docker rm rocky-export
```

> **Important:** current WSL imports only a **plain `.tar`** file — it no
> longer auto-decompresses `.tar.xz`/`.tar.gz`. If you have a compressed
> archive (e.g. from B1), unpack it first, e.g. with 7-Zip:
>
> ```powershell
> 7z x C:\temp\Rocky-10-Container-Minimal.latest.x86_64.tar.xz -oC:\temp
> ```
>
> This yields `C:\temp\Rocky-10-Container-Minimal.latest.x86_64.tar`.

If you exported the tar on a separate Linux host, copy it to Windows:

```bash
scp /tmp/rocky-10-image.tar user@windows-pc:C:\temp\
```

---

## Step 3: Install / import into WSL

Open **PowerShell** (no admin rights needed).

### Option A: Install the `.wsl` image

Either **double-click** the downloaded `.wsl` file, or install from the
command line:

```powershell
wsl --install --from-file C:\temp\Rocky-10-WSL-Base.latest.x86_64.wsl --name rocky10
```

### Option B: Import the rootfs tar

Create the install directory and import:

```powershell
mkdir C:\linux\rocky10
wsl --import rocky10 C:\linux\rocky10 C:\temp\Rocky-10-Container-Minimal.latest.x86_64.tar --version 2
```

Verify the import:

```powershell
wsl -l -v
# NAME      STATE     VERSION
# rocky10   Stopped   2
```

---

## Step 4: Initial Setup (inside WSL)

Start the distro:

```powershell
wsl -d rocky10
```

You'll be logged in as **root**.

### 4a. Update the system

```bash
dnf -y update
```

### 4b. Create a default user

```bash
# Install sudo (passwd is included in the base image)
dnf install -y sudo

# Create your user (replace 'myuser' with your username)
myUser=myuser
adduser -G wheel $myUser
echo "$myUser:$myUser" | chpasswd

# Set the default user (and enable systemd if you used Option B)
cat > /etc/wsl.conf <<EOF
[user]
default=$myUser

[boot]
systemd=true
EOF

# Set root password (optional)
passwd root
```

> The official Option A image already ships with **systemd enabled** — the
> `[boot] systemd=true` line only matters if you imported a container rootfs
> (Option B). You can verify with `systemctl status` once running.

Apply the config (must run from PowerShell):

```powershell
wsl --terminate rocky10
wsl -d rocky10
```

You should now land in your normal user session.

### 4c. Install utilities

```bash
# Enable EPEL (Rocky doesn't ship an epel-release package — use Fedora's)
dnf install -y https://dl.fedoraproject.org/pub/epel/epel-release-latest-10.noarch.rpm

dnf install -y \
  vim wget curl traceroute rsync dos2unix \
  zip unzip bash-completion bc bzip2 file time \
  glibc-langpack-en libmodulemd libzstd \
  openssh-clients htop ansible git mc bind-utils \
  less tree tmux zsh

# Powerline (from EPEL)
dnf install -y powerline
```

### 4d. Optional: Full base group

For a more complete (fatter) system resembling a standard Rocky install:

```bash
dnf groupinstall -y "Core" "Base"
```

> The lean install is sufficient for most use cases. Add packages as needed.

### 4e. Enable Powerline in bash

Add to `~/.bashrc`:

```bash
if command -v powerline-daemon &> /dev/null; then
  powerline-daemon -q
  POWERLINE_BASH_CONTINUATION=1
  POWERLINE_BASH_SELECT=1
  . /usr/share/powerline/bash/powerline.sh
fi
```

Reload your shell:

```bash
exec bash
```

---

## Step 5: Configure Windows Terminal

1. Open **Windows Terminal** — `rocky10` will automatically appear in the
   profile **pull-down menu**.
2. Open Settings (`Ctrl+,`).
3. Under **Profiles > Defaults**, set:

   | Setting       | Value               |
   |---------------|---------------------|
   | Font face     | Cascadia Code PL    |
   | Color scheme  | Tango Dark          |

4. Select the **rocky10** profile and edit:

   - **General**
     - Commandline: `wsl.exe -u myuser -d rocky10`
     - Starting directory: `//wsl.localhost/rocky10/home/myuser`
   - **Appearance**
     - Font face: `Cascadia Code PL`
     - Color scheme: `Tango Dark`

5. (Optional) Set as the default WSL distro:

   ```powershell
   wsl -s rocky10
   ```

---

## Optional: Limit WSL 2 resources

Create or edit `%UserProfile%\.wslconfig` to cap the WSL VM's resource usage
(Windows restarts WSL to apply changes):

```ini
[wsl2]
# Limits VM memory to 4 GB
memory=4GB
# Use 4 logical processors
processors=4
# 8 GB swap file (default is 25% of host RAM)
swap=8GB
```

---

## Done!

You now have a clean, minimal **Rocky Linux 10** instance running on **WSL2**
under Windows 11.

If you used a separate Docker host VM to build the rootfs, you can shut it
down or destroy it now.

---

## Troubleshooting

### `wsl --install --from-file` is not recognized

You're running an older WSL engine. Update it:

```powershell
wsl --update
```

Then retry. (If the Microsoft Store is blocked, `wsl --update --web-download`.)

### Install hangs at 0.0%

Force the distribution to download out-of-band:

```powershell
wsl --install --web-download -d <DistroName>
```

### Import fails on a `.tar.xz` / `.tar.gz` file

Current WSL only imports plain `.tar` files. Unpack the archive first
(see Step 2, Option B note).

### WSL version
WSL2 is the default on Windows 11. Verify:

```powershell
wsl -l -v
```

### systemd not running (Option B images)

Make sure `/etc/wsl.conf` contains `[boot] systemd=true`, then run
`wsl --terminate rocky10` and start it again.

### File permissions after import
If files show as owned by root, fix ownership:

```bash
sudo chown -R $USER:$USER /home/$USER
```

### Powerline glyphs not rendering
- Ensure Cascadia Code PL (or another Powerline-compatible font) is set in
  Windows Terminal
- The "PL" variant includes Powerline glyphs

---

*This post is a straight port of the README from my [rockylinux-on-wsl](https://github.com/loosepin313/rockylinux-on-wsl) repo — the canonical copy lives there, so report issues and pull requests against that repo rather than this post.*
