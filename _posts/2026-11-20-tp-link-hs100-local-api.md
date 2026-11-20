---
title: Setting Up a TP-Link HS100 Without the Kasa App
date: 2026-11-20 09:00:00 +0000
categories: [linux, networking, rust]
---

An HS100 sitting in pairing mode, a spare wireless adapter, and no desire to hand a smart plug an account and a cloud. The TP-Link local protocol is old and well documented, so I expected twenty minutes. It took most of an evening. Almost all of the lost time came from two facts that every guide repeats and this firmware contradicts.

## The two facts every guide gets wrong

| | Guides say | This firmware does |
|---|---|---|
| Transport | UDP port 9999 | **TCP port 9999.** UDP is silent. |
| Pairing address | `192.168.0.250` | **`192.168.0.1`** |

Device under test: **HS100(AU), hardware 2.0, firmware 1.5.7 Build 191125 Rel.104256.**

The address mistake is easy to miss. The plug does hand out a DHCP lease, and your adapter does get an address on `192.168.0.0/24`. Everything looks connected. Then every command you send to `.250` goes nowhere, and `ip neigh` shows the entry stuck at `FAILED`.

The plug owns the gateway address. Read it out of ARP instead of out of a tutorial:

```bash
ip neigh show dev wlp3s0 | grep REACHABLE
# 192.168.0.1 lladdr d8:0d:17:xx:xx:xx REACHABLE   <- that is the plug
```

## The failure mode that cost the most time

Plaintext JSON is **dropped with no error message**. There is no reset, no reply, and no `err_code`. The socket accepts the connection, you write, and you get zero bytes back.

```
TCP9999 plain  -> 0 bytes
TCP9999 xor    -> 4-byte length header, then an encrypted body
```

That is the whole trap. A missing cipher looks identical to a dead device. So I spent a long stretch writing retry loops and reconnect logic. The bug was never a connection problem.

## Framing and cipher

Requests and replies both use a 4-byte big-endian length, then an XOR autokey body seeded at `171` (`0xAB`).

```text
encrypt: key = 171; for each byte b: key = key XOR b; emit key
decrypt: key = 171; for each byte c: emit key XOR c; key = c
```

The header matters on the way in as much as the cipher does. A plain `recv()` after a successful connect returns nothing useful, because the first four bytes are a length. Read the header, unpack the length, then read exactly that many bytes.

```python
sock.sendall(struct.pack(">I", len(body)) + xor_encrypt(body))
length = struct.unpack(">I", sock.recv(4))[0]
reply  = json.loads(xor_decrypt(read_exactly(sock, length)))
```

## Getting it onto the network

The plug AP is open, with no password, so joining it needs no wpa_supplicant dance:

```bash
sudo iw dev wlp3s0 connect "TP-LINK_Smart Plug_XXXX" <channel> <bssid>
ip -br addr show wlp3s0          # expect 192.168.0.x
```

Then one command carries the credentials:

```json
{"netif":{"set_stainfo":{"ssid":"mywifi","password":"hunter2","key_type":3}}}
```

The reply is `{"netif":{"set_stainfo":{"err_code":0}}}`. About 35 seconds later the AP stops broadcasting. Find the plug on the LAN by matching its MAC, not by guessing an address:

```bash
for i in $(seq 1 254); do ping -c1 -W1 192.168.1.$i >/dev/null 2>&1 & done; wait
ip neigh show dev enp4s0 | grep -i d8:0d:17
```

One detail worth knowing. The wired default route stayed preferred the whole time, at metric 100 against 20600 for the wireless link. Joining the plug AP never disturbed the existing network.

## The scan command is its own little trap

`netif.get_scaninfo` lists what the plug can see. That is handy for a hidden SSID or a 2.4 GHz problem. Two surprises:

- The list arrives under **`ap_list`**, not `networks`.
- `refresh: 1` starts a scan and then **often never replies at all**.

Start the scan, ignore that reply, wait, then read the cached list with `refresh: 0`. Entries carry only `ssid` and `key_type`. There is no RSSI and no channel.

## There is no static IP setting

This one is not a firmware quirk. The feature is simply absent. `netif.set_stainfo` accepts exactly three fields, and `netif.get_stainfo` returns only `ssid`, `key_type`, and `rssi`. The plug cannot pin its own address, and the Kasa app offers no setting for it either.

If something needs a stable address for the plug, set a DHCP reservation on the router. I left mine on a plain lease and accepted the drift.

## The tool

I wrote the whole thing twice: once in Rust, once in Python. The Rust build is the one I use, because `rustc -O plug_control.rs -o plug_control` produces a single binary with no crates and no `Cargo.toml`. The Python version uses only the standard library, including a hand-written JSON parser, so neither needs `python-kasa`.

```text
info    on      off     config      reset     reboot    scan    alias
```

```bash
./plug_control info                     # finds the plug on its own
PLUG_PASSWORD='hunter2' ./plug_control config --ssid mywifi
./plug_control reset                    # prints what it destroys, asks for 'yes'
```

Both auto-discover the address, so the pairing-address mistake stops being a trap for future-me.

## Two bugs the tests caught

**Rust `TcpStream::connect` has no timeout.** Discovery tried the pairing addresses, and on a dead one it blocked for the OS default of roughly two minutes. The tool looked hung. `connect_timeout` with a resolved `SocketAddr` fixed it, and discovery now fails in eight seconds with a readable message.

**`scan` returned an empty list with no error.** The parser was correct and the request was correct. The field name was wrong. A command that succeeds and returns nothing is harder to notice than one that fails.

## What I would do differently

- Read the plug address out of ARP before trusting any guide.
- Probe TCP before writing a single UDP packet.
- Treat an empty reply as a cipher problem, not a connectivity problem.
- Stop adding retries to a silent socket and start scanning its ports instead. A five-second port sweep showed TCP 9999 open on the first try. That is all it takes to end the guessing.

The protocol itself is fine, and pleasantly simple. The documentation is stale. The silent failure mode is what turns a wrong assumption into an hour of debugging instead of a one-line error.
