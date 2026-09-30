---
title: How to Set Up PCI Passthrough on Proxmox
date: 2026-09-30 12:00:00 +0000
categories: [linux, proxmox, gpu]
---

Passing a GPU through to a VM on Proxmox with VFIO, step by step.

## 1. Check IOMMU Support

```bash
dmesg | grep -e DMAR -e IOMMU
```

## 2. Edit GRUB (Intel)

```bash
nano /etc/default/grub
```

Change to:

```
GRUB_CMDLINE_LINUX_DEFAULT="quiet intel_iommu=on iommu=pt"
```

For AMD, use `amd_iommu=on` instead. Then:

```bash
update-grub
```

## 3. Add VFIO Modules

```bash
nano /etc/modules
```

Add these lines:

```
vfio
vfio_iommu_type1
vfio_pci
vfio_virqfd
```

## 4. Blacklist GPU Drivers

```bash
echo "blacklist nouveau" >> /etc/modprobe.d/blacklist-gpu.conf
echo "blacklist nvidia" >> /etc/modprobe.d/blacklist-gpu.conf
echo "blacklist radeon" >> /etc/modprobe.d/blacklist-gpu.conf

update-initramfs -u
reboot
```

## 5. Find GPU PCI IDs

```bash
lspci -nn | grep -i nvidia
```

Note the IDs in brackets, e.g. `[10de:1b80]`.

## 6. Bind to VFIO

```bash
echo "options vfio-pci ids=10de:XXXX,10de:XXXX" > /etc/modprobe.d/vfio.conf
update-initramfs -u
reboot
```

Your GPU + its audio device should be alone in their IOMMU group.

## 7. Verify VFIO Is Bound

```bash
lspci -nnk | grep -A 3 nvidia
```

Should show: `Kernel driver in use: vfio-pci`

## 8. NVIDIA Code 43 Fix (VM Config)

Add to the VM config:

```
args: -cpu 'host,hidden=1,flags=+pcid'
```

> **Note:** Replace the PCI IDs with your card's actual values.
