---
title: Bringing Up an AMD GPU for llama.cpp Vulkan on Rocky Linux
date: 2026-11-18 12:00:00 +0000
categories: [linux, ai, gpu]
---

I started a new box (`llm2`) to run `llama.cpp` with the Vulkan backend on an AMD Radeon RX 580 (8 GB). The build itself was trivial. The real work was to make the GPU visible to Vulkan. Below is the history of that install, with notes on what each part does and where I wasted time.

For the clean package list, read my earlier post [Building llama.cpp with Vulkan on Rocky Linux 10](https://loosepin313.github.io/2026/10/04/build-llama-cpp-with-vulkan-on-rocky-linux-10/). This post is the troubleshooting story.

---

## Step 0 — Base System

Standard setup for a new machine. I set SELinux to permissive and enabled EPEL and CRB. I created a `packer` user in `wheel` for Ansible, plus a dedicated `llama-cpp` user for the build.

```bash
visudo
vim /etc/selinux/config          # SELINUX=permissive for now

dnf -y install epel-release
crb enable                       # CRB (ex-PowerTools) - many dev packages live here

adduser -G wheel packer
passwd packer
usermod -a -G wheel packer       # -a -G, not -G -a (I typed it wrong twice)
id packer

dnf install vim mc htop btop nvtop bind-utils netcat
dnf install ansible-core
dnf -y update
reboot

adduser llama-cpp
su - llama-cpp
```

Two notes:
- `crb enable` matters. Several Vulkan dev packages sit in CRB, not in the base repo.
- Put the append flag before `-G` in `usermod -aG wheel`. Otherwise you replace the group list of the user instead of adding to it.

---

## Step 1 — Build Toolchain and Vulkan Dev Packages

```bash
sudo dnf groupinstall "Development Tools" -y
sudo dnf install epel-release cmake ninja-build -y
sudo dnf install kernel-devel-matched kernel-headers -y

sudo dnf install vulkan-headers vulkan-loader-devel \
     vulkan-utility-libraries-devel vulkan-validation-layers -y
sudo dnf install spirv-headers-devel spirv-tools-devel -y
sudo dnf install glslc -y
sudo dnf install ccache -y
```

The parts that matter for a Vulkan build:

| Package | Reason |
|---------|--------|
| `vulkan-headers` | CMake needs these to find Vulkan at all |
| `vulkan-loader-devel` | Dev files for `libvulkan.so`. This is what lets CMake detect the backend |
| `glslc` | Shader compiler. llama.cpp compiles its Vulkan shaders during the build, so the build fails without this |
| `spirv-headers-devel` / `spirv-tools-devel` | SPIR-V is the shader IR. `glslc` and the blob path both need it |
| `ccache` | Because you will rebuild this more than once |

`dnf provides glslc` is how I discovered that `glslc` is its own package. That trick is useful whenever a build reports a missing binary.

---

## Step 2 — Where It Broke: No Vulkan Device

`vulkaninfo --summary` returned nothing useful. The GPU appeared in `lspci`, but Vulkan could not see it. This part took most of the session.

The diagnostic order that actually helped:

```bash
lspci -nn | grep -Ei 'vga|display|3d'
lspci -nnk | grep -A3 -Ei 'vga|display|3d'   # -nnk shows the kernel driver in use
lsmod | grep -E 'amdgpu|radeon'
sudo dmesg | grep -Ei 'amdgpu|drm|dri|gfx'
ls -l /dev/dri                                  # want renderD128 and cardD128
ls /usr/share/vulkan/icd.d/                     # is a RADV ICD json present?
cat /proc/cmdline
```

`lspci -nnk` is the important one. It tells you whether `amdgpu` is bound to the device. If it is not, no amount of userspace changes will help.

Also note that `lspci` is not installed by default. It lives in `pciutils`.

---

## Step 3 — The Fix: Firmware

The GPU had no firmware. `linux-firmware` was installed, but the AMD specific packages were not. So `amdgpu` loaded, then failed to start the GPU.

```bash
dnf search firmware | grep -i amd
dnf -y install amd-gpu-firmware amd-ucode-firmware

ls /usr/lib/firmware/amdgpu/     # should now be full of .bin files
dracut -f                        # rebuild initramfs so early init has it
reboot
```

After the reboot, `vulkaninfo --summary` listed the RADV device. That was the entire fix.

---

## Step 4 — Permissions

The `llama-cpp` user needs access to the DRI nodes:

```bash
usermod -a -G video llama-cpp
usermod -a -G render llama-cpp
usermod -a -G video charris
usermod -a -G render charris
```

The `render` group owns `/dev/dri/renderD128`, which is the node that compute-only Vulkan clients use. This is easy to forget, and the failure mode is a confusing "no devices" from `vulkaninfo` even when the driver is fine.

The full runtime set, for reference:

```bash
dnf install mesa-vulkan-drivers vulkan-loader vulkan-tools mesa-dri-drivers
```

---

## Step 5 — Verify

```bash
vulkaninfo --summary     # must show AMD Radeon RX 580, not llvmpipe
nvtop                    # watch VRAM and GPU use while a model runs
```

Then the normal build:

```bash
git clone https://github.com/ggml-org/llama.cpp.git
cd llama.cpp
cmake -B build -DGGML_VULKAN=ON -D CMAKE_BUILD_PARALLEL_LEVEL=$(nproc)
cmake --build build --config Release -- -j$(nproc)
./build/bin/llama-cli -h | grep -i vulkan
./build/bin/llama-cli --list-devices
```

CMake detects Vulkan on its own. I still pass `-DGGML_VULKAN=ON`. If the loader or the headers are missing, the configure step then fails with a clear error instead of quietly building a CPU-only binary.

---

## Step 6 — Run a Model (RX 580, 8 GB)

```bash
./build/bin/llama-cli \
  -m ~/models/Ornith-1.5-9B-Q4_K_M.gguf \
  -p "explain gravity" \
  --device vulkan \
  --ngl 99 \
  --ctx-size 2048
```

### 8 GB VRAM guidance

| Model | Quant | Context | Notes |
|-------|-------|---------|-------|
| Qwen2.5-Coder-3B / Instruct-3B | Q5_K_M | 4096 | best balance on the RX 580 |
| Qwen2.5-Coder-1.5B | Q6_K | 8192 | fast, lighter |
| Qwen2.5-Coder-7B / 9B class | Q4_K_M | 1024-2048 | fits, but slow and VRAM-tight |
| 14B and larger | — | — | not practical on 8 GB |

If you run out of memory, lower these two flags first:

```bash
--ctx-size 1024     # shrink the context
--ngl 24            # offload fewer layers to the GPU (saves VRAM, costs speed)
```

---

## Notes on This Hardware

- The RX 580 is POLARIS10 / gfx803. ROCm has poor or no support for that chip on modern kernels. Vulkan through `llama.cpp` is the practical path here, not ROCm or CUDA.
- Use GGUF quantized models, not FP16 safetensors. An FP16 7B model needs about 14 GB, which will not fit in 8 GB of VRAM.
- `nvtop` is the quickest way to confirm VRAM use and to see that the GPU does the work, not the CPU.

---

## Troubleshooting Quick Reference

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Opening /dev/dri/card0 failed: Permission denied` | user not in `video` / `render` | `usermod -aG video,render <user>`, then re-login |
| `vulkaninfo` shows only `llvmpipe` | GPU not initialized | install firmware, `dracut -f`, reboot |
| `dmesg`: `Failed to load firmware "polaris10_*"` | AMD firmware missing | see Step 3 |
| `dmesg`: `Fatal error during GPU init` | firmware missing or `nomodeset` on the kernel command line | see Step 3, check `cat /proc/cmdline` |
| `llama-cli --list-devices` shows no Vulkan | built without Vulkan | rebuild with `-DGGML_VULKAN=ON` |
| Out of memory at runtime | 8 GB VRAM too tight | lower `--ctx-size`, lower `--ngl`, use a 3B Q4/Q5 model |
| Vulkan blocked with correct group membership | SELinux | run `ausearch -m avc -ts recent`, then fix the policy |

---

## What I Would Do Differently

1. Install `amd-gpu-firmware` and `amd-ucode-firmware` in the very first `dnf` command. It is one line, and it was the whole root cause.
2. Run `lspci -nnk` and `ls -l /dev/dri` **before** you install any Vulkan packages. Both pointed at firmware in under a minute.
3. Add the user to `video` and `render` when you create the account, not afterwards.
4. Run `dracut -f` and then `reboot`. Do not expect new firmware to apply to an already loaded `amdgpu` module. `rmmod` and `modprobe` are not a reliable substitute here.

---

## One-Shot Install (root)

```bash
sudo dnf -y update
sudo dnf -y install epel-release && sudo crb enable
sudo dnf -y groupinstall "Development Tools"
sudo dnf -y install cmake ninja-build ccache kernel-devel-matched kernel-headers \
    mesa-vulkan-drivers mesa-dri-drivers vulkan-loader vulkan-tools \
    vulkan-headers vulkan-loader-devel vulkan-utility-libraries-devel \
    vulkan-validation-layers glslc spirv-headers-devel spirv-tools-devel \
    pciutils vim mc htop btop nvtop \
    linux-firmware amd-gpu-firmware amd-ucode-firmware
sudo usermod -aG video,render llama-cpp
sudo dracut -f && sudo reboot
```

After the reboot, log in again as `llama-cpp`, then clone and build.

---

## The Setup Script

I wrapped the whole thing in one script so the next box takes five minutes.

```bash
cat > ~/setup-llama-cpp-vulkan.sh <<'EOF'
#!/usr/bin/env bash
#
# setup-llama-cpp-vulkan.sh
# Installs the packages needed to build and run llama.cpp with the Vulkan
# backend on an AMD RX 580 (POLARIS10) under Rocky Linux 10 / RHEL 10.
#
# Run as root:  sudo bash setup-llama-cpp-vulkan.sh
# Optional:     sudo LLAMA_USER=llama-cpp bash setup-llama-cpp-vulkan.sh
#
set -euo pipefail

LLAMA_USER="${LLAMA_USER:-llama-cpp}"

if [[ $EUID -ne 0 ]]; then
    echo "ERROR: run as root (use sudo)." >&2
    exit 1
fi

echo "==> 0. Update and enable repos"
dnf -y update
dnf -y install epel-release
# 'crb enable' is the RHEL10 shortcut, fall back to config-manager otherwise.
crb enable 2>/dev/null || dnf config-manager --set-enabled crb || true

echo "==> 1. Development toolchain"
dnf -y groupinstall "Development Tools"
dnf -y install cmake ninja-build ccache
dnf -y install kernel-devel-matched kernel-headers

echo "==> 2. Vulkan driver, loader, headers, tools"
dnf -y install \
    mesa-vulkan-drivers mesa-dri-drivers vulkan-loader vulkan-tools \
    vulkan-headers vulkan-loader-devel vulkan-utility-libraries-devel \
    vulkan-validation-layers

echo "==> 3. Shader and SPIR-V tooling (build-time deps for llama.cpp Vulkan)"
dnf -y install glslc spirv-headers-devel spirv-tools-devel

echo "==> 4. AMD GPU firmware  <-- CRITICAL for RX 580"
# Package names vary across minor releases, so do not abort the whole run
# if one optional firmware package has a different name.
for p in linux-firmware amd-gpu-firmware amd-ucode-firmware
do
    dnf -y install "$p" || echo "   (note: '$p' not available, continuing)"
done

echo "==> 5. Inspection and monitoring tools (optional)"
for p in pciutils vim mc htop btop nvtop
do
    dnf -y install "$p" || true
done

echo "==> 6. User '$LLAMA_USER' and GPU group access"
if id "$LLAMA_USER" &>/dev/null
then
    echo "   user exists, ensuring groups"
else
    useradd -m "$LLAMA_USER"
    echo "   created user $LLAMA_USER (set a password with: sudo passwd $LLAMA_USER)"
fi
usermod -aG video,render "$LLAMA_USER"

echo "==> 7. Rebuild initramfs so the GPU firmware loads early"
dracut -f

echo
echo "============================================================"
echo " Install complete."
echo " 1) REBOOT now:        sudo reboot"
echo " 2) After the reboot, as $LLAMA_USER (re-login so the groups apply):"
echo "      id                       # must list video and render"
echo "      vulkaninfo --summary     # must show AMD Radeon RX 580, not llvmpipe"
echo " 3) Build llama.cpp:"
echo "      cd ~/llama.cpp"
echo "      cmake -B build -DGGML_VULKAN=ON"
echo "      cmake --build build --config Release -- -j\$(nproc)"
echo "      ./build/bin/llama-cli --list-devices"
echo "============================================================"
EOF

chmod +x ~/setup-llama-cpp-vulkan.sh
```

Run it:

```bash
sudo bash ~/setup-llama-cpp-vulkan.sh
sudo reboot
```

---

## Summary

Building `llama.cpp` with Vulkan on Rocky Linux is easy. Making an AMD GPU expose a Vulkan ICD is the actual task. On a minimal install, the cause is usually missing firmware.

If `vulkaninfo --summary` lists your GPU instead of `llvmpipe`, the build takes care of itself. On an RX 580, pick a 3B Q5_K_M model at 4096 context and you get a usable box.
