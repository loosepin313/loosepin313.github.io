---
layout: default
---

<h1>Welcome to My Personal Website</h1>

<p>Hello! I'm Chris Harris, a passionate developer who loves creating amazing web experiences.</p>

<section class="content">
  <h2>About Me</h2>
  <p>I'm a software developer with expertise in web technologies, with a focus on creating clean, efficient, and user-friendly applications. I enjoy solving complex problems and staying up-to-date with the latest trends in technology.</p>
  
  <p>When I'm not coding, you can find me exploring new technologies, contributing to open source projects, or sharing knowledge with the developer community.</p>
  
  <h2>Recent Blog Posts</h2>
  {% for post in site.posts limit:5 %}
    <article>
      <h3><a href="{{ post.url }}">{{ post.title }}</a></h3>
      <p class="meta">{{ post.date | date: "%B %d, %Y" }}</p>
      <p>{{ post.excerpt }}</p>
    </article>
  {% endfor %}
</section>