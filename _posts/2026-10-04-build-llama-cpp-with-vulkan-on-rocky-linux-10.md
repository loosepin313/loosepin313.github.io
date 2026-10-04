---
title: Building llama.cpp with Vulkan on Rocky Linux 10
date: 2026-10-04 08:00:00 +0000
categories: [linux, ai, gpu]
---

[llama.cpp](https://github.com/ggml-org/llama.cpp) is the de-facto open-source project for running large language models locally. While the CPU backend is fantastic, adding **Vulkan** unlocks GPU-accelerated inference — often dramatically faster on NVIDIA, AMD, and Intel cards.

This guide walks you through compiling `llama.cpp` with Vulkan support on **Rocky Linux 10**, from installing dependencies to verifying GPU acceleration is working.

---

## Table of Contents

1. [Why Vulkan?](#why-vulkan)
2. [Hardware Requirements](#hardware-requirements)
3. [Step 1 — Install Build Tools](#step-1--install-build-tools)
4. [Step 2 — Install the Vulkan Runtime](#step-2--install-the-vulkan-runtime)
5. [Step 3 — Clone llama.cpp](#step-3--clone-llama_hpp)
6. [Step 4 — Configure the Build](#step-4--configure-the-build)
7. [Step 5 — Compile](#step-5--compile)
8. [Step 6 — Verify Vulkan Support](#step-6--verify-vulkan-support)
9. [Step 7 — Run Your First GPU-Inferenced Model](#step-7--run-your-first-gpu-inferenced-model)
10. [GPU Driver Requirements](#gpu-driver-requirements)
11. [Troubleshooting](#troubleshooting)
12. [Performance Tips](#performance-tips)

---

## Why Vulkan?

Vulkan is a low-level graphics API with excellent multi-threading and CPU-overhead characteristics that translate well to transformer inference. The `llama.cpp` Vulkan backend offloads tensor computations to your GPU while the CPU handles memory management — giving you the best of both worlds.

> **Note:** Vulkan support is **auto-detected at build time**. You don't need a special "enable" flag — you just need the Vulkan loader installed so CMake can find `libvulkan.so`.

---

## Hardware Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| CPU | Any modern x86_64 | 8+ cores, 16+ threads |
| RAM | 16 GB | 32 GB+ (models need lots of RAM for CPU-side KV cache) |
| GPU | Any with Vulkan support | NVIDIA Ada/Turing+, AMD RDNA2+, Intel Arc |
| Storage | 5 GB (source + models) | NVMe SSD for fast model IO |
| OS | Rocky Linux 10 (x86_64) | Latest stable |

---

## Step 1 — Install Build Tools

Rocky Linux 10 uses the `dnf` package manager. Install the core compilation toolchain:

```bash
sudo dnf install -y dnf-utils git cmake make gcc gcc-c++ clang ninja
```

| Package | Purpose |
|---------|---------|
| `cmake` | Build system generator |
| `git` | Clone the upstream repo |
| `make`, `ninja` | Parallel build backends (`ninja` is faster for large projects) |
| `gcc`, `gcc-c++` | C/C++ compiler |
| `clang` | Optional, for extra compiler support |

---

## Step 2 — Install the Vulkan Runtime

The Vulkan loader is what allows `llama.cpp` to discover and load your GPU's Vulkan implementation (the ICD) at runtime.

```bash
sudo dnf install -y vulkan-loader vulkan-tools libvulkan
```

| Package | Purpose |
|---------|---------|
| `vulkan-loader` | Core loader library (`libvulkan.so`) |
| `vulkan-tools` | Utilities like `vulkaninfo` for validation |
| `libvulkan` | Wrapper around the loader (ensure it's pulled in) |

Verify the loader is discoverable:

```bash
ldconfig -p | grep -i vulkan
# Should output something like: libvulkan.so.1 (libc6,x86-64) => /usr/lib/x86_64-linux-gnu/libvulkan.so.1
```

---

## Step 3 — Clone llama.cpp

```bash
git clone https://github.com/ggml-org/llama.cpp.git
cd llama.cpp

# Optional: check out a specific stable release instead of 'main'
git checkout <version-tag>   # e.g. git checkout v3.2.0
```

---

## Step 4 — Configure the Build

Generate the build directory with CMake. Vulkan is detected automatically, but you can pass a few helpful options:

```bash
cmake -B build \
    -D CMAKE_BUILD_PARALLEL_LEVEL=$(nproc) \
    -D LLAMA_BUILD_EXAMPLES=ON \
    -D VULKAN_ENABLE_BLOB_SUPPORT=ON
```

### Optional CMake Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-D CMAKE_BUILD_PARALLEL_LEVEL` | — | Sets the parallel job count (`nproc`) |
| `-D VULKAN_ENABLE_BLOB_SUPPORT=ON` | OFF | Enables blob-based Vulkan (avoids system loader reliance) |
| `-D VULKAN_USE_VULKAN_LOADER=ON` | OFF | Forces use of the Vulkan loader's ICD search |

> Vulkan has **no** `LLAMA_VULKAN=ON` toggle — if the loader is present, it builds in by default.

---

## Step 5 — Compile

```bash
cmake --build build --config Release
```

For a faster build, use Ninja instead of Make:

```bash
cmake -B build -G Ninja \
    -D CMAKE_BUILD_PARALLEL_LEVEL=$(nproc) \
    -D VULKAN_ENABLE_BLOB_SUPPORT=ON
cmake --build build
```

The full build typically takes **15–40 minutes** on a mid-range machine.

---

## Step 6 — Verify Vulkan Support

Check that Vulkan was compiled into the binaries:

```bash
./build/main -h | grep -i vulkan
```

You should see Vulkan listed among the **available backends** (e.g., `Available GGML backends: CPU, Vulkan`).

You can also inspect the shared libraries the binary links:

```bash
ldd ./build/main | grep -i vulkan
# Should reference libvulkan.so
```

---

## Step 7 — Run Your First GPU-Inferenced Model

Download a GGUF model (use [The Bloke](https://huggingface.co/TheBloke) or [Hugging Face](https://huggingface.co/)):

```bash
wget https://huggingface.co/TheBloke/Llama-2-7B-Chat-AWQ-GGUF/resolve/main/llama-2-7b-chat-awq-gguf quantized.gguf
```

Then run it, selecting the Vulkan backend explicitly:

```bash
./build/main -m quantized.gguf -b 8192 --tensor-split 0.99,0.01 \
    -c 512 -n 256 -ngl 100 -r 128
```

Key flags:

| Flag | Purpose |
|------|---------|
| `-b 8192` | Batch size (raise for more parallelism on the GPU) |
| `-ngl 100` | Number of layers to offload to the GPU (`100` = all) |
| `-t` | Number of threads (default: use all cores) |
| `-ngl -1` | Offload all layers (`-ngl 999999` also works) |

Or start the server interface:

```bash
./build/llama-server -m quantized.gguf -ngl 999999
# then: http://localhost:8080
```

**Test GPU acceleration** — compare CPU-only vs. GPU mode. If Vulkan is working, GPU mode will show much higher tokens-per-second (TPS) for batched/prefill-heavy workloads.

---

## GPU Driver Requirements

The loader finds the ICD your driver provides. Ensure your driver supports Vulkan:

### 🟠 AMD (RADV / Mesa)

The open-source stack provides Vulkan out of the box:

```bash
# Verify the RADV ICD is active
vulkaninfo | grep -A 10 "deviceName"
```

If `vulkaninfo` reports no devices, ensure the `mesa` (`radv` driver) is installed and enabled:

```bash
sudo dnf install -y mesa-dri-drivers mesa-vulkan-drivers
```

Alternatively, AMD's official **AMDGPU-PRO** / ROCm stack provides `amdocl` for Vulkan.

### 🟢 NVIDIA

Requires a **proprietary driver with Vulkan support**. The open-source `nouveau` driver has limited/no Vulkan support for compute.

- **Turing/Ada (RTX 20/30/40 series):** NVIDIA driver `525.x` or newer.
- **Blackwell (RTX 50 series):** NVIDIA driver `550.x` or newer.

```bash
# Check your current driver and Vulkan availability
nvidia-smi
vulkaninfo
```

If Vulkan is missing, update the driver:

```bash
dnf config-manager --set-enabled nvidia-driver-leiapackage   # RHEL appstream
sudo dnf install -y akmod-nvidia xorg-x11-drv-nvidia-cuda
sudo akmods --force nvidia
```

> **Tip:** The proprietary `akmod-nvidia` package provides the Vulkan ICD. If you see `NVIDIA CUDA` in `vulkaninfo`, Vulkan is available.

### 🔵 Intel (ANV / Mesa)

Intel's `anv` driver (part of Mesa) provides Vulkan:

```bash
sudo dnf install -y mesa-dri-drivers mesa-vulkan-drivers
vulkaninfo | grep -i intel
```

---

## Troubleshooting

### "Vulkan not found" / `libvulkan.so.1: cannot open shared object file`

The loader can't find the library. Add it to the library path:

```bash
sudo ldconfig
# Or, for a custom install:
export LD_LIBRARY_PATH="$LD_LIBRARY_PATH:/usr/lib64"
```

### No GPU device reported by `vulkaninfo`

Your driver lacks Vulkan. Install/enable the GPU-specific ICD (see [GPU Driver Requirements](#gpu-driver-requirements)).

### GPU works in `vulkaninfo` but slow in llama.cpp

- Lower `-b` (batch size).
- Set `-t` to match your core count.
- Try `-ngl` values; offloading *all* layers (`-ngl 999999`) is often fastest.

### Only CPU is listed in `-h`

The loader was absent at build time. Rebuild after installing `vulkan-loader`:

```bash
cmake -B build   # re-run after installing the loader
cmake --build build
```

### Out-of-memory / low VRAM

Reduce the batch size and/or model size. llama.cpp uses the CPU for the KV cache, so RAM also matters — bump physical RAM if you hit this.

---

## Performance Tips

1. **Batch size matters most.** Vulkan's biggest win is **batched generation** (prefill of the context). Raising `-b` dramatically improves throughput for chat and long-context workloads.
2. **Thread count.** Set `-t` to your core count. Vulkan handles the tensor math; threads handle memory. Over-subscribing threads can hurt.
3. **Offload aggressively.** `-ngl 999999` offloads every layer to the GPU.
4. **Use the server API** for repeated requests — it amortizes startup cost.
5. **Benchmark both backends** to pick the best per workload. GPU excels at batched/prefill; CPU can still be competitive for single-token streaming on small models.

---

## Conclusion

Compiling `llama.cpp` with Vulkan on Rocky Linux 10 is straightforward — install the loader, clone the repo, and let CMake auto-detect Vulkan. The real work is ensuring your **GPU driver ships a Vulkan ICD**, which varies by vendor (Mesa for AMD/Intel, proprietary for NVIDIA). Once that's in place, you get GPU-accelerated inference with minimal configuration.

Happy (GPU-accelerated) inference! 🚀

---
