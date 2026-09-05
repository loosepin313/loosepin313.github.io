---
layout: page
title: Blog
permalink: /blog/
---

All posts, newest first.

{% for post in site.posts %}
<a class="post-card" href="{{ post.url }}">
    <h3>{{ post.title }}</h3>
    <span class="meta">{{ post.date | date: "%B %-d, %Y" }}</span>
    <p class="excerpt">{{ post.excerpt | strip_html | truncatewords: 35 }}</p>
</a>
{% endfor %}
