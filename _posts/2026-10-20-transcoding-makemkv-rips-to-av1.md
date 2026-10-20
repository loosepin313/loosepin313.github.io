---
title: Transcoding MakeMKV Rips to AV1
date: 2026-10-20 12:00:00 +0000
categories: [linux, ffmpeg]
---

MakeMKV copies a disc without any compression. A Blu-ray rip can hit 40 GB, and my library grew too large. So I wrote a small tool that re-encodes the rip into AV1 video and Opus audio in a Matroska container. A typical film drops to about a quarter of the size, and it still plays everywhere I watch it.

Code: [mkv-transcode](https://github.com/loosepin313/mkv-transcode)

I picked AV1 because HEVC does not play in most web browsers. AV1 plays in Chrome, Edge, Firefox, VLC 3.0+, mpv and Jellyfin. It also gives a smaller file than x265 at the same speed.

It watches an `incoming` folder, waits for the copy to finish, then names the file from a local IMDb index. It re-encodes the video with SVT-AV1, copies compatible audio, re-encodes the rest to Opus, and keeps every subtitle track. The result lands in `transcoded/Title (Year)/Title (Year).mkv`, and the source moves to `processed`.

It uses ffmpeg, ffprobe and the Python standard library only, so it pulls in no third-party Python packages.
