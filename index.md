---
layout: default
title: Home
---

<section class="hero">
    <h1>Hi, I'm Chris Harris.</h1>
    <p class="lede">Software developer focused on clean, efficient, and user-friendly software.</p>
</section>

<section>
    <h2>About me</h2>
    <p>I build web applications end to end — from the database to the UI. I enjoy solving tricky problems, keeping things simple, and staying current with new tools and techniques.</p>
    <p>When I'm not coding, you'll find me exploring new tech, contributing to open source, or writing about what I learn.</p>
</section>

<section>
    <h2>Recent posts</h2>
    {% if site.posts.size == 0 %}
        <p class="meta">Nothing published yet — check back soon.</p>
    {% endif %}
    {% for post in site.posts limit: 5 %}
        <a class="post-card" href="{{ post.url }}">
            <h3>{{ post.title }}</h3>
            <span class="meta">{{ post.date | date: "%B %-d, %Y" }}</span>
            <p class="excerpt">{{ post.excerpt | strip_html | truncatewords: 35 }}</p>
        </a>
    {% endfor %}
</section>
