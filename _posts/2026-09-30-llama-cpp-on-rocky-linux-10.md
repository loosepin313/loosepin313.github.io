---
title: llama.cpp on Rocky Linux 10
date: 2026-09-30 08:00:00 +0000
categories: [linux, ai, gpu]
---

Build llama.cpp with CUDA/HIP support and set up the server service.

## System Dependencies

```bash
sudo dnf groupinstall "Development Tools" -y
sudo dnf install epel-release cmake ninja -y
sudo dnf install kernel-devel-matched kernel-headers -y
```

## GPU Setup

### NVIDIA GPU

#### 1. Verify NVIDIA GPU
```bash
lspci | grep -i nvidia
```

#### 2. Add CUDA Repository
```bash
sudo dnf config-manager --add-repo \
  http://developer.download.nvidia.com/compute/cuda/repos/rhel10/$(uname -m)/cuda-rhel10.repo
sudo dnf clean expire-cache
```

#### 3. Install NVIDIA Drivers

**Option A - Open Kernel Modules (Recommended)**
For Turing, Ampere, Ada, Hopper, Blackwell GPUs:
```bash
sudo dnf install -y nvidia-open
```

**Option B - Proprietary Driver**
```bash
sudo dnf install -y cuda-drivers
```

#### 4. Install CUDA Toolkit
```bash
sudo dnf install -y cuda
# Or specific version: sudo dnf install -y cuda-13-0
```

#### 5. Verify
```bash
nvidia-smi
nvcc --version
```

#### Quick Install (Fresh Install)
```bash
sudo dnf groupinstall "Development Tools" -y
sudo dnf install epel-release cmake ninja -y
sudo dnf install kernel-devel-matched kernel-headers -y
sudo dnf config-manager --add-repo \
  http://developer.download.nvidia.com/compute/cuda/repos/rhel10/$(uname -m)/cuda-rhel10.repo
sudo dnf install -y nvidia-open cuda -y
sudo dnf update -y
sudo reboot
echo 'export PATH=/usr/local/cuda/bin:$PATH' | sudo tee /etc/profile.d/cuda.sh
echo 'export LD_LIBRARY_PATH=/usr/local/cuda/lib64:$PATH' | sudo tee -a /etc/profile.d/cuda.sh
source /etc/profile.d/cuda.sh
nvidia-smi
nvcc --version
```

### AMD GPU
```bash
sudo dnf install rocm rocm-devel rocwmma-devel -y
```

## Build llama.cpp

```bash
git clone https://github.com/ggml-org/llama.cpp.git
cd llama.cpp
```

**NVIDIA CUDA build:**
```bash
cmake -S . -B build -DGGML_CUDA=ON -DGGML_NATIVE=OFF -DCMAKE_BUILD_TYPE=Release && cmake --build build --config Release -- -j 12
```

**AMD HIP build:**
```bash
HIPCXX="$(hipconfig -l)/clang" HIP_PATH="$(hipconfig -R)" cmake -S . -B build \
  -DGGML_HIP=ON -DGGML_HIP_ROCWMMA_FATTN=ON \
  -DCMAKE_BUILD_TYPE=Release && cmake --build build --config Release -- -j 12
```

**Install:**
```bash
sudo cmake --install build
```

## Configure Library Path
```bash
echo "/usr/local/lib64" > /etc/ld.so.conf.d/usr-local-lib64.conf
sudo ldconfig
```

## Download Models
Download from [HuggingFace](https://huggingface.co/) and place in `/home/charris/models/` (or update the service file below).

## Systemd Service Setup

Create `/etc/systemd/system/llama-server.service`:

```ini
[Unit]
Description=llama.cpp server
After=network.target
[Service]
Type=simple
User=llama
Group=llama
Environment=HSA_OVERRIDE_GFX_VERSION="9.0.6"
Environment=HSA_ENABLE_SDMA="0"
Environment=HIP_VISIBLE_DEVICES="0"
WorkingDirectory=/var/lib/llama
ExecStart=/usr/local/bin/llama-server --host 0.0.0.0 --port 8080 -m /var/lib/llama/models/Qwen3.8-27B-UD-Q6_K_XL.gguf --ctx-size 131072 -ngl 99 -np 2 -fa on --jinja --load-mode none --kv-unified --spec-type draft-mtp --spec-draft-n-max 3 --batch-size 4096 --cache-type-k q4_0 --cache-type-v q4_0 --threads 8 -cram 16384
RestartSec=5
Restart=always

[Install]
WantedBy=multi-user.target

```

**Models available:**
- `/home/charris/models/Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf` (active)
- `/home/charris/models/Qwen3-Coder-30B-A3B-Instruct-UD-Q4_K_XL.gguf`
- `/home/charris/models/Qwen3-Coder-30B-A3B-Instruct-UD-Q5_K_XL.gguf`
- `/home/charris/models/llava-v1.6-mistral-7b.Q8_0.gguf`
- `/home/charris/models/Qwen2.5-Coder-32B-Instruct-Q5_K_M.gguf`

## Start the Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable llama-server
sudo systemctl start llama-server
sudo systemctl status llama-server
```
