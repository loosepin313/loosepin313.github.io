---
title: "Welcome to My Personal Website"
date: 2023-01-01T00:00:00Z
draft: false
---

<h1>Welcome to My Personal Website</h1>

<p>This is a simple personal website built with Hugo.</p>

<p>Feel free to explore my content and get in touch!</p>

<section class="content">
  <h2>Recent Pages</h2>
  {{ range first 5 .Site.RegularPages.ByDate }}
    <article>
      <h3><a href="{{ .RelPermalink }}">{{ .Title }}</a></h3>
      <p class="meta">{{ .Date.Format "January 2, 2006" }}</p>
      <p>{{ .Summary }}</p>
    </article>
  {{ end }}
</section>