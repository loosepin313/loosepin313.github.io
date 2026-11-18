---
title: Bringing Up an AMD GPU for llama.cpp Vulkan on Rocky Linux
date: 2026-11-18 12:00:00 +0000
categories: [linux, ai, gpu]
---

I started a new box (`llm2`) to run `llama.cpp` with the Vulkan backend on an AMD GPU. The build itself was trivial. The real work was to make the GPU visible to Vulkan. Below is the history of that install, with notes on what each part does and where I wasted time.

For the clean package list, read my earlier post [Building llama.cpp with Vulkan on Rocky Linux 10](https://loosepin313.github.io/blog/build-llama-cpp-with-vulkan-on-rocky-linux-10/). This post is the troubleshooting story.

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
vulkaninfo --summary
nvtop        # watch VRAM and GPU use while a model runs
```

Then the normal build:

```bash
git clone https://github.com/ggml-org/llama.cpp.git
cd llama.cpp
cmake -B build -D CMAKE_BUILD_PARALLEL_LEVEL=$(nproc)
cmake --build build --config Release
./build/bin/llama-cli -h | grep -i vulkan
```

---

## What I Would Do Differently

1. Install `amd-gpu-firmware` and `amd-ucode-firmware` in the very first `dnf` command. It is one line, and it was the whole root cause.
2. Run `lspci -nnk` and `ls -l /dev/dri` **before** you install any Vulkan packages. Both pointed at firmware in under a minute.
3. Add the user to `video` and `render` when you create the account, not afterwards.
4. Run `dracut -f` and then `reboot`. Do not expect new firmware to apply to an already loaded `amdgpu` module. `rmmod` and `modprobe` are not a reliable substitute here.

---

## Summary

Building `llama.cpp` with Vulkan on Rocky Linux is easy. Making an AMD GPU expose a Vulkan ICD is the actual task. On a minimal install, the cause is usually missing firmware.

```bash
dnf -y install epel-release && crb enable
dnf -y groupinstall "Development Tools"
dnf -y install cmake ninja-build glslc spirv-headers-devel spirv-tools-devel \
               vulkan-headers vulkan-loader-devel vulkan-tools \
               mesa-vulkan-drivers mesa-dri-drivers
dnf -y install amd-gpu-firmware amd-ucode-firmware
usermod -aG render,video llama-cpp
dracut -f && reboot
vulkaninfo --summary
```

If `vulkaninfo --summary` lists your GPU, the build takes care of itself.
