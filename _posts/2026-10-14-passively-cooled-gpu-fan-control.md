---
title: Fan Control for Passively Cooled GPUs
date: 2026-10-14 12:00:00 +0000
categories: [linux, gpu, ai]
---

An AMD Instinct MI50 has no fan. Whatever cooling it gets comes from a case fan, and nothing on the motherboard knows the GPU exists — the BIOS fan curve is watching CPU and chipset probes. Left alone, the card sits at 90 °C+ junction under load and throttles.

The obvious fix — read the GPU temperature, spin a fan up above 65 °C — works. But it gets three things wrong in practice, and all three cost real debugging time. This is what I found, with the measurements.

Code: [gpu-fan-control](https://git.harris4.xyz/charris/gpu-fan-control)

## 1. The fan header label does not match the chip channel

The number printed on the motherboard (`FAN1`, `FAN3`, …) does **not** reliably match the channel number in the Super I/O chip (`pwm1`, `pwm3`, …).

On my MACHINIST X99 G7, the header printed **FAN3** is chip channel **pwm1**. Point the script at `pwm3` and it writes to a dead header: the loop runs, logs happily, and the fan does exactly nothing. Every sensor reading looks healthy.

The fix is a sweep — put each candidate channel into manual mode, drive it 0 → 255, and watch every tach input for a response:

```
fan controller : /sys/class/hwmon/hwmon2 (nct6779)
baseline       : fan1=3300 fan2=812  cpu=31C
--- channel 1 (enable=0 pwm=255) ---
    pwm=255 -> fan1=5212 fan2=812
    pwm=0   -> fan1=934  fan2=812
    ==> RESPONSIVE: channel 1 controls a fan
--- channel 3 (enable=0 pwm=0) ---
    pwm=255 -> fan1=3300 fan2=812
    pwm=0   -> fan1=3300 fan2=812
    no tach change - dead header or hardware-controlled
```

`fan_probe.sh` does this, restores every channel's original `enable`/`pwm` values on exit including on Ctrl-C, and watches CPU temperature so you notice fast if you happen to grab the CPU cooler channel.

## 2. `temp1` is not the sensor that matters

Do not assume `temp1_input` is "the GPU temperature". On MI50/MI60 the sensors are:

| label | what it is |
|---|---|
| `edge` | board edge / inlet temperature — slow, and flattering |
| `junction` | die hotspot — the one that runs away first |
| `mem` | HBM |

Measured at 35% fan duty: **edge 60 °C while junction was 91 °C**. Controlling on edge means the fan thinks everything is fine while the die is cooking. Control on `junction`.

Not every GPU exposes all three — a Cezanne iGPU reports only `edge` — so select the sensor by label and fall back with a warning rather than assuming.

## 3. A two-speed fan law cannot hold a temperature target

Two-position hysteresis ("max above 65 °C, min below 35 °C, hold in between") gives you one fan curve you can't tune. Proportional control across a band can actually track a target:

```
duty = MIN_PWM                                   junction <= TEMP_THRESHOLD_LOW
duty = MIN_PWM + (T - LOW) * (MAX-MIN) / span    inside the band
duty = MAX_PWM                                   junction >= TEMP_THRESHOLD_HIGH

override: junction >= CEILING_TEMP  ->  duty 255, latched until
          junction <= CEILING_TEMP - CEILING_HYSTERESIS
```

The ceiling override is separate from the control law and always wins. It is **latched**: once it trips, the fan stays at full blast until the sensor falls back by a hysteresis margin, so a reading hovering on the limit cannot flap the fan between extremes every poll.

Set the band to reach `MAX_PWM` a few degrees *before* the ceiling, not at it. The card has real thermal lag — in one test junction kept rising for ~20 seconds *after* the load stopped, from 84 °C to 92 °C. The fan has to be at full effort before the ceiling is hit.

## Calibrating it

Two things to measure: what RPM each duty actually gives, and what steady-state temperature each duty holds under load. From the second you get a thermal resistance per duty:

```
R = (peak junction - idle junction) / average watts
P_max = (ceiling - idle) / R          # the most heat your fan can remove
```

**Use a load that reproduces your real workload power.** This bit me. A synthetic compute burn (matrix multiply, hash loop) under-reports power badly on inference cards — it saturates ALUs without touching HBM bandwidth. A hand-written HIP burn on the MI50 topped out around 140–165 W while the real inference workload ran 175–225 W. Calibrating against the synthetic number gives a curve that is too quiet for the real load. I drive the actual inference endpoint instead, at production concurrency.

## The numbers

Passively cooled MI50, one 120 mm case fan on the header printed FAN3 (= chip `pwm1`), 225 W power cap, real LLM inference at 3 concurrent streams.

| duty | % | RPM | avg W | peak junction | R (°C/W) |
|---|---|---|---|---|---|
| 90 | 35 | 2350 | 170 | **84 → 92 soak** | 0.365 |
| 120 | 47 | 2990 | 146 | 78 | 0.329 |
| 160 | 62 | 3729 | 203 | 91 | 0.300 |
| 200 | 78 | 4397 | 164 | 78 | 0.293 |
| 255 | 100 | 5212 | 168 | 74 | 0.262 |

Three things fall out of this table.

**The old `MIN_PWM=90` was letting junction sit at 84–92 °C.** The two-step law was simply undersized for a 175–225 W workload.

**Diminishing returns above duty 200.** Duty 200 and duty 255 land within 4 °C of each other, so `MAX_PWM=220` — the last 35 units of duty are noise, not cooling.

**Airflow was not the only constraint.** This is the interesting one. With an 80 °C ceiling configured, the override did fire — duty went to 255 and latched — and junction *still* held 80–86 °C at 5200 RPM. At duty 255, R = 0.262 °C/W, so from a 30 °C idle junction the fan can only ever remove about `(80 − 30) / 0.262 ≈ 190 W`. Past that, the fan is no longer the problem; heat input is.

Capping the card at 180 W (via `power1_cap`) closes the gap. Re-measured under the same 3-stream load:

```
peak junction = 76 C   (ceiling 80 C)
samples over 80 C: 0 / 40
fan at full blast: 0 / 40 samples
idle: duty 60 = 1660 RPM, junction 36 C
```

That is the honest lesson: **a fan curve has a power ceiling.** Below it you get silence; above it you need a power cap, better airflow, or a bigger fan.

## Can I just use the GPU's own fan percentage?

A passively cooled MI50 exposes no `fan*_input` under the amdgpu hwmon, but the driver *does* compute a fan demand anyway: `pwm1`. It genuinely tracks temperature — it moved 37 → 63 as junction went 29 → 80 °C.

The problem is the range. The driver only ever asks for **37–63 out of 255 (14–24%)**, a window sized for the small fan this card does not have. Mirrored raw, it settles around 83–85 °C — the gain is too low to arrest the junction rise. Rescaling that window onto your fan's range fixes the range but not the low gain. I implemented it as a `mirror` mode because it's a reasonable curve *shape*, but proportional-on-junction is what actually hits a target.

## Configuration

```ini
GPU_PCI="0000:04:00.0"
GPU_HWMON_NAME="amdgpu"
FAN_HWMON_NAME="nct6779"
PWM_CHANNEL=1              # chip channel, NOT the silkscreen label

GPU_TEMP_LABEL="junction"  # not edge, not temp1
CONTROL_MODE="proportional"

TEMP_THRESHOLD_LOW=55
TEMP_THRESHOLD_HIGH=74     # 6C before the ceiling, because of thermal lag
MIN_PWM=60                 # 23% -> ~1660 RPM
MAX_PWM=220                # 86% -> ~4700 RPM

CEILING_TEMP=80
CEILING_HYSTERESIS=6

FAN_OFF_BELOW_C=""         # never stop the fan on a passive card
GPU_POWER_LIMIT_W=180
```

Devices are found by hwmon **name** and PCI address, never by `hwmonN` index — the kernel reassigns those between boots and kernel updates, which is exactly what broke my earlier hardcoded version.

## Two robustness bugs worth mentioning

**Exiting on a missing device is the wrong behaviour for a cooling service.** An earlier version of this script grepped for the GPU by PCI address and exited if it couldn't find it. The card later moved to another machine, the PCI address changed, and the service entered an endless systemd restart loop — **9,796 restarts**, providing no cooling the whole time. It now retries discovery in-process and logs what it can actually see:

```
ERROR: device discovery failed
  no hwmon named 'amdgpu' for PCI 0000:03:00.0
  present hwmon devices: acpitz it8628 jc42 nvme amdgpu k10temp ...
  retrying every 30s (Ctrl-C to stop)
```

Genuine configuration errors still exit, but the unit sets `StartLimitBurst=10` so they land in a visible `failed` state instead of spinning silently forever.

**Don't let the fan stop on a passively cooled card.** The v1 code had a branch that set PWM to 0 when the GPU was cool. On a card with no fan of its own that is actively wrong — it needs airflow even when cool. It's now an opt-in option (`FAN_OFF_BELOW_C`) documented as dangerous for this use case.

## Requirements

Linux with a hardware monitoring driver for your Super I/O chip (`nct6779`, `it87`, … — `sensors-detect` will find it), root, systemd. No dependencies beyond coreutils and `curl`.

```bash
sudo ./install.sh
sudo fan_probe.sh          # find which PWM channel your fan is actually on
sudo nano /etc/gpu-fan-control.conf
sudo systemctl restart gpu-fan-control.service
```

MIT licensed. If you have a passively cooled card in a box with a dumb fan curve, measure the curve before trusting the labels — on the board, on the sensors, and on the ceiling your cooling can actually hold.
